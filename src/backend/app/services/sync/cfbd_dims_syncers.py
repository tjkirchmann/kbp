"""CFBD dimension syncers — row/hash mappers and dimension registry.

Extracted from ``app/temporal/cfbd_dims/activities.py`` so the row/hash mapping
functions and dimension specs are shared between Temporal activities and any
other caller (e.g. the teams admin router).

The 5 single-PK dimensions (teams, conferences, venues, draft positions, draft
teams) are driven by ``DIM_SPECS``; coaches is a two-table case handled separately.
"""

import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.models.cfbd import (
    CfbdConference,
    CfbdDraftPosition,
    CfbdDraftTeam,
    CfbdTeam,
    CfbdVenue,
)


# --- teams ------------------------------------------------------------------
def team_row(t: dict) -> dict:
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
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None),
    }


def team_hash(t: dict) -> dict:
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
def conference_row(c: dict) -> dict:
    return {
        "id": c["id"],
        "name": c.get("name") or "",
        "short_name": c.get("shortName") or None,
        "abbreviation": c.get("abbreviation") or None,
        "classification": c.get("classification") or None,
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None),
    }


def conference_hash(c: dict) -> dict:
    return {
        "name": c.get("name"),
        "shortName": c.get("shortName"),
        "abbreviation": c.get("abbreviation"),
        "classification": c.get("classification"),
    }


# --- venues -----------------------------------------------------------------
def venue_row(v: dict) -> dict:
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
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None),
    }


def venue_hash(v: dict) -> dict:
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
def draft_position_row(p: dict) -> dict:
    return {
        "name": p.get("name"),
        "abbreviation": p.get("abbreviation") or None,
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None),
    }


def draft_team_row(t: dict) -> dict:
    return {
        "display_name": t.get("displayName"),
        "location": t.get("location") or None,
        "nickname": t.get("nickname") or None,
        "logo": t.get("logo") or None,
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None),
    }


# --- coaches (split into coach + season tables) -----------------------------
def coach_id(c: dict) -> str:
    """Deterministic synthetic id — CFBD exposes none for coaches."""
    raw = f"{c.get('firstName')}|{c.get('lastName')}|{c.get('hireDate')}"
    return hashlib.sha1(raw.encode()).hexdigest()


def coach_row(c: dict, cid: str) -> dict:
    return {
        "coach_id": cid,
        "first_name": c.get("firstName") or None,
        "last_name": c.get("lastName") or None,
        "hire_date": c.get("hireDate") or None,
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None),
    }


def coach_season_row(s: dict, cid: str) -> dict:
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
        "last_synced_at": datetime.now(UTC).replace(tzinfo=None),
    }


def coach_hash(c: dict) -> dict:
    return {
        "firstName": c.get("firstName"),
        "lastName": c.get("lastName"),
        "hireDate": c.get("hireDate"),
        "seasons": c.get("seasons"),
    }


# --- dimension registry -----------------------------------------------------
@dataclass(frozen=True)
class DimSpec:
    """How to sync one single-PK dimension: fetch key, snapshot type, PK column,
    ORM model, and the row/hash mapping functions."""

    endpoint: str
    entity_type: str
    pk: str
    model: Any
    row_fn: Callable[[dict], dict]
    hash_fn: Callable[[dict], dict]


# entity_key -> spec. The five single-PK dims; coaches is handled separately.
DIM_SPECS: dict[str, DimSpec] = {
    "teams": DimSpec(
        "teams",
        "cfbd_team",
        "id",
        CfbdTeam,
        team_row,
        team_hash,
    ),
    "conferences": DimSpec(
        "conferences",
        "cfbd_conference",
        "id",
        CfbdConference,
        conference_row,
        conference_hash,
    ),
    "venues": DimSpec(
        "venues",
        "cfbd_venue",
        "id",
        CfbdVenue,
        venue_row,
        venue_hash,
    ),
    "draft_positions": DimSpec(
        "draft_positions",
        "cfbd_draft_position",
        "name",
        CfbdDraftPosition,
        draft_position_row,
        lambda x: {"abbreviation": x.get("abbreviation")},
    ),
    "draft_teams": DimSpec(
        "draft_teams",
        "cfbd_draft_team",
        "display_name",
        CfbdDraftTeam,
        draft_team_row,
        lambda x: {k: x.get(k) for k in ("location", "nickname", "logo")},
    ),
}

# Stable ordering for the workflow's fan-out.
FLAT_DIM_KEYS: tuple[str, ...] = tuple(DIM_SPECS.keys())
