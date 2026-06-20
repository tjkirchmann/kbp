"""Temporal activities for CFBD dimension ingestion.

Activities run outside the workflow sandbox, so normal I/O is fine here: each
opens its own ``TaskSessionLocal`` session, fetches from CFBD, records a
content-hash snapshot per changed entity, and batch-upserts into the entity
table. Everything is idempotent (dedupe by primary key + ``ON CONFLICT`` upsert),
so periodic, manual, and retried runs all converge.

Two activities cover all six dimensions:
  * ``sync_flat_dim(entity_key)`` — the five single-PK dims (teams, conferences,
    venues, draft positions, draft teams), driven by ``_DIM_SPECS``.
  * ``sync_coaches()`` — the two-table coach + coach-season case.

The row/hash mapping helpers are ported verbatim from the former
``app/tasks/cfbd_dims.py`` Procrastinate task; only the orchestration changed.
"""
import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable

from temporalio import activity

from app.core.database import TaskSessionLocal as SessionLocal
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
    return {k: v.get(k) for k in (
        "name", "city", "state", "zip", "countryCode", "timezone", "latitude",
        "longitude", "elevation", "capacity", "constructionYear", "grass", "dome",
    )}


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


# --- flat-dimension registry ------------------------------------------------
@dataclass(frozen=True)
class _DimSpec:
    """How to sync one single-PK dimension: fetch key, snapshot type, PK column,
    ORM model, and the row/hash mapping functions."""
    endpoint: str
    entity_type: str
    pk: str
    model: Any
    row_fn: Callable[[dict], dict]
    hash_fn: Callable[[dict], dict]


# entity_key -> spec. The five single-PK dims; coaches is handled separately.
_DIM_SPECS: dict[str, _DimSpec] = {
    "teams": _DimSpec(
        "teams", "cfbd_team", "id", CfbdTeam, _team_row, _team_hash,
    ),
    "conferences": _DimSpec(
        "conferences", "cfbd_conference", "id", CfbdConference,
        _conference_row, _conference_hash,
    ),
    "venues": _DimSpec(
        "venues", "cfbd_venue", "id", CfbdVenue, _venue_row, _venue_hash,
    ),
    "draft_positions": _DimSpec(
        "draft_positions", "cfbd_draft_position", "name", CfbdDraftPosition,
        _draft_position_row, lambda x: {"abbreviation": x.get("abbreviation")},
    ),
    "draft_teams": _DimSpec(
        "draft_teams", "cfbd_draft_team", "display_name", CfbdDraftTeam,
        _draft_team_row, lambda x: {k: x.get(k) for k in ("location", "nickname", "logo")},
    ),
}

# Stable ordering for the workflow's fan-out.
FLAT_DIM_KEYS: tuple[str, ...] = tuple(_DIM_SPECS.keys())


@activity.defn
async def sync_flat_dim(entity_key: str) -> dict[str, Any]:
    """Fetch + snapshot + upsert one single-PK dimension.

    Rows are deduped by the spec's PK (last wins) so a single ``ON CONFLICT``
    statement never touches the same key twice. Returns
    ``{"entity", "processed", "changed"}``.
    """
    spec = _DIM_SPECS[entity_key]
    items = await cfbd_provider.fetch(spec.endpoint)

    rows: dict[Any, dict] = {}
    changed = 0
    async with SessionLocal() as db:
        for it in items:
            row = spec.row_fn(it)
            key = row[spec.pk]
            if key is None or key == "":
                continue
            if await record_snapshot(
                db,
                entity_type=spec.entity_type,
                entity_id=str(key),
                payload=it,
                hash_fields=spec.hash_fn(it),
                source=cfbd_provider.name,
            ):
                changed += 1
            rows[key] = row
        values = list(rows.values())
        if values:
            await batch_upsert(
                db, spec.model, values, _BATCH(len(values[0])),
                index_elements=(spec.pk,),
            )
        await db.commit()

    result = {"entity": entity_key, "processed": len(rows), "changed": changed}
    logger.info("cfbd_dims sync_flat_dim: %s", result)
    return result


@activity.defn
async def sync_coaches() -> dict[str, Any]:
    """Fetch + snapshot + upsert coaches, then their seasons (child FK).

    Two tables in one activity so the parent rows are guaranteed present before
    the FK-bearing season rows. Returns coach + season counts.
    """
    coaches = await cfbd_provider.fetch("coaches")

    coach_rows: dict[str, dict] = {}
    season_rows: dict[tuple, dict] = {}
    changed = 0
    async with SessionLocal() as db:
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
                db, CfbdCoach, coaches_v, _BATCH(len(coaches_v[0])),
                index_elements=("coach_id",),
            )
        activity.heartbeat("coaches upserted; upserting seasons")
        seasons_v = list(season_rows.values())
        if seasons_v:
            await batch_upsert(
                db, CfbdCoachSeason, seasons_v, _BATCH(len(seasons_v[0])),
                index_elements=("coach_id", "school", "year"),
            )
        await db.commit()

    result = {
        "coaches": {"processed": len(coach_rows), "changed": changed},
        "coach_seasons": {"processed": len(season_rows)},
    }
    logger.info("cfbd_dims sync_coaches: %s", result)
    return result
