from datetime import datetime

from sqlalchemy import String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class NotificationChannel(Base):
    """A named, reusable notification destination.

    A channel wraps a delivery `strategy` (discord, slack, ...) plus an arbitrary
    `config` JSON blob holding whatever that strategy needs (Discord →
    {"webhook_url": ...}). Tasks reference a channel by name; the strategy unpacks
    `config` together with the event payload at send time.
    """

    __tablename__ = "notification_channels"

    name: Mapped[str] = mapped_column(String, primary_key=True)
    strategy: Mapped[str] = mapped_column(String, nullable=False, server_default="discord")
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )
