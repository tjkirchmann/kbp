import logging
import time
from datetime import datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload

from app.core.database import TaskSessionLocal as SessionLocal
from app.core.event_logger import log_event
from app.core.procrastinate import procrastinate_app as app
from app.core.rate_limiter import acquire_espn_token
from app.models.cfbd import CfbdGame
from app.models.espn import EspnGame
from app.models.event_log import EventLog
from app.models.pool import PoolGame
from app.services.admin_config import get_espn_rate_limit, get_discord_webhook_url
from app.services.discord import send_discord_alert
from app.services.espn import fetch_espn_boxscore, extract_espn_scores
from app.tasks.notify_decorator import notify

logger = logging.getLogger(__name__)

# In-process cache so the worker doesn't hit the DB on every poll tick.
_config_cache: dict = {}
_config_cache_ts: float = 0.0
_CONFIG_CACHE_TTL = 60.0

_PRE_GAME_WINDOW = timedelta(minutes=15)
_STALE_PRE_CUTOFF = timedelta(hours=2)
_EVENT_LOG_RETENTION = "7 days"


async def _get_cached_config() -> tuple[int, str]:
    global _config_cache, _config_cache_ts
    now = time.monotonic()
    if now - _config_cache_ts < _CONFIG_CACHE_TTL and _config_cache:
        return _config_cache["rate_limit"], _config_cache["webhook_url"]
    async with SessionLocal() as db:
        rate_limit = await get_espn_rate_limit(db)
    async with SessionLocal() as db:
        webhook_url = await get_discord_webhook_url(db)
    _config_cache = {"rate_limit": rate_limit, "webhook_url": webhook_url}
    _config_cache_ts = now
    return rate_limit, webhook_url


def _game_label(game: EspnGame) -> str:
    cfbd = game.cfbd_game
    if cfbd:
        return f"{cfbd.away_team} @ {cfbd.home_team}"
    return f"event {game.espn_event_id}"


async def _run_poll() -> dict:
    rate_limit, webhook_url = await _get_cached_config()
    now = datetime.utcnow()

    async with SessionLocal() as db:
        result = await db.execute(
            select(EspnGame)
            .join(EspnGame.cfbd_game)
            .options(selectinload(EspnGame.cfbd_game))
            .where(
                (EspnGame.status_state == "in")
                | EspnGame.status_state.is_(None)
                | (
                    (EspnGame.status_state == "pre")
                    & (CfbdGame.start_date <= now + _PRE_GAME_WINDOW)
                    & (CfbdGame.start_date >= now - _STALE_PRE_CUTOFF)
                )
            )
        )
        live_games: list[EspnGame] = list(result.scalars().all())

    if not live_games:
        return {"polled": 0}

    n = len(live_games)
    # Share rate limit equally across active games: n games / rate_limit req/min * 60s/min
    effective_interval = (n / rate_limit) * 60

    polled = 0

    for game in live_games:
        now = datetime.utcnow()

        # Bail out stale pre-game: start_date passed 2h ago and still pre
        if game.status_state == "pre" and game.cfbd_game.start_date < now - _STALE_PRE_CUTOFF:
            async with SessionLocal() as db:
                game_row = await db.get(EspnGame, game.id)
                if game_row:
                    game_row.status_state = "post"
                    await db.commit()
            logger.info("Marking stale pre-game %s as post", game.espn_event_id)
            continue

        # Skip if polled too recently
        if game.last_polled_at is not None:
            elapsed = (now - game.last_polled_at).total_seconds()
            if elapsed < effective_interval:
                continue

        # Try to acquire a rate limit token
        async with SessionLocal() as db:
            allowed = await acquire_espn_token(db, rate_limit)
            await db.commit()
        if not allowed:
            logger.warning("ESPN rate limit exhausted, skipping remaining games this tick")
            async with SessionLocal() as db:
                await log_event(db, "espn_poller", "rate_limited", {
                    "live_games": n,
                    "effective_interval": effective_interval,
                })
                await db.commit()
            break

        game_label = f"{game.cfbd_game.away_team} vs {game.cfbd_game.home_team}"

        # Fetch and update
        try:
            payload = await fetch_espn_boxscore(game.espn_event_id)
            extracted = extract_espn_scores(payload)
        except Exception as exc:
            label = _game_label(game)
            msg = f"⚠️ ESPN error ({label}): {exc}"
            logger.error(msg)
            await send_discord_alert(webhook_url, msg)
            async with SessionLocal() as db:
                await log_event(db, "espn_poller", "poll_error", {
                    "espn_event_id": game.espn_event_id,
                    "game_label": game_label,
                    "error": str(exc),
                })
                game_row = await db.get(EspnGame, game.id)
                if game_row:
                    game_row.last_polled_at = now
                await db.commit()
            continue

        old_state = game.status_state
        old_detail = game.status_detail or ""
        new_state = extracted["status_state"]
        new_detail = extracted["status_detail"] or ""
        home_score = extracted["home_score"]
        away_score = extracted["away_score"]
        label = _game_label(game)

        notify_msg = None
        if old_state != "in" and new_state == "in":
            notify_msg = f"\U0001f3c8 Game starting: {label} — now polling live"
        elif new_state == "in" and "halftime" in new_detail.lower() and "halftime" not in old_detail.lower():
            notify_msg = f"⏸️ Halftime: {label} | {away_score}–{home_score}"
        elif old_state != "post" and new_state == "post":
            notify_msg = f"\U0001f3c1 Final: {label} | {away_score}–{home_score}"

        if notify_msg:
            await send_discord_alert(webhook_url, notify_msg)

        async with SessionLocal() as db:
            game_row = await db.get(EspnGame, game.id)
            if game_row:
                game_row.status_state = new_state
                game_row.status_detail = new_detail
                game_row.period = extracted["period"]
                game_row.clock = extracted["clock"]
                game_row.home_score = home_score
                game_row.away_score = away_score
                game_row.raw_payload = payload
                game_row.last_polled_at = now
            await log_event(db, "espn_poller", "poll_ok", {
                "espn_event_id": game.espn_event_id,
                "game_label": game_label,
                "status_state": extracted["status_state"],
            })
            await db.commit()

        polled += 1

    await _prune_event_log()

    return {"polled": polled, "live_games": n}


