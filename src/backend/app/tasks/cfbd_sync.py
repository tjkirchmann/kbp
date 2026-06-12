"""CFBD ingestion tasks (teams + games) on Procrastinate.

Each task: fetch from CFBD → record a content-hash snapshot per changed entity →
batch-upsert into the entity table. Periodic schedules keep them fresh; the admin
panel can also defer a one-off run (see app/routers/admin.py).
"""
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import TaskSessionLocal as SessionLocal
from app.core.procrastinate import procrastinate_app as app
from app.models.cfbd import CfbdGame, CfbdTeam
from app.tasks.notify_decorator import notify
from app.services.sync.providers.cfbd import cfbd_provider
from app.services.sync.snapshots import record_snapshot

logger = logging.getLogger(__name__)

# asyncpg/psycopg cap statements at 32767 bind params; keep batches under that.
_TEAM_COLS = 12
_GAME_COLS = 18
_TEAM_BATCH = 32767 // _TEAM_COLS
_GAME_BATCH = 32767 // _GAME_COLS


def _team_row(t: dict) -> dict:
    return {
        "id": t["id"],
        "school": t.get("school") or "",
        "mascot": t.get("mascot") or None,
        "abbreviation": t.get("abbreviation") or None,
        "color": t.get("color") or None,
        "alt_color": t.get("altColor") or None,  # CFBD API is camelCase
        "logos": t.get("logos") or None,
        "conference": t.get("conference") or None,
        "division": t.get("division") or None,
        "classification": t.get("classification") or None,
        "twitter": t.get("twitter") or None,
        "last_synced_at": datetime.utcnow(),
    }


def _team_hash_fields(t: dict) -> dict:
    # Everything meaningful except the volatile last_synced_at.
    return {
        "school": t.get("school"),
        "mascot": t.get("mascot"),
        "abbreviation": t.get("abbreviation"),
        "color": t.get("color"),
        "altColor": t.get("altColor"),
        "logos": t.get("logos"),
        "conference": t.get("conference"),
        "division": t.get("division"),
        "classification": t.get("classification"),
        "twitter": t.get("twitter"),
    }


def _game_row(g: dict, year: int) -> dict:
    raw_date = g.get("startDate", "")
    try:
        start_date = datetime.fromisoformat(raw_date.replace("Z", "+00:00")).replace(tzinfo=None)
    except (ValueError, AttributeError):
        start_date = datetime.utcnow()
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
        "last_synced_at": datetime.utcnow(),
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


async def _batch_upsert(db, model, rows: list[dict], batch_size: int) -> None:
    update_keys = [c for c in rows[0] if c != "id"]
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        stmt = pg_insert(model).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={c: stmt.excluded[c] for c in update_keys},
        )
        await db.execute(stmt)


@app.task(name="cfbd_teams", queueing_lock="cfbd_teams", retry=3)
@notify(task_name="cfbd_teams")
async def sync_cfbd_teams(timestamp: int | None = None) -> dict[str, Any]:
    teams = [t for t in await cfbd_provider.fetch("teams") if t.get("id")]
    if not teams:
        return {"processed": 0, "changed": 0}

    async with SessionLocal() as db:
        changed = 0
        for t in teams:
            if await record_snapshot(
                db,
                entity_type="cfbd_team",
                entity_id=str(t["id"]),
                payload=t,
                hash_fields=_team_hash_fields(t),
                source=cfbd_provider.name,
            ):
                changed += 1

        await _batch_upsert(db, CfbdTeam, [_team_row(t) for t in teams], _TEAM_BATCH)
        await db.commit()

    logger.info("cfbd_teams sync: processed=%d changed=%d", len(teams), changed)
    return {"processed": len(teams), "changed": changed}


@app.task(name="cfbd_games", queueing_lock="cfbd_games", retry=3)
@notify(task_name="cfbd_games")
async def sync_cfbd_games(timestamp: int | None = None) -> dict[str, Any]:
    year = datetime.utcnow().year
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

        await _batch_upsert(db, CfbdGame, [_game_row(g, year) for g in games], _GAME_BATCH)
        await db.commit()

    logger.info("cfbd_games sync: year=%d processed=%d changed=%d", year, len(games), changed)
    return {"processed": len(games), "changed": changed, "year": year}
