from datetime import datetime

from sqlalchemy import BigInteger, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EventLog(Base):
    """Append-only operational event stream (poll results, rate-limit hits, etc).

    Replaces the Redis `kbp:events` stream. Retention is by age (pruned in the
    poller) rather than a fixed maxlen.
    """

    __tablename__ = "event_log"
    __table_args__ = (Index("ix_event_log_at", "at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    source: Mapped[str] = mapped_column(String, nullable=False)
    event: Mapped[str] = mapped_column(String, nullable=False)
    payload: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
