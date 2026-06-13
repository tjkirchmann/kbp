from datetime import datetime

from sqlalchemy import BigInteger, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Document(Base):
    """An ingested source document and its normalized text.

    Original bytes live in object storage at `storage_key` (content-addressed by
    `content_hash`, so identical uploads dedupe to one row). The `extract` task
    fills `text` with format-normalized markdown. Scheduling/run bookkeeping lives
    in Procrastinate's tables; `job_id` links the extract job for run history.
    """

    __tablename__ = "document"
    __table_args__ = (
        Index("ix_document_status", "status"),
        Index("ix_document_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # pending → extracting → extracted | failed
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="pending")
    filename: Mapped[str] = mapped_column(String, nullable=False)
    mime: Mapped[str | None] = mapped_column(String, nullable=True)
    content_hash: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    storage_key: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    text_chars: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    job_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )
