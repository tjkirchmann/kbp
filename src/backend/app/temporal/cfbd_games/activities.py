"""Temporal activity for CFBD games (fact table) ingestion.

Runs outside the workflow sandbox, so normal I/O is fine: opens its own
``TaskSessionLocal`` session, fetches the season's games from CFBD, records a
content-hash snapshot per changed game, and batch-upserts into ``cfbd_games``.
Idempotent (dedupe by primary key + ``ON CONFLICT`` upsert), so periodic,
manual, and retried runs all converge.

The ``_game_row`` / ``_game_hash_fields`` mappers are ported verbatim from the
former ``app/tasks/cfbd_sync.py`` Procrastinate task; only the orchestration
changed.
"""

import logging
from datetime import UTC, datetime
from typing import Any

from temporalio import activity

from app.core.database import TaskSessionLocal as SessionLocal
from app.models.cfbd import CfbdGame
from app.services.sync.providers.cfbd import cfbd_provider
from app.services.sync.snapshots import record_snapshot
from app.services.sync.upsert import batch_upsert

logger = logging.getLogger(__name__)

# asyncpg/psycopg cap statements at 32767 bind params; keep batches under that.
_GAME_COLS = 18
_GAME_BATCH = 32767 // _GAME_COLS


def _game_row(g: dict, year: int) -> dict:
    raw_date = g.get("startDate", "")
    try:
        start_date = datetime.fromisoformat(raw_date.replace("Z", "+00:00")).replace(
            tzinfo=None
        )
    except (ValueError, AttributeError):
        start_date = datetime.now(UTC).replace(tzinfo=None)
    return {
        "id": g["id"],
        "home_team": g.get("homeTeam", ""),
        "away_team": g.get("awayTeam", ""),
        "start_date": start_date,
        "start_time_tbd": g.get("startTimeTBD", False),
        "bowl_name": g.get("notes") or None,
        "season_type": g.get("seasonType", "regular"),
        "season_year": year,
        "home_classification": g.get("homeClassification") or None,
        "away_classification": g.get("awayClassification") or None,
        "home_conference": g.get("homeConference") or None,
        "away_conference": g.get("awayConference") or None,
        "conference_game": g.get("conferenceGame", False),
        "neutral_site": g.get("neutralSite", False),
        "completed": bool(g.get("completed", False)),
        "home_score": g.get("homePoints"),
        "away_score": g.get("awayPoints"),
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None),
    }


def _game_hash_fields(g: dict) -> dict:
    return {
        "homeTeam": g.get("homeTeam"),
        "awayTeam": g.get("awayTeam"),
        "startDate": g.get("startDate"),
        "completed": g.get("completed"),
        "homePoints": g.get("homePoints"),
        "awayPoints": g.get("awayPoints"),
        "notes": g.get("notes"),
        "seasonType": g.get("seasonType"),
    }


@activity.defn
async def sync_games_season(year: int) -> dict[str, Any]:
    """Fetch, snapshot, and upsert one season's CFBD games."""
    games = [g for g in await cfbd_provider.fetch("games", year=year) if g.get("id")]
    if not games:
        return {"processed": 0, "changed": 0, "year": year}

    async with SessionLocal() as db:
        changed = 0
        for g in games:
            if await record_snapshot(
                db,
                entity_type="cfbd_game",
                entity_id=str(g["id"]),
                payload=g,
                hash_fields=_game_hash_fields(g),
                source=cfbd_provider.name,
            ):
                changed += 1

        await batch_upsert(
            db, CfbdGame, [_game_row(g, year) for g in games], _GAME_BATCH
        )
        await db.commit()

    logger.info(
        "cfbd_games sync: year=%d processed=%d changed=%d", year, len(games), changed
    )
    return {"processed": len(games), "changed": changed, "year": year}
