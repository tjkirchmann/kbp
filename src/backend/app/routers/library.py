"""File library: direct-to-S3 uploads via presigned POST, with the DB as the
source of truth about lifecycle and soft-delete state.

Upload flow: presign (row status='pending') → browser uploads directly to S3 →
confirm (head_object verifies the object exists, captures real size/etag, flips
to 'uploaded'). The server never trusts the client's claim that an upload
succeeded.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_admin
from app.core.database import get_db
from app.models import LibraryFile, Project, User
from app.services import s3

router = APIRouter(prefix="/admin/library", dependencies=[Depends(require_admin)])


class PresignBody(BaseModel):
    original_name: str
    content_type: str | None = None
    # Set when uploading from within a project; NULL = global library file.
    project_id: int | None = None


class PresignResult(BaseModel):
    file_id: int
    key: str
    upload: dict  # {url, fields} for the browser's multipart POST


class LibraryFileSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    original_name: str
    content_type: str | None = None
    size_bytes: int | None = None
    status: str
    created_at: datetime
    deleted_at: datetime | None = None
    uploaded_by_user_id: int | None = None
    project_id: int | None = None


async def _get_file(db: AsyncSession, file_id: int) -> LibraryFile:
    row = (
        await db.execute(select(LibraryFile).where(LibraryFile.id == file_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="File not found")
    return row


@router.post("/presign", response_model=PresignResult)
async def presign_upload(
    body: PresignBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.project_id is not None:
        project = await db.get(Project, body.project_id)
        if project is None or project.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Project not found")
    key = s3.build_key(body.original_name)
    row = LibraryFile(
        s3_key=key,
        original_name=body.original_name,
        content_type=body.content_type,
        status="pending",
        uploaded_by_user_id=user.id,
        project_id=body.project_id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    upload = s3.create_presigned_post(key, body.content_type)
    return PresignResult(file_id=row.id, key=key, upload=upload)


@router.post("/{file_id}/confirm", response_model=LibraryFileSchema)
async def confirm_upload(file_id: int, db: AsyncSession = Depends(get_db)):
    row = await _get_file(db, file_id)
    head = s3.head_object(row.s3_key)
    if head is None:
        raise HTTPException(
            status_code=400,
            detail="Object not found in storage; upload did not complete",
        )
    row.size_bytes = head["size"]
    row.etag = head["etag"]
    if head.get("content_type"):
        row.content_type = head["content_type"]
    row.status = "uploaded"
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/files", response_model=list[LibraryFileSchema])
async def list_files(
    include_deleted: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(LibraryFile).where(LibraryFile.status == "uploaded")
    if not include_deleted:
        stmt = stmt.where(LibraryFile.deleted_at.is_(None))
    stmt = stmt.order_by(LibraryFile.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.get("/files/{file_id}/download")
async def download_file(file_id: int, db: AsyncSession = Depends(get_db)):
    row = await _get_file(db, file_id)
    if row.deleted_at is not None or row.status != "uploaded":
        raise HTTPException(status_code=404, detail="File not available")
    return {"url": s3.create_presigned_get(row.s3_key, row.original_name)}


@router.delete("/files/{file_id}")
async def soft_delete_file(file_id: int, db: AsyncSession = Depends(get_db)):
    row = await _get_file(db, file_id)
    if row.deleted_at is None:
        row.deleted_at = func.now()
        await db.commit()
    return {"ok": True}


@router.post("/files/{file_id}/restore", response_model=LibraryFileSchema)
async def restore_file(file_id: int, db: AsyncSession = Depends(get_db)):
    row = await _get_file(db, file_id)
    row.deleted_at = None
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/files/{file_id}/purge")
async def purge_file(file_id: int, db: AsyncSession = Depends(get_db)):
    """Irreversible: remove the object from S3 and delete the DB row."""
    row = await _get_file(db, file_id)
    s3.delete_object(row.s3_key)
    await db.delete(row)
    await db.commit()
    return {"ok": True}
