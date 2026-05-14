import asyncio
import logging
import time
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy import select

from app.celery_app import celery_app
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.rate_limiter import acquire_espn_token
from app.models.espn import EspnGame
from app.services.admin_config import get_espn_rate_limit, get_discord_webhook_url
from app.services.discord import send_discord_alert
from app.services.espn import fetch_espn_boxscore, extract_espn_scores

logger = logging.getLogger(__name__)

# In-process cache so each Celery worker doesn't hit the DB on every 30s tick
_config_cache: dict = {}
_config_cache_ts: float = 0.0
_CONFIG_CACHE_TTL = 60.0


async def _get_cached_config(db) -> tuple[int, str]:
    global _config_cache, _config_cache_ts
    now = time.monotonic()
    if now - _config_cache_ts < _CONFIG_CACHE_TTL and _config_cache:
        return _config_cache["rate_limit"], _config_cache["webhook_url"]
    rate_limit = await get_espn_rate_limit(db)
    webhook_url = await get_discord_webhook_url(db)
    _config_cache = {"rate_limit": rate_limit, "webhook_url": webhook_url}
    _config_cache_ts = now
    return rate_limit, webhook_url


async def _run_poll() -> dict:
    async with SessionLocal() as db:
        rate_limit, webhook_url = await _get_cached_config(db)

        # Fetch games that are live (status_state='in') or recently created without a terminal state
        result = await db.execute(
            select(EspnGame).where(EspnGame.status_state.in_(["in", None]))
        )
        live_games: list[EspnGame] = list(result.scalars().all())

    if not live_games:
        return {"polled": 0}

    n = len(live_games)
    # Effective per-game interval: share rate limit equally, floor at 60s
    effective_interval = max(60, n)

    redis_client = aioredis.from_url(settings.redis_url)
    polled = 0

    try:
        for game in live_games:
            now = datetime.now(tz=timezone.utc)

            # Skip if polled too recently
            if game.last_polled_at is not None:
                elapsed = (now - game.last_polled_at.replace(tzinfo=timezone.utc)).total_seconds()
                if elapsed < effective_interval:
                    continue

            # Try to acquire a rate limit token
            allowed = await acquire_espn_token(redis_client, rate_limit)
            if not allowed:
                logger.warning("ESPN rate limit exhausted, skipping remaining games this tick")
                break

            # Fetch and update
            try:
                payload = await fetch_espn_boxscore(game.espn_event_id)
                extracted = extract_espn_scores(payload)
            except Exception as exc:
                msg = f"Bad ESPN response for event {game.espn_event_id}: {exc}"
                logger.error(msg)
                async with SessionLocal() as db:
                    wh = await get_discord_webhook_url(db)
                await send_discord_alert(wh, msg)
                async with SessionLocal() as db:
                    game_row = await db.get(EspnGame, game.id)
                    if game_row:
                        game_row.last_polled_at = now
                        await db.commit()
                continue

            async with SessionLocal() as db:
                game_row = await db.get(EspnGame, game.id)
                if game_row:
                    game_row.status_state = extracted["status_state"]
                    game_row.status_detail = extracted["status_detail"]
                    game_row.period = extracted["period"]
                    game_row.clock = extracted["clock"]
                    game_row.home_score = extracted["home_score"]
                    game_row.away_score = extracted["away_score"]
                    game_row.raw_payload = payload
                    game_row.last_polled_at = now
                    await db.commit()

            polled += 1
    finally:
        await redis_client.aclose()

    return {"polled": polled, "live_games": n}


@celery_app.task(
    name="app.tasks.espn_poller.poll_live_espn_games",
    bind=True,
    max_retries=0,
)
def poll_live_espn_games(self):
    logger.debug("ESPN poller tick")
    try:
        result = asyncio.run(_run_poll())
        if result["polled"] > 0:
            logger.info("ESPN poll: %d/%d games updated", result["polled"], result.get("live_games", 0))
        return result
    except Exception as exc:
        logger.exception("ESPN poller error: %s", exc)
        return {"error": str(exc)}
