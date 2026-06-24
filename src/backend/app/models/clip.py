import enum
from datetime import datetime

from sqlalchemy import Enum, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ClipStatus(enum.StrEnum):
    ready = "ready"
    failed = "failed"


class Clip(Base):
    """A processable video segment derived from a source ``LibraryFile``. The
    central object of the video-processing pipeline. Many clips can derive from
    one source file (N:1). Video metadata is probed from the source mp4 at
    creation time; if probing fails the row is still written with
    ``status='failed'`` and null metadata to record the attempt."""

    __tablename__ = "clips"

    id: Mapped[int] = mapped_column(primary_key=True)
    library_file_id: Mapped[int] = mapped_column(
        ForeignKey("library_files.id"), nullable=False, index=True
    )
    status: Mapped[ClipStatus] = mapped_column(
        Enum(ClipStatus, name="clip_status"),
        nullable=False,
        server_default=ClipStatus.ready.value,
    )
    # Probed via ffprobe. Null when status='failed'.
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Raw ffprobe avg_frame_rate fraction (e.g. "30000/1001") — kept lossless;
    # NTSC rates like 29.97 can't be represented exactly as a float.
    fps: Mapped[str | None] = mapped_column(String, nullable=True)
    codec: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)
