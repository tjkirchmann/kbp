"""Activities for ESPN live-game polling — all the I/O lives here.

The poll logic is
preserved; only the orchestration changed: the old single ``_run_poll`` loop is
split into a per-game ``poll_espn_game`` activity (driven by ``EspnGameWorkflow``)
plus selection/seed/maintenance activities (driven by ``EspnSeederWorkflow``).

``poll_espn_game`` is the rate-limited unit: it runs on the dedicated ``espn``
task queue, whose ``max_task_queue_activities_per_second`` budget is the global
ESPN request limit — replacing the old DB token bucket entirely.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload
from temporalio import activity

from app.core.config import settings
from app.core.database import TaskSessionLocal as SessionLocal
from app.core.event_logger import log_event
from app.models.cfbd import CfbdGame
from app.models.espn import EspnGame
from app.models.event_log import EventLog
from app.models.pool import PoolGame
from app.services.admin_config import get_espn_alert_channel
from app.services.espn import extract_espn_scores, fetch_espn_boxscore
from app.services.notifications import notification_service
from app.services.notify_config import resolve_channel

logger = logging.getLogger(__name__)

# A pre-game starts polling this far before kickoff; a pre-game that's still "pre"
# this long after its scheduled start is abandoned as stale (carried over verbatim
# from the old poller).
_PRE_GAME_WINDOW = timedelta(minutes=15)
_STALE_PRE_CUTOFF = timedelta(hours=2)
_EVENT_LOG_RETENTION = "7 days"


@dataclass
class PollResult:
    """What the game workflow needs to decide loop-vs-exit. Small + JSON-friendly;
    the heavy raw payload never crosses the workflow boundary."""

    status_state: str | None  # "pre" | "in" | "post" | None (not yet polled)
    polled: bool  # False when skipped (e.g. stale pre-game marked post)
    terminal: bool  # True when the game is done — the workflow should exit


# --- notifications ----------------------------------------------------------
async def _send_alert(message: str) -> None:
    """Deliver an ESPN alert through the configured notification channel.

    Resolves the admin-selected channel (or the global webhook fallback) and hands
    the pre-formatted text to the notification service, which never raises. A
    channel with strategy="none" silently drops it.
    """
    async with SessionLocal() as db:
        strategy, config = await resolve_channel(db, await get_espn_alert_channel(db))
    await notification_service.notify(
        strategy=strategy, config=config, event="message", payload={"text": message}
    )


def _game_label(game: EspnGame) -> str:
    cfbd = game.cfbd_game
    if cfbd:
        return f"{cfbd.away_team} @ {cfbd.home_team}"
    return f"event {game.espn_event_id}"


# --- seeder activities ------------------------------------------------------
@activity.defn
async def get_espn_poll_task_queue() -> str:
    """The rate-limited queue the poll activity runs on (settings access is I/O,
    so the workflow reads it through this activity rather than directly)."""
    return settings.temporal_espn_task_queue


@activity.defn
async def seed_missing_games() -> int:
    """Insert espn_games stub rows for any pool game missing one.

    Ported from the former ``espn_seed`` task / ``_run_seed``.
    """
    async with SessionLocal() as db:
        # cfbd_game IDs that are in at least one pool
        pool_game_ids = (
            select(PoolGame.cfbd_game_id)
            .where(PoolGame.deleted_at.is_(None))
            .distinct()
        )
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
        stmt = (
            pg_insert(EspnGame)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["cfbd_game_id"])
        )
        await db.execute(stmt)
        await db.commit()
        return len(missing_ids)


@activity.defn
async def find_live_game_ids() -> list[int]:
    """espn_games.id for every game that should be polling right now.

    The selection is the old ``_run_poll`` query: in-progress games, never-polled
    games, and pre-games inside the kickoff window (but not yet stale).
    """
    now = datetime.now(UTC).replace(tzinfo=None)
    async with SessionLocal() as db:
        result = await db.execute(
            select(EspnGame.id)
            .join(EspnGame.cfbd_game)
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
        return [gid for (gid,) in result.all()]


@activity.defn
async def prune_event_log() -> None:
    """Drop event_log rows older than the retention window (replaces Redis maxlen)."""
    async with SessionLocal() as db:
        await db.execute(
            EventLog.__table__.delete().where(
                EventLog.at < text(f"now() - interval '{_EVENT_LOG_RETENTION}'")
            )
        )
        await db.commit()


# --- per-game poll (rate-limited; runs on the espn task queue) --------------
@activity.defn
async def poll_espn_game(espn_game_id: int) -> PollResult:
    """Poll one game once: fetch the boxscore, diff state, notify, persist.

    This is the single ESPN-request unit, so it runs on the rate-limited ``espn``
    task queue. Returns a small ``PollResult`` the workflow uses to schedule the
    next poll or exit. The old per-tick rate-token acquire and ``effective_interval``
    math are gone — pacing is the workflow's job, throttling is the queue's.
    """
    now = datetime.now(UTC).replace(tzinfo=None)

    async with SessionLocal() as db:
        result = await db.execute(
            select(EspnGame)
            .options(selectinload(EspnGame.cfbd_game))
            .where(EspnGame.id == espn_game_id)
        )
        game = result.scalar_one_or_none()
        if game is None:
            return PollResult(status_state="post", polled=False, terminal=True)

        # Stale pre-game: scheduled start passed >2h ago and still "pre" → give up.
        if (
            game.status_state == "pre"
            and game.cfbd_game.start_date < now - _STALE_PRE_CUTOFF
        ):
            game.status_state = "post"
            await db.commit()
            logger.info("Marking stale pre-game %s as post", game.espn_event_id)
            return PollResult(status_state="post", polled=False, terminal=True)

        game_label = f"{game.cfbd_game.away_team} vs {game.cfbd_game.home_team}"
        label = _game_label(game)
        espn_event_id = game.espn_event_id
        old_state = game.status_state
        old_detail = game.status_detail or ""

    # Fetch outside the session so the DB connection isn't held across the HTTP call.
    try:
        payload = await fetch_espn_boxscore(espn_event_id)
        extracted = extract_espn_scores(payload)
    except Exception as exc:
        msg = f"⚠️ ESPN error ({label}): {exc}"
        logger.error(msg)
        await _send_alert(msg)
        async with SessionLocal() as db:
            await log_event(
                db,
                "espn_poller",
                "poll_error",
                {
                    "espn_event_id": espn_event_id,
                    "game_label": game_label,
                    "error": str(exc),
                },
            )
            game_row = await db.get(EspnGame, espn_game_id)
            if game_row:
                game_row.last_polled_at = now
            await db.commit()
        # A transient fetch error is not terminal — keep polling this game.
        return PollResult(status_state=old_state, polled=False, terminal=False)

    new_state = extracted["status_state"]
    new_detail = extracted["status_detail"] or ""
    home_score = extracted["home_score"]
    away_score = extracted["away_score"]

    notify_msg = None
    if old_state != "in" and new_state == "in":
        notify_msg = f"\U0001f3c8 Game starting: {label} — now polling live"
    elif (
        new_state == "in"
        and "halftime" in new_detail.lower()
        and "halftime" not in old_detail.lower()
    ):
        notify_msg = f"⏸️ Halftime: {label} | {away_score}–{home_score}"
    elif old_state != "post" and new_state == "post":
        notify_msg = f"\U0001f3c1 Final: {label} | {away_score}–{home_score}"

    if notify_msg:
        await _send_alert(notify_msg)

    async with SessionLocal() as db:
        game_row = await db.get(EspnGame, espn_game_id)
        if game_row:
            game_row.status_state = new_state
            game_row.status_detail = new_detail
            game_row.period = extracted["period"]
            game_row.clock = extracted["clock"]
            game_row.home_score = home_score
            game_row.away_score = away_score
            game_row.raw_payload = payload
            game_row.last_polled_at = now
        await log_event(
            db,
            "espn_poller",
            "poll_ok",
            {
                "espn_event_id": espn_event_id,
                "game_label": game_label,
                "status_state": new_state,
            },
        )
        await db.commit()

    return PollResult(
        status_state=new_state, polled=True, terminal=(new_state == "post")
    )
