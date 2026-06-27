"""Activities for CFBD play-by-play ingestion — all the I/O lives here.

Mirrors ``app/temporal/cfbd_facts/activities.py``: a whole-season CFBD payload
(which is especially large for the play endpoints) is fetched, transformed,
upserted, and committed entirely *inside* ``sync_plays_season`` — it never crosses
the workflow boundary, keeping workflow history small. The workflow only ever
sees small typed results. Transform logic lives in
``app.services.sync.cfbd_plays_syncers``.
"""
from dataclasses import dataclass, field

from temporalio import activity

from app.core.config import settings
from app.core.database import TaskSessionLocal as SessionLocal
from app.services.sync.cfbd_plays_syncers import (
    PLAY_ENDPOINTS,
    load_coverage,
    sync_one_season,
)


@dataclass
class PlaysConfig:
    """Static inputs the workflow needs but can't read itself (settings access is
    I/O, and must stay out of the deterministic sandbox)."""

    start_year: int
    endpoints: list[str] = field(default_factory=lambda: list(PLAY_ENDPOINTS))


@dataclass
class SeasonResult:
    """Outcome of one ``(endpoint, year)`` ingest."""

    processed: int
    changed: int


@activity.defn
async def get_plays_config() -> PlaysConfig:
    """Earliest backfill season + the endpoint list, sourced from settings."""
    return PlaysConfig(start_year=settings.cfbd_facts_start_year)


@activity.defn
async def load_plays_coverage() -> list[list]:
    """Completed ``(endpoint, year)`` pairs so the workflow can skip them.

    Returned as JSON-friendly ``[endpoint, year]`` pairs. Only ``complete=True``
    seasons are returned — the in-progress season is intentionally absent so it is
    re-pulled every run.
    """
    async with SessionLocal() as db:
        coverage = await load_coverage(db)
    return [[ep, yr] for (ep, yr), done in coverage.items() if done]


@activity.defn
async def sync_plays_season(
    endpoint: str, year: int, current_year: int
) -> SeasonResult:
    """Fetch + upsert one season for one play endpoint (see module docstring).

    Heartbeats around the fetch/upsert so the high-volume payloads don't trip the
    heartbeat timeout. On failure, rolls back so the season is left uncovered and
    self-heals on the next run; the exception propagates to drive activity retry.
    """
    activity.heartbeat(f"{endpoint} {year}: fetching")
    async with SessionLocal() as db:
        try:
            processed, changed = await sync_one_season(db, endpoint, year, current_year)
        except Exception:
            await db.rollback()
            raise
    activity.heartbeat(f"{endpoint} {year}: done ({processed} rows)")
    return SeasonResult(processed=processed, changed=changed)
