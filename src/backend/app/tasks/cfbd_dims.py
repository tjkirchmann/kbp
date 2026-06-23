"""CFBD dimension ingestion on Procrastinate — one nightly task for all dims.

Materializes every slowly-changing CFBD reference table in a single run: teams,
conferences, venues, coaches (+ coach seasons), draft positions, draft teams.

Pattern (per entity): fetch from CFBD → record a content-hash snapshot per changed
entity (app/services/sync/snapshots.py) → batch-upsert into the entity table
(app/services/sync/upsert.py). Idempotent: rows are deduped by primary key and
upserted, so periodic + manual + retry runs all converge.

Games (a fact table whose scores change) is synced separately and far more
frequently in app/tasks/cfbd_sync.py.
"""

import hashlib
import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any

from app.core.database import TaskSessionLocal as SessionLocal
from app.core.procrastinate import procrastinate_app as app
from app.models.cfbd import (
    CfbdCoach,
    CfbdCoachSeason,
    CfbdConference,
    CfbdDraftPosition,
    CfbdDraftTeam,
    CfbdTeam,
    CfbdVenue,
)
from app.services.sync.providers.cfbd import cfbd_provider
from app.services.sync.snapshots import record_snapshot
from app.services.sync.upsert import batch_upsert
from app.tasks.notify_decorator import notify

logger = logging.getLogger(__name__)

# asyncpg/psycopg cap statements at 32767 bind params; keep batches under that.
_BATCH = lambda cols: 32767 // cols  # noqa: E731


# --- teams ------------------------------------------------------------------
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


def _team_hash(t: dict) -> dict:
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


# --- conferences ------------------------------------------------------------
def _conference_row(c: dict) -> dict:
    return {
        "id": c["id"],
        "name": c.get("name") or "",
        "short_name": c.get("shortName") or None,
        "abbreviation": c.get("abbreviation") or None,
        "classification": c.get("classification") or None,
        "last_synced_at": datetime.utcnow(),
    }


def _conference_hash(c: dict) -> dict:
    return {
        "name": c.get("name"),
        "shortName": c.get("shortName"),
        "abbreviation": c.get("abbreviation"),
        "classification": c.get("classification"),
    }


# --- venues -----------------------------------------------------------------
def _venue_row(v: dict) -> dict:
    return {
        "id": v["id"],
        "name": v.get("name") or "",
        "city": v.get("city") or None,
        "state": v.get("state") or None,
        "zip": v.get("zip") or None,
        "country_code": v.get("countryCode") or None,
        "timezone": v.get("timezone") or None,
        "latitude": v.get("latitude"),
        "longitude": v.get("longitude"),
        "elevation": v.get("elevation") or None,
        "capacity": v.get("capacity"),
        "construction_year": v.get("constructionYear"),
        "grass": v.get("grass"),
        "dome": v.get("dome"),
        "last_synced_at": datetime.utcnow(),
    }


def _venue_hash(v: dict) -> dict:
    return {
        k: v.get(k)
        for k in (
            "name",
            "city",
            "state",
            "zip",
            "countryCode",
            "timezone",
            "latitude",
            "longitude",
            "elevation",
            "capacity",
            "constructionYear",
            "grass",
            "dome",
        )
    }


# --- draft positions / teams ------------------------------------------------
def _draft_position_row(p: dict) -> dict:
    return {
        "name": p.get("name"),
        "abbreviation": p.get("abbreviation") or None,
        "last_synced_at": datetime.utcnow(),
    }


def _draft_team_row(t: dict) -> dict:
    return {
        "display_name": t.get("displayName"),
        "location": t.get("location") or None,
        "nickname": t.get("nickname") or None,
        "logo": t.get("logo") or None,
        "last_synced_at": datetime.utcnow(),
    }


# --- coaches (split into coach + season tables) -----------------------------
def _coach_id(c: dict) -> str:
    """Deterministic synthetic id — CFBD exposes none for coaches."""
    raw = f"{c.get('firstName')}|{c.get('lastName')}|{c.get('hireDate')}"
    return hashlib.sha1(raw.encode()).hexdigest()


def _coach_row(c: dict, cid: str) -> dict:
    return {
        "coach_id": cid,
        "first_name": c.get("firstName") or None,
        "last_name": c.get("lastName") or None,
        "hire_date": c.get("hireDate") or None,
        "last_synced_at": datetime.utcnow(),
    }


def _coach_season_row(s: dict, cid: str) -> dict:
    return {
        "coach_id": cid,
        "school": s.get("school"),
        "year": s.get("year"),
        "games": s.get("games"),
        "wins": s.get("wins"),
        "losses": s.get("losses"),
        "ties": s.get("ties"),
        "preseason_rank": s.get("preseasonRank"),
        "postseason_rank": s.get("postseasonRank"),
        "srs": s.get("srs"),
        "sp_overall": s.get("spOverall"),
        "sp_offense": s.get("spOffense"),
        "sp_defense": s.get("spDefense"),
        "last_synced_at": datetime.utcnow(),
    }


def _coach_hash(c: dict) -> dict:
    return {
        "firstName": c.get("firstName"),
        "lastName": c.get("lastName"),
        "hireDate": c.get("hireDate"),
        "seasons": c.get("seasons"),
    }


