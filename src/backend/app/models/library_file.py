from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LibraryFile(Base):
    """A file tracked in the webapp filesystem. The DB row is the source of
    truth about lifecycle (pending → uploaded) and soft-delete state; the bytes
    live in S3 under ``s3_key``."""

    __tablename__ = "library_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    s3_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    original_name: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String, nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    etag: Mapped[str | None] = mapped_column(String, nullable=True)
    # 'pending' on presign; 'uploaded' once confirm verifies the object in S3.
    status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="pending"
    )
    uploaded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    # NULL = global library file; set when uploaded from within a project.
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)
