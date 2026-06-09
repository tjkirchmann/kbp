from datetime import datetime

from sqlalchemy import BigInteger, Index, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EspnRateToken(Base):
    """One row per ESPN request granted within a rolling 60-second window.

    Replaces the Redis ZSET sliding-window limiter. The poller prunes entries
    older than 60s, counts the remainder, and inserts a new token if under the
    configured per-minute limit. Single-worker sequential access means no
    locking is needed.
    """

    __tablename__ = "espn_rate_tokens"
    __table_args__ = (
        Index("ix_espn_rate_tokens_acquired_at", "acquired_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    acquired_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