async def _sync_flat(
    db,
    items: list[dict],
    *,
    entity_type: str,
    pk: str,
    model: Any,
    row_fn: Callable[[dict], dict],
    hash_fn: Callable[[dict], dict],
) -> tuple[int, int]:
    """Snapshot + upsert flat entities keyed on a single column `pk`.

    Rows are deduped by `pk` (last wins) so a single ON CONFLICT statement never
    touches the same key twice. Returns (processed, changed).
    """
    rows: dict[Any, dict] = {}
    changed = 0
    for it in items:
        row = row_fn(it)
        key = row[pk]
        if key is None or key == "":
            continue
        if await record_snapshot(
            db,
            entity_type=entity_type,
            entity_id=str(key),
            payload=it,
            hash_fields=hash_fn(it),
            source=cfbd_provider.name,
        ):
            changed += 1
        rows[key] = row
    values = list(rows.values())
    if values:
        await batch_upsert(
            db, model, values, _BATCH(len(values[0])), index_elements=(pk,)
        )
    return len(values), changed


async def _sync_coaches(db, coaches: list[dict]) -> tuple[int, int, int]:
    """Upsert coaches then their seasons (child FK). Returns (coaches, seasons, changed)."""
    coach_rows: dict[str, dict] = {}
    season_rows: dict[tuple, dict] = {}
    changed = 0
    for c in coaches:
        cid = _coach_id(c)
        if await record_snapshot(
            db,
            entity_type="cfbd_coach",
            entity_id=cid,
            payload=c,
            hash_fields=_coach_hash(c),
            source=cfbd_provider.name,
        ):
            changed += 1
        coach_rows[cid] = _coach_row(c, cid)
        for s in c.get("seasons") or []:
            school, year = s.get("school"), s.get("year")
            if school is None or year is None:
                continue
            season_rows[(cid, school, year)] = _coach_season_row(s, cid)

    coaches_v = list(coach_rows.values())
    if coaches_v:
        await batch_upsert(
            db,
            CfbdCoach,
            coaches_v,
            _BATCH(len(coaches_v[0])),
            index_elements=("coach_id",),
        )
    seasons_v = list(season_rows.values())
    if seasons_v:
        await batch_upsert(
            db,
            CfbdCoachSeason,
            seasons_v,
            _BATCH(len(seasons_v[0])),
            index_elements=("coach_id", "school", "year"),
        )
    return len(coaches_v), len(seasons_v), changed


@app.task(name="cfbd_dims", queueing_lock="cfbd_dims", retry=3)
@notify(task_name="cfbd_dims")
async def sync_cfbd_dims(timestamp: int | None = None) -> dict[str, Any]:
    """Nightly materialization of all CFBD dimension tables (teams, conferences,
    venues, coaches, draft positions, draft teams)."""
    teams = await cfbd_provider.fetch("teams")
    conferences = await cfbd_provider.fetch("conferences")
    venues = await cfbd_provider.fetch("venues")
    coaches = await cfbd_provider.fetch("coaches")
    draft_positions = await cfbd_provider.fetch("draft_positions")
    draft_teams = await cfbd_provider.fetch("draft_teams")

    result: dict[str, Any] = {}
    async with SessionLocal() as db:
        p, ch = await _sync_flat(
            db,
            teams,
            entity_type="cfbd_team",
            pk="id",
            model=CfbdTeam,
            row_fn=_team_row,
            hash_fn=_team_hash,
        )
        result["teams"] = {"processed": p, "changed": ch}

        p, ch = await _sync_flat(
            db,
            conferences,
            entity_type="cfbd_conference",
            pk="id",
            model=CfbdConference,
            row_fn=_conference_row,
            hash_fn=_conference_hash,
        )
        result["conferences"] = {"processed": p, "changed": ch}

        p, ch = await _sync_flat(
            db,
            venues,
            entity_type="cfbd_venue",
            pk="id",
            model=CfbdVenue,
            row_fn=_venue_row,
            hash_fn=_venue_hash,
        )
        result["venues"] = {"processed": p, "changed": ch}

        p, ch = await _sync_flat(
            db,
            draft_positions,
            entity_type="cfbd_draft_position",
            pk="name",
            model=CfbdDraftPosition,
            row_fn=_draft_position_row,
            hash_fn=lambda x: {"abbreviation": x.get("abbreviation")},
        )
        result["draft_positions"] = {"processed": p, "changed": ch}

        p, ch = await _sync_flat(
            db,
            draft_teams,
            entity_type="cfbd_draft_team",
            pk="display_name",
            model=CfbdDraftTeam,
            row_fn=_draft_team_row,
            hash_fn=lambda x: {k: x.get(k) for k in ("location", "nickname", "logo")},
        )
        result["draft_teams"] = {"processed": p, "changed": ch}

        cn, sn, ch = await _sync_coaches(db, coaches)
        result["coaches"] = {"processed": cn, "changed": ch}
        result["coach_seasons"] = {"processed": sn}

        await db.commit()

    logger.info("cfbd_dims sync: %s", result)
    return result