async def _prune_event_log() -> None:
    """Drop event_log rows older than the retention window (replaces Redis maxlen)."""
    async with SessionLocal() as db:
        await db.execute(
            EventLog.__table__.delete().where(
                EventLog.at < text(f"now() - interval '{_EVENT_LOG_RETENTION}'")
            )
        )
        await db.commit()


async def _run_seed() -> int:
    """Insert espn_games stub rows for any pool game missing one."""
    async with SessionLocal() as db:
        # cfbd_game IDs that are in at least one pool
        pool_game_ids = select(PoolGame.cfbd_game_id).where(PoolGame.deleted_at.is_(None)).distinct()
        # of those, which already have an espn_games row
        existing_ids = select(EspnGame.cfbd_game_id)

        result = await db.execute(
            select(CfbdGame.id).where(
                CfbdGame.id.in_(pool_game_ids),
                CfbdGame.id.notin_(existing_ids),
            )
        )
        missing_ids = result.scalars().all()

        if not missing_ids:
            return 0

        rows = [{"cfbd_game_id": gid, "espn_event_id": str(gid)} for gid in missing_ids]
        stmt = pg_insert(EspnGame).values(rows).on_conflict_do_nothing(index_elements=["cfbd_game_id"])
        await db.execute(stmt)
        await db.commit()
        return len(missing_ids)


async def _alert_seed_error(exc: Exception) -> None:
    try:
        async with SessionLocal() as db:
            wh = await get_discord_webhook_url(db)
        await send_discord_alert(wh, f"⚠️ ESPN seed error: {exc}")
    except Exception:
        logger.exception("Failed to send seed error Discord alert")


@app.task(name="espn_poll", queueing_lock="espn_poll", retry=0)
@notify(task_name="espn_poll")
async def poll_live_espn_games(timestamp: int | None = None) -> dict:
    logger.debug("ESPN poller tick")
    try:
        result = await _run_poll()
        if result.get("polled", 0) > 0:
            logger.info("ESPN poll: %d/%d games updated", result["polled"], result.get("live_games", 0))
        return result
    except Exception as exc:
        # retry=0: swallow so a transient failure doesn't churn the queue.
        logger.exception("ESPN poller error: %s", exc)
        return {"error": str(exc)}


@app.task(name="espn_seed", queueing_lock="espn_seed", retry=3)
@notify(task_name="espn_seed")
async def seed_missing_espn_games(timestamp: int | None = None) -> dict:
    logger.info("Seeding missing espn_games rows")
    try:
        count = await _run_seed()
        if count:
            logger.info("Seeded %d missing espn_games rows", count)
        return {"seeded": count}
    except Exception as exc:
        logger.exception("espn seed error: %s", exc)
        await _alert_seed_error(exc)
        raise  # let Procrastinate retry (retry=3)
