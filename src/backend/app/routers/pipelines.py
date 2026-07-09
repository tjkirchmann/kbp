"""Pipeline breadboard API: graph CRUD, the step palette, run control, and the
run-status payload the editor polls (~1s while a run is active).

Route order matters: static segments (/steps, /runs/..., /artifacts/...) are
declared before the /{pipeline_id} routes so FastAPI never swallows them.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_admin
from app.core.config import settings
from app.core.database import get_db
from app.core.temporal import get_temporal_client
from app.models import Artifact, NodeRun, Pipeline, PipelineRun, Project
from app.services import s3
from app.services.pipeline.base import all_steps
from app.services.pipeline.graph import Graph, validate_graph
from app.temporal.pipeline.workflow import PipelineRunWorkflow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/pipelines", dependencies=[Depends(require_admin)])

TERMINAL_RUN_STATUSES = {"succeeded", "failed", "canceled"}

# ── schemas ──────────────────────────────────────────────────────────────────


class PipelineCreateBody(BaseModel):
    name: str


class PipelineUpdateBody(BaseModel):
    name: str | None = None
    description: str | None = None
    graph: Graph


class PipelineSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None
    graph: dict
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class PipelineSaveResult(BaseModel):
    pipeline: PipelineSchema
    # Semantic issues (cycles, bad params, unconnected ports) — WIP graphs
    # still save; these surface in the editor and block Run, not Save.
    warnings: list[str]


class StartRunBody(BaseModel):
    project_id: int


class RunSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pipeline_id: int
    project_id: int
    workflow_id: str
    status: str
    error: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class NodeRunSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    node_id: str
    step_type: str
    status: str
    progress: float | None = None
    log_tail: str | None = None
    error: str | None = None
    attempt: int
    started_at: datetime | None = None
    finished_at: datetime | None = None
    updated_at: datetime


class ArtifactSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    node_id: str
    output_port: str
    library_file_id: int | None = None
    name: str
    kind: str
    content_type: str | None = None
    size_bytes: int | None = None
    meta: dict
    created_at: datetime


class RunStatusResponse(BaseModel):
    run: RunSchema
    node_runs: list[NodeRunSchema]
    artifacts: list[ArtifactSchema]


# ── helpers ──────────────────────────────────────────────────────────────────


async def _get_pipeline(db: AsyncSession, pipeline_id: int) -> Pipeline:
    row = (
        await db.execute(select(Pipeline).where(Pipeline.id == pipeline_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return row


async def _get_run(db: AsyncSession, run_id: int) -> PipelineRun:
    row = (
        await db.execute(select(PipelineRun).where(PipelineRun.id == run_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return row


# ── static routes (before /{pipeline_id}) ────────────────────────────────────


@router.get("/steps")
async def step_palette():
    """The registry contract the editor builds its palette + forms from."""
    return [step.palette_entry() for step in all_steps()]


@router.get("/runs/{run_id}", response_model=RunStatusResponse)
async def run_status(run_id: int, db: AsyncSession = Depends(get_db)):
    """The live-observability payload — DB-only, so it works identically
    against self-hosted Temporal and Temporal Cloud."""
    run = await _get_run(db, run_id)
    node_runs = (
        (
            await db.execute(
                select(NodeRun).where(NodeRun.run_id == run_id).order_by(NodeRun.id)
            )
        )
        .scalars()
        .all()
    )
    artifacts = (
        (
            await db.execute(
                select(Artifact)
                .where(Artifact.run_id == run_id, Artifact.deleted_at.is_(None))
                .order_by(Artifact.id)
            )
        )
        .scalars()
        .all()
    )
    return RunStatusResponse(
        run=RunSchema.model_validate(run),
        node_runs=[NodeRunSchema.model_validate(nr) for nr in node_runs],
        artifacts=[ArtifactSchema.model_validate(a) for a in artifacts],
    )


@router.post("/runs/{run_id}/cancel", response_model=RunSchema)
async def cancel_run(run_id: int, db: AsyncSession = Depends(get_db)):
    run = await _get_run(db, run_id)
    if run.status in TERMINAL_RUN_STATUSES:
        raise HTTPException(status_code=409, detail=f"Run already {run.status}")
    try:
        client = await get_temporal_client()
        await client.get_workflow_handle(run.workflow_id).cancel()
    except Exception:
        logger.exception("cancel failed for run %s", run_id)
        raise HTTPException(status_code=503, detail="Temporal unreachable")
    # The workflow's shielded finalize_run records the terminal state; until
    # then the run keeps polling as running/queued.
    return run


@router.get("/artifacts/{artifact_id}/preview")
async def artifact_preview(artifact_id: int, db: AsyncSession = Depends(get_db)):
    """Inline presigned GET for <video>/<img>/<audio> src. Fetched fresh on
    every dialog open — presigned URLs expire and must never be cached."""
    artifact = await db.get(Artifact, artifact_id)
    if artifact is None or artifact.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {"url": s3.create_preview_presigned_get(artifact.s3_key)}


@router.get("/artifacts/{artifact_id}/download")
async def artifact_download(artifact_id: int, db: AsyncSession = Depends(get_db)):
    artifact = await db.get(Artifact, artifact_id)
    if artifact is None or artifact.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {"url": s3.create_presigned_get(artifact.s3_key, artifact.name)}


# ── pipeline CRUD ────────────────────────────────────────────────────────────


@router.get("/", response_model=list[PipelineSchema])
async def list_pipelines(
    include_deleted: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Pipeline)
    if not include_deleted:
        stmt = stmt.where(Pipeline.deleted_at.is_(None))
    stmt = stmt.order_by(Pipeline.updated_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("/", response_model=PipelineSchema)
async def create_pipeline(body: PipelineCreateBody, db: AsyncSession = Depends(get_db)):
    row = Pipeline(name=body.name, graph=Graph().model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/{pipeline_id}", response_model=PipelineSchema)
async def get_pipeline(pipeline_id: int, db: AsyncSession = Depends(get_db)):
    return await _get_pipeline(db, pipeline_id)


@router.put("/{pipeline_id}", response_model=PipelineSaveResult)
async def update_pipeline(
    pipeline_id: int,
    body: PipelineUpdateBody,
    db: AsyncSession = Depends(get_db),
):
    row = await _get_pipeline(db, pipeline_id)
    if body.name is not None:
        row.name = body.name
    if body.description is not None:
        row.description = body.description
    # Pydantic already hard-rejected structural garbage; semantic issues are
    # warnings so a half-built graph still saves.
    row.graph = body.graph.model_dump()
    warnings = validate_graph(body.graph)
    await db.commit()
    await db.refresh(row)
    return PipelineSaveResult(
        pipeline=PipelineSchema.model_validate(row), warnings=warnings
    )


@router.delete("/{pipeline_id}")
async def soft_delete_pipeline(pipeline_id: int, db: AsyncSession = Depends(get_db)):
    row = await _get_pipeline(db, pipeline_id)
    if row.deleted_at is None:
        row.deleted_at = func.now()
        await db.commit()
    return {"ok": True}


# ── runs ─────────────────────────────────────────────────────────────────────


@router.post("/{pipeline_id}/run", response_model=RunSchema)
async def start_run(
    pipeline_id: int, body: StartRunBody, db: AsyncSession = Depends(get_db)
):
    pipeline = await _get_pipeline(db, pipeline_id)
    if pipeline.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    project = await db.get(Project, body.project_id)
    if project is None or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")

    graph = Graph.model_validate(pipeline.graph)
    problems = validate_graph(graph)
    if not graph.nodes:
        problems.append("graph has no nodes")
    if problems:
        raise HTTPException(
            status_code=422,
            detail={"message": "Graph is not runnable", "problems": problems},
        )

    run = PipelineRun(
        pipeline_id=pipeline.id,
        project_id=project.id,
        graph=pipeline.graph,
        workflow_id="pending",
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    run.workflow_id = f"pipeline-run-{run.id}"
    await db.commit()

    try:
        client = await get_temporal_client()
        await client.start_workflow(
            PipelineRunWorkflow.run,
            run.id,
            id=run.workflow_id,
            task_queue=settings.temporal_task_queue,
        )
    except Exception as exc:
        logger.exception("failed to start workflow for run %s", run.id)
        run.status = "failed"
        run.error = f"failed to start workflow: {exc}"
        run.finished_at = func.now()
        await db.commit()
        raise HTTPException(status_code=503, detail="Temporal unreachable")

    await db.refresh(run)
    return run


@router.get("/{pipeline_id}/runs", response_model=list[RunSchema])
async def run_history(
    pipeline_id: int,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    await _get_pipeline(db, pipeline_id)
    stmt = (
        select(PipelineRun)
        .where(PipelineRun.pipeline_id == pipeline_id)
        .order_by(PipelineRun.id.desc())
        .limit(limit)
    )
    return (await db.execute(stmt)).scalars().all()
