from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_notify_config import AdminNotifyConfig
from app.models.notification_channel import NotificationChannel
from app.services.admin_config import get_discord_webhook_url


@dataclass
class NotifyConfig:
    task_name: str
    notify_on_start: bool = False
    notify_on_success: bool = False
    notify_on_failure: bool = True
    strategy: str = "discord"          # legacy; channel.strategy wins when a channel is set
    webhook_url: str | None = None     # legacy raw override; channel wins when set
    channel_name: str | None = None    # named channel for all this task's events
    run_catchup: bool = False          # fire last missed cron slot on worker restart
    run_on_startup: bool = False       # defer this task once when the app boots
    startup_stale_seconds: int | None = None  # skip startup defer if succeeded within this window
    hide_in_history: bool = False      # exclude runs from the side History rail
    cron: str | None = None            # schedule; null/blank = paused (not fired)

    @property
    def events(self) -> set[str]:
        on = set()
        if self.notify_on_start:
            on.add("start")
        if self.notify_on_success:
            on.add("success")
        if self.notify_on_failure:
            on.add("failure")
        return on


async def get_notify_config(db: AsyncSession, task_name: str) -> NotifyConfig:
    """Per-task notify settings; defaults (failure-only) when no row exists."""
    row = (
        await db.execute(
            select(AdminNotifyConfig).where(AdminNotifyConfig.task_name == task_name)
        )
    ).scalar_one_or_none()
    if row is None:
        return NotifyConfig(task_name=task_name)
    return NotifyConfig(
        task_name=row.task_name,
        notify_on_start=row.notify_on_start,
        notify_on_success=row.notify_on_success,
        notify_on_failure=row.notify_on_failure,
        strategy=row.strategy,
        webhook_url=row.webhook_url,
        channel_name=row.channel_name,
        run_catchup=row.run_catchup,
        run_on_startup=row.run_on_startup,
        startup_stale_seconds=row.startup_stale_seconds,
        hide_in_history=row.hide_in_history,
        cron=row.cron,
    )


async def set_notify_config(db: AsyncSession, task_name: str, **fields) -> None:
    """Upsert the given fields for a task. Pass exactly the columns to change.

    None values are real here (e.g. channel_name=None clears the channel); the
    caller is responsible for only passing fields it intends to write.
    """
    if not fields:
        return
    stmt = pg_insert(AdminNotifyConfig).values(task_name=task_name, **fields)
    stmt = stmt.on_conflict_do_update(index_elements=["task_name"], set_=fields)
    await db.execute(stmt)
    await db.commit()


async def resolve_channel(db: AsyncSession, channel_name: str | None) -> tuple[str, dict]:
    """Resolve a named channel into (strategy, config) for delivery.

    Used by any consumer that delivers through a notification_channels row — task
    lifecycle notifications and one-off alerts (e.g. ESPN game events) alike. A
    blank/missing/unknown name falls back to the global Discord webhook.
    """
    if channel_name:
        chan = (
            await db.execute(
                select(NotificationChannel).where(NotificationChannel.name == channel_name)
            )
        ).scalar_one_or_none()
        if chan is not None:
            return chan.strategy, dict(chan.config or {})

    return "discord", {"webhook_url": await get_discord_webhook_url(db)}


async def resolve_delivery(db: AsyncSession, cfg: NotifyConfig) -> tuple[str, dict]:
    """Resolve a task's config into (strategy, channel_config) for delivery.

    Precedence:
      1. Named channel (notification_channels.strategy + config).
      2. Legacy raw per-task webhook_url override (discord).
      3. Global Discord webhook from admin_config/env.
    """
    if cfg.channel_name:
        chan = (
            await db.execute(
                select(NotificationChannel).where(NotificationChannel.name == cfg.channel_name)
            )
        ).scalar_one_or_none()
        if chan is not None:
            return chan.strategy, dict(chan.config or {})

    if cfg.webhook_url:
        return "discord", {"webhook_url": cfg.webhook_url}

    return "discord", {"webhook_url": await get_discord_webhook_url(db)}
