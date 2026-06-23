"""CFBD play-by-play ingestion — a separate, intentionally cron-less task.

`/plays` and `/plays/stats` are the highest-volume CFBD fact endpoints (~150-200
plays per game, thousands of paged calls and millions of rows per backfill), so
unlike the daily `cfbd_facts` task they are NOT put on a schedule. This task is
*run-only*: it is registered with the worker (so the admin "Run" button can defer
it on demand) but its admin_notify_config.cron is NULL and it is listed in
admin._RUN_ONLY_TASKS, exactly like espn_seed.

Mechanics mirror cfbd_facts: smart per-season coverage via cfbd_fact_coverage
(endpoints "plays" / "play_stats"), week-paged fetch through the shared CFBD
provider, snapshot → batch_upsert, committed per season so an interrupted run
self-heals. Because cfbd_facts._load_coverage filters on its own endpoint keys,
the shared coverage table never collides between the two tasks.
"""

import logging
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

from sqlalchemy import select

from app.core.config import settings
from app.core.database import TaskSessionLocal as SessionLocal
from app.core.procrastinate import procrastinate_app as app
from app.models.cfbd import CfbdFactCoverage, CfbdPlay, CfbdPlayStat
from app.services.sync.providers.cfbd import cfbd_provider
from app.services.sync.upsert import batch_upsert
from app.tasks.notify_decorator import notify

logger = logging.getLogger(__name__)


def _batch(cols: int) -> int:
    return max(1, 32767 // cols)


# --- /plays → cfbd_plays ----------------------------------------------------
async def _sync_plays(db, plays: list[dict], year: int) -> tuple[int, int]:
    now = datetime.utcnow()
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
    now = datetime.utcnow()
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


async def _load_coverage(db) -> dict[tuple[str, int], bool]:
    result = await db.execute(
        select(
            CfbdFactCoverage.endpoint,
            CfbdFactCoverage.season_year,
            CfbdFactCoverage.complete,
        ).where(CfbdFactCoverage.endpoint.in_(_SYNCERS.keys()))
    )
    return {(ep, yr): done for ep, yr, done in result.all()}


@app.task(name="cfbd_plays", queueing_lock="cfbd_plays", retry=3)
@notify(task_name="cfbd_plays")
async def sync_cfbd_plays(timestamp: int | None = None) -> dict[str, Any]:
    """Backfill/refresh high-volume play-by-play. Manual (cron-less) — runnable
    from the admin Run button. Smart-syncs by season like cfbd_facts."""
    current = datetime.utcnow().year
    start = settings.cfbd_facts_start_year
    result: dict[str, Any] = {}

    async with SessionLocal() as db:
        coverage = await _load_coverage(db)
        for endpoint, syncer in _SYNCERS.items():
            ep: dict[str, Any] = {
                "synced": [],
                "skipped": [],
                "errors": [],
                "processed": 0,
            }
            for year in range(start, current + 1):
                if coverage.get((endpoint, year)):
                    ep["skipped"].append(year)
                    continue
                try:
                    items = await cfbd_provider.fetch(endpoint, year=year)
                    processed, _ = await syncer(db, items or [], year)
                    await batch_upsert(
                        db,
                        CfbdFactCoverage,
                        [
                            {
                                "endpoint": endpoint,
                                "season_year": year,
                                "complete": year < current,
                                "row_count": processed,
                                "last_synced_at": datetime.utcnow(),
                            }
                        ],
                        1,
                        index_elements=("endpoint", "season_year"),
                    )
                    await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("cfbd_plays %s %s failed", endpoint, year)
                    ep["errors"].append(year)
                    continue
                ep["synced"].append(year)
                ep["processed"] += processed
            result[endpoint] = ep

    logger.info("cfbd_plays sync: %s", result)
    return result
