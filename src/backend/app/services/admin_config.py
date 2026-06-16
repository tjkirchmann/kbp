from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models.admin_config import AdminConfig
from app.core.config import settings

_ESPN_RATE_LIMIT_KEY = "espn_rate_limit_per_minute"
_ESPN_ALERT_CHANNEL_KEY = "espn_alert_channel"   # notification_channels.name; "" = global webhook
_DISCORD_WEBHOOK_KEY = "discord_webhook_url"
# Discord bot runtime config (token/guild come from env; behavior lives in the DB).
_BOT_ENABLED_KEY = "discord_bot_enabled"
_BOT_LISTEN_CHANNELS_KEY = "discord_bot_listen_channels"   # comma-separated channel ids
_BOT_COMMAND_CHANNEL_KEY = "discord_bot_command_channel"   # default reply / notify channel id


async def get_config(db: AsyncSession, key: str, default: str = "") -> str:
    result = await db.execute(select(AdminConfig).where(AdminConfig.key == key))
    row = result.scalar_one_or_none()
    return row.value if row is not None else default


async def set_config(db: AsyncSession, key: str, value: str) -> None:
    stmt = pg_insert(AdminConfig).values(key=key, value=value)
    stmt = stmt.on_conflict_do_update(index_elements=["key"], set_={"value": stmt.excluded.value})
    await db.execute(stmt)
    await db.commit()


async def get_espn_rate_limit(db: AsyncSession) -> int:
    val = await get_config(db, _ESPN_RATE_LIMIT_KEY, default="60")
    try:
        return max(1, int(val))
    except (ValueError, TypeError):
        return 60


async def get_espn_alert_channel(db: AsyncSession) -> str:
    """Named notification channel for ESPN game/poll alerts. "" → global webhook."""
    return (await get_config(db, _ESPN_ALERT_CHANNEL_KEY, default="")).strip()


async def get_discord_webhook_url(db: AsyncSession) -> str:
    # Falls back to settings.discord_webhook_url (env var) if DB row absent
    return await get_config(db, _DISCORD_WEBHOOK_KEY, default=settings.discord_webhook_url)


async def get_bot_enabled(db: AsyncSession) -> bool:
    """Whether the bot should process inbound events. Default off until configured."""
    return (await get_config(db, _BOT_ENABLED_KEY, default="false")).strip().lower() == "true"


async def get_bot_listen_channels(db: AsyncSession) -> set[str]:
    """Allowlisted channel ids for the relay listener. Empty set → allow none."""
    raw = await get_config(db, _BOT_LISTEN_CHANNELS_KEY, default="")
    return {c.strip() for c in raw.split(",") if c.strip()}


async def get_bot_command_channel(db: AsyncSession) -> str:
    """Default channel id for bot posts (notifications / replies). May be blank."""
    return (await get_config(db, _BOT_COMMAND_CHANNEL_KEY, default="")).strip()
