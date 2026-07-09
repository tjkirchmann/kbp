"""Projects: user-owned workspaces that own library files and pipeline runs.

Pipelines stay a global shared catalog — a project doesn't own them; the run
records which project it executed in. Artifacts inherit project ownership
through their run, so this router only needs files + runs reads on top of CRUD.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_admin
from app.core.database import get_db
from app.models import LibraryFile, Pipeline, PipelineRun, Project, User
from app.routers.library import LibraryFileSchema
from app.routers.pipelines import RunSchema

router = APIRouter(prefix="/admin/projects", dependencies=[Depends(require_admin)])


class ProjectCreateBody(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdateBody(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None
    owner_id: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class ProjectRunSchema(RunSchema):
    pipeline_name: str


async def _get_project(db: AsyncSession, project_id: int) -> Project:
    row = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return row


@router.get("/", response_model=list[ProjectSchema])
async def list_projects(
    include_deleted: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Project)
    if not include_deleted:
        stmt = stmt.where(Project.deleted_at.is_(None))
    stmt = stmt.order_by(Project.updated_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("/", response_model=ProjectSchema)
async def create_project(
    body: ProjectCreateBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = Project(name=body.name, description=body.description, owner_id=user.id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/{project_id}", response_model=ProjectSchema)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    return await _get_project(db, project_id)


@router.patch("/{project_id}", response_model=ProjectSchema)
async def update_project(
    project_id: int,
    body: ProjectUpdateBody,
    db: AsyncSession = Depends(get_db),
):
    row = await _get_project(db, project_id)
    if body.name is not None:
        row.name = body.name
    if body.description is not None:
        row.description = body.description
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{project_id}")
async def soft_delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    row = await _get_project(db, project_id)
    if row.deleted_at is None:
        row.deleted_at = func.now()
        await db.commit()
    return {"ok": True}


@router.get("/{project_id}/files", response_model=list[LibraryFileSchema])
async def project_files(project_id: int, db: AsyncSession = Depends(get_db)):
    await _get_project(db, project_id)
    stmt = (
        select(LibraryFile)
        .where(
            LibraryFile.project_id == project_id,
            LibraryFile.status == "uploaded",
            LibraryFile.deleted_at.is_(None),
        )
        .order_by(LibraryFile.created_at.desc())
    )
    return (await db.execute(stmt)).scalars().all()


@router.get("/{project_id}/runs", response_model=list[ProjectRunSchema])
async def project_runs(
    project_id: int,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    await _get_project(db, project_id)
    stmt = (
        select(PipelineRun, Pipeline.name)
        .join(Pipeline, Pipeline.id == PipelineRun.pipeline_id)
        .where(PipelineRun.project_id == project_id)
        .order_by(PipelineRun.id.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        ProjectRunSchema(
            **RunSchema.model_validate(run).model_dump(), pipeline_name=name
        )
        for run, name in rows
    ]
