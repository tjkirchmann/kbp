"""Document ingestion + lifecycle.

Ingest hashes the bytes, dedupes on content_hash (identical uploads reuse one row
and one object), stores the bytes in S3, and inserts a pending Document. The
extract task then drives mark_extracting → mark_extracted/mark_failed. Original
bytes live in object storage; only normalized text + metadata live in the DB.
"""
import hashlib

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.models.document import Document

_KEY_PREFIX = "documents"


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


async def ingest(
    db: AsyncSession, filename: str, data: bytes, mime: str | None = None
) -> Document:
    """Store bytes (deduped by content hash) and return a pending Document.

    Caller commits. If an identical document already exists, returns it unchanged
    rather than creating a duplicate.
    """
    content_hash = _hash(data)
    existing = (
        await db.execute(select(Document).where(Document.content_hash == content_hash))
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    key = f"{_KEY_PREFIX}/{content_hash}"
    await storage.put(key, data, content_type=mime)

    doc = Document(
        status="pending",
        filename=filename,
        mime=mime,
        content_hash=content_hash,
        storage_key=key,
        size_bytes=len(data),
    )
    db.add(doc)
    await db.flush()  # populate doc.id without forcing the caller's commit
    return doc


async def get_document(db: AsyncSession, document_id: int) -> Document | None:
    return (
        await db.execute(select(Document).where(Document.id == document_id))
    ).scalar_one_or_none()


async def mark_extracting(db: AsyncSession, document_id: int, job_id: int | None) -> None:
    await db.execute(
        update(Document)
        .where(Document.id == document_id)
        .values(status="extracting", job_id=job_id, attempts=Document.attempts + 1)
    )


async def mark_extracted(db: AsyncSession, document_id: int, text: str) -> None:
    await db.execute(
        update(Document)
        .where(Document.id == document_id)
        .values(status="extracted", text=text, text_chars=len(text), error=None)
    )


async def mark_failed(db: AsyncSession, document_id: int, error: str) -> None:
    await db.execute(
        update(Document).where(Document.id == document_id).values(status="failed", error=error)
    )
