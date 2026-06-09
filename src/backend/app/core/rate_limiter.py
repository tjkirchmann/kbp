from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rate_limit import EspnRateToken


async def acquire_espn_token(db: AsyncSession, rate_limit_per_minute: int) -> bool:
    """Postgres sliding-window rate limiter.

    Returns True if a token was acquired (request allowed), False if the limit
    is already exhausted for the current 60-second window. The caller is the
    single, sequential poll loop, so a plain check-then-insert is correct —
    there is no concurrent acquisition to overshoot. The caller commits.
    """
    await db.execute(
        delete(EspnRateToken).where(
            EspnRateToken.acquired_at < func.now() - text("interval '60 seconds'")
        )
    )
    count = await db.scalar(select(func.count()).select_from(EspnRateToken))
    if count >= rate_limit_per_minute:
        return False
    db.add(EspnRateToken())
    return True
