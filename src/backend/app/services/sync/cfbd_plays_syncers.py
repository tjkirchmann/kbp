"""Transform/upsert logic for the high-volume CFBD play-by-play endpoints.

``/plays`` and ``/plays/stats`` are the largest CFBD fact endpoints (~150-200
plays per game, millions of rows per backfill). They share the ``cfbd_fact_coverage``
table with ``cfbd_facts_syncers`` but key on their own endpoints ("plays" /
"play_stats"), so the two never collide.

Ported verbatim from the former Procrastinate task ``app/tasks/cfbd_plays.py``;
only the orchestration moved (to ``app/temporal/cfbd_plays/``). The shape mirrors
``cfbd_facts_syncers`` (``load_coverage`` + ``sync_one_season`` + a ``_SYNCERS``
registry) so the two pipelines stay structurally parallel.
"""

import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from app.models.cfbd import CfbdFactCoverage, CfbdPlay, CfbdPlayStat
from app.services.sync.providers.cfbd import cfbd_provider
from app.services.sync.upsert import batch_upsert

logger = logging.getLogger(__name__)


def _batch(cols: int) -> int:
    return max(1, 32767 // cols)


# --- /plays → cfbd_plays ----------------------------------------------------
async def _sync_plays(db, plays: list[dict], year: int) -> tuple[int, int]:
    now = datetime.now(UTC).replace(tzinfo=None)
    rows: dict[str, dict] = {}
    for p in plays:
        pid = p.get("id")
        if pid is None:
            continue
        rows[str(pid)] = {
            "id": str(pid),
            "game_id": p.get("gameId"),
            "drive_id": str(p["driveId"]) if p.get("driveId") is not None else None,
            "season": p.get("season") or year,
            "week": p.get("week"),
            "season_type": p.get("seasonType"),
            "offense": p.get("offense"),
            "offense_conference": p.get("offenseConference"),
            "defense": p.get("defense"),
            "defense_conference": p.get("defenseConference"),
            "home": p.get("home"),
            "away": p.get("away"),
            "offense_score": p.get("offenseScore"),
            "defense_score": p.get("defenseScore"),
            "period": p.get("period"),
            "yard_line": p.get("yardLine"),
            "yards_to_goal": p.get("yardsToGoal"),
            "down": p.get("down"),
            "distance": p.get("distance"),
            "scoring": p.get("scoring"),
            "yards_gained": p.get("yardsGained"),
            "play_type": p.get("playType"),
            "play_text": p.get("playText"),
            "ppa": p.get("ppa"),
            "last_synced_at": now,
        }
    values = list(rows.values())
    if values:
        await batch_upsert(
            db, CfbdPlay, values, _batch(len(values[0])), index_elements=("id",)
        )
    return len(values), 0


# --- /plays/stats → cfbd_play_stats (EAV) -----------------------------------
async def _sync_play_stats(db, stats: list[dict], year: int) -> tuple[int, int]:
    now = datetime.now(UTC).replace(tzinfo=None)
    rows: dict[tuple, dict] = {}
    for s in stats:
        play_id, athlete_id = s.get("playId"), s.get("athleteId")
        stat_type = s.get("statType")
        if play_id is None or athlete_id is None or stat_type is None:
            continue
        key = (str(play_id), str(athlete_id), stat_type)
        rows[key] = {
            "play_id": str(play_id),
            "athlete_id": str(athlete_id),
            "stat_type": stat_type,
            "game_id": s.get("gameId"),
            "season": s.get("season") or year,
            "week": s.get("week"),
            "team": s.get("team"),
            "conference": s.get("conference"),
            "opponent": s.get("opponent"),
            "athlete_name": s.get("athleteName"),
            "stat": s.get("stat"),
            "last_synced_at": now,
        }
    values = list(rows.values())
    if values:
        await batch_upsert(
            db,
            CfbdPlayStat,
            values,
            _batch(len(values[0])),
            index_elements=("play_id", "athlete_id", "stat_type"),
        )
    return len(values), 0


_SYNCERS: dict[str, Callable[[Any, list[dict], int], Awaitable[tuple[int, int]]]] = {
    "plays": _sync_plays,
    "play_stats": _sync_play_stats,
}

PLAY_ENDPOINTS: tuple[str, ...] = tuple(_SYNCERS.keys())


async def load_coverage(db) -> dict[tuple[str, int], bool]:
    """{(endpoint, season_year): complete} for the play endpoints only."""
    result = await db.execute(
        select(
            CfbdFactCoverage.endpoint,
            CfbdFactCoverage.season_year,
            CfbdFactCoverage.complete,
        ).where(CfbdFactCoverage.endpoint.in_(_SYNCERS.keys()))
    )
    return {(ep, yr): done for ep, yr, done in result.all()}


async def sync_one_season(
    db, endpoint: str, year: int, current_year: int
) -> tuple[int, int]:
    """Fetch, upsert, and record coverage for a single ``(endpoint, year)``.

    Self-contained unit of work: fetch the whole season from CFBD → run the
    endpoint's syncer → freeze coverage → commit. A finished season
    (``year < current_year``) is marked ``complete=True`` so it is never
    re-fetched; the in-progress season stays incomplete and is re-pulled.

    Commits on success; the caller rolls back on error so an interrupted backfill
    self-heals on the next run. Returns ``(processed, changed)``.
    """
    syncer = _SYNCERS[endpoint]
    items = await cfbd_provider.fetch(endpoint, year=year)
    processed, changed = await syncer(db, items or [], year)

    await batch_upsert(
        db,
        CfbdFactCoverage,
        [
            {
                "endpoint": endpoint,
                "season_year": year,
                "complete": year < current_year,
                "row_count": processed,
                "last_synced_at": datetime.now(UTC).replace(tzinfo=None),
            }
        ],
        1,
        index_elements=("endpoint", "season_year"),
    )
    await db.commit()
    return processed, changed
