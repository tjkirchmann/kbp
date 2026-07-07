from datetime import datetime

from sqlalchemy import BigInteger, Index, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SyncSnapshot(Base):
    """Append-only history of provider payloads, deduped by content hash.

    Scheduling/run bookkeeping lives in Temporal's visibility store; this table
    only versions the domain data we ingest.
    """

    __tablename__ = "sync_snapshots"
    __table_args__ = (
        Index(
            "ix_sync_snapshots_entity_captured",
            "entity_type",
            "entity_id",
            "captured_at",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str] = mapped_column(String, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    content_hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)
