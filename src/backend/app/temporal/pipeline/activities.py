"""Temporal activities for pipeline runs.

All data (graph, artifacts, status) moves through the DB and S3 — Temporal
payloads carry only ids and the small deps plan, so runs are Temporal Cloud
2MB-safe. Every activity opens its own ``TaskSessionLocal`` session and is
idempotent (node_runs are keyed on ``(run_id, node_id)``; a retried node
re-runs cleanly and its artifacts get fresh keys).

Live observability happens here: activities write per-node status/progress/
log-tail rows that the frontend polls — deliberately DB-backed, not Temporal
queries, so the surface survives the move to Temporal Cloud unchanged.
"""

import asyncio
import logging
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import delete, select, update
from temporalio import activity
from temporalio.exceptions import ApplicationError

from app.core.config import settings
from app.core.database import TaskSessionLocal
from app.models.pipeline import Artifact, NodeRun, PipelineRun
from app.services.pipeline.base import (
    ArtifactKind,
    ArtifactRef,
    StepContext,
    StepParamError,
    get_step,
)
from app.services.pipeline.graph import Graph, build_deps, validate_graph

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


@activity.defn
async def prepare_run(run_id: int) -> dict:
    """Validate the frozen graph snapshot, seed queued node_runs, mark the run
    running. Returns the small execution plan the workflow orchestrates with."""
    async with TaskSessionLocal() as db:
        run = await db.get(PipelineRun, run_id)
        if run is None:
            raise ApplicationError(f"run {run_id} not found", non_retryable=True)

        graph = Graph.model_validate(run.graph)
        problems = validate_graph(graph)
        if not graph.nodes:
            problems.append("graph has no nodes")
        if problems:
            run.status = "failed"
            run.error = "; ".join(problems)
            run.finished_at = _now()
            await db.commit()
            raise ApplicationError(
                f"invalid graph: {'; '.join(problems)}", non_retryable=True
            )

        # Idempotent seed: a retried prepare_run replaces its own queued rows.
        await db.execute(delete(NodeRun).where(NodeRun.run_id == run_id))
        for node in graph.nodes:
            db.add(NodeRun(run_id=run_id, node_id=node.id, step_type=node.type))
        run.status = "running"
        run.started_at = _now()
        await db.commit()

    return {
        "deps": {nid: [list(d) for d in dep] for nid, dep in build_deps(graph).items()},
        "media_task_queue": settings.temporal_media_task_queue,
    }


@activity.defn
async def run_node(run_id: int, node_id: str) -> None:
    """Execute one node: resolve input artifacts from the DB, run the step in a
    scratch dir, record status transitions on the node_runs row throughout."""
    async with TaskSessionLocal() as db:
        run = await db.get(PipelineRun, run_id)
        if run is None:
            raise ApplicationError(
                f"Pipeline run {run_id} not found", non_retryable=True
            )
        graph = Graph.model_validate(run.graph)
        node = next(n for n in graph.nodes if n.id == node_id)
        step = get_step(node.type)
        if step is None:
            raise ApplicationError(
                f"Unknown step type '{node.type}'", non_retryable=True
            )

        inputs: dict[str, ArtifactRef] = {}
        for up_node, up_port, my_port in build_deps(graph)[node_id]:
            artifact = (
                await db.execute(
                    select(Artifact).where(
                        Artifact.run_id == run_id,
                        Artifact.node_id == up_node,
                        Artifact.output_port == up_port,
                    )
                )
            ).scalar_one()
            inputs[my_port] = ArtifactRef(
                s3_key=artifact.s3_key,
                kind=ArtifactKind(artifact.kind),
                artifact_id=artifact.id,
                library_file_id=artifact.library_file_id,
                meta=artifact.meta or {},
            )

        await db.execute(
            update(NodeRun)
            .where(NodeRun.run_id == run_id, NodeRun.node_id == node_id)
            .values(
                status="running",
                started_at=_now(),
                finished_at=None,
                error=None,
                progress=None,
                attempt=activity.info().attempt,
            )
        )
        await db.commit()

    scratch = Path(tempfile.mkdtemp(prefix=f"pipe-{run_id}-{node_id}-"))
    ctx = StepContext(run_id, node_id, scratch)
    try:
        params = step.Params.model_validate(node.params)
        await step.run(ctx, params, inputs)
    except StepParamError as exc:
        await _finish_node(ctx, "failed", str(exc))
        raise ApplicationError(str(exc), type="StepParamError", non_retryable=True)
    except asyncio.CancelledError:
        await _finish_node(ctx, "canceled", None)
        raise
    except Exception as exc:
        await _finish_node(ctx, "failed", str(exc) or exc.__class__.__name__)
        raise
    else:
        await _finish_node(ctx, "succeeded", None)
    finally:
        ctx.cleanup()


async def _finish_node(ctx: StepContext, status: str, error: str | None) -> None:
    """Terminal node_run transition + final log/progress flush."""
    async with TaskSessionLocal() as db:
        await db.execute(
            update(NodeRun)
            .where(NodeRun.run_id == ctx.run_id, NodeRun.node_id == ctx.node_id)
            .values(status=status, error=error, finished_at=_now())
        )
        await db.commit()
    try:
        await ctx.flush()
    except Exception:  # a lost log tail must not mask the real outcome
        logger.exception("final node_run flush failed")


@activity.defn
async def finalize_run(run_id: int, status: str, error: str | None = None) -> None:
    """Terminal run transition; nodes that never started become ``skipped``.

    On cancel, any node still marked running is swept to ``canceled`` too —
    normally its own activity records that first (the workflow waits for
    cancellation to complete), but a dead worker can't, and a canceled run
    must never show a running node."""
    async with TaskSessionLocal() as db:
        await db.execute(
            update(PipelineRun)
            .where(PipelineRun.id == run_id)
            .values(status=status, error=error, finished_at=_now())
        )
        await db.execute(
            update(NodeRun)
            .where(NodeRun.run_id == run_id, NodeRun.status == "queued")
            .values(status="skipped", finished_at=_now())
        )
        if status == "canceled":
            await db.execute(
                update(NodeRun)
                .where(NodeRun.run_id == run_id, NodeRun.status == "running")
                .values(status="canceled", finished_at=_now())
            )
        await db.commit()
