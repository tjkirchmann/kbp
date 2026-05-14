from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models.admin_config import AdminConfig
from app.core.config import settings

_ESPN_RATE_LIMIT_KEY = "espn_rate_limit_per_minute"
_DISCORD_WEBHOOK_KEY = "discord_webhook_url"


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


async def get_discord_webhook_url(db: AsyncSession) -> str:
    # Falls back to settings.discord_webhook_url (env var) if DB row absent
    return await get_config(db, _DISCORD_WEBHOOK_KEY, default=settings.discord_webhook_url)
