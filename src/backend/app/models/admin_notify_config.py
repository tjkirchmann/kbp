from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AdminNotifyConfig(Base):
    """Per-task notification settings for Procrastinate workflows.

    One row per task_name. Absent row → defaults (failure-only, no channel,
    catch-up off). `channel_name` selects a named notification_channels row for
    all of this task's events; null falls back to the built-in `none` channel,
    i.e. silence (no delivery).
    """

    __tablename__ = "admin_notify_config"

    task_name: Mapped[str] = mapped_column(String, primary_key=True)
    notify_on_start: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    notify_on_success: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    notify_on_failure: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    strategy: Mapped[str] = mapped_column(
        String, nullable=False, server_default="discord"
    )
    # Named channel for all of this task's events (FK -> notification_channels.name).
    channel_name: Mapped[str | None] = mapped_column(
        ForeignKey("notification_channels.name", ondelete="SET NULL"), nullable=True
    )
    # Fire the last missed cron slot on worker restart (Procrastinate catch-up).
    run_catchup: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # Defer this task once when the app boots (independent of cron/catch-up).
    run_on_startup: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # If set, skip the startup defer when the task succeeded within this many
    # seconds (data is fresh enough). Null → always run on startup.
    startup_stale_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Exclude this task's runs from the side History rail (past + future).
    hide_in_history: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # Cron schedule (DB is the sole source). Null/blank = paused (not fired).
    # Run-only tasks (e.g. espn_seed) stay null and are never periodic.
    cron: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )
