"""CFBD fact-table ingestion on Procrastinate — one smart daily task.

Materializes CFBD *fact* tables (event/measurement data that changes over time),
as opposed to the slowly-changing *dimension* tables handled by cfbd_dims.

Smart sync — only hits the API for data we're missing
-----------------------------------------------------
Fact data for a *finished* season is immutable, so we fetch each season once,
mark it complete in cfbd_fact_coverage, then never call the API for it again.
Only the in-progress (current calendar year) season is re-pulled daily; the
first run backfills every season from settings.cfbd_facts_start_year, and the
task then converges to one call per endpoint per day. Coverage is recorded only
after a successful upsert (committed per season), so an interrupted backfill
self-heals on the next run.

Pattern (per entity) mirrors cfbd_dims/cfbd_sync: record a content-hash snapshot
(app/services/sync/snapshots.py) → batch-upsert keyed on the table's PK
(app/services/sync/upsert.py). Idempotent: periodic + manual + retry runs all
converge with no duplicate rows.

CFBD fact-table coverage roadmap (✅ done · 🆕 this task · ⬜ planned)
---------------------------------------------------------------------
  /games                  game                    cfbd_games            ✅ (cfbd_sync, 15-min)
  /lines                  game × provider         cfbd_betting_lines    🆕
  /rankings               season·week·poll·team   cfbd_rankings         🆕
  /games/teams            game × team × stat      cfbd_game_team_stats  🆕
  /games/players          game × player × stat    cfbd_game_player_stats  ⬜
  /games/weather          game                    cfbd_game_weather       ⬜
  /games/media            game × outlet           cfbd_game_media         ⬜
  /game/box/advanced      game                    cfbd_game_box_advanced  ⬜
  /drives                 drive                   cfbd_drives             ⬜
  /plays, /plays/stats    play                    cfbd_plays, …           ⬜ (high volume)
  /calendar               season·week             cfbd_calendar           ⬜
  /records                season × team           cfbd_team_records       ⬜
  /stats/season(/advanced)  season × team         cfbd_team_season_stats  ⬜
  /stats/game/advanced,/havoc  game × team        cfbd_team_game_adv      ⬜
  /stats/player/season    season × player         cfbd_player_season_stats ⬜
  /ratings/sp,srs,elo,fpi season(·week) × team    cfbd_team_ratings       ⬜
  /ppa/*, /wepa/*, /metrics/wp*  varies           cfbd_ppa_*, …           ⬜
  /recruiting/*, /teams/ats, /talent, /player/*  season × team/player    cfbd_*  ⬜
"""
import logging
from datetime import datetime
from typing import Any, Awaitable, Callable

from sqlalchemy import select

from app.core.config import settings
from app.core.database import TaskSessionLocal as SessionLocal
from app.core.procrastinate import procrastinate_app as app
from app.models.cfbd import (
    CfbdBettingLine,
    CfbdFactCoverage,
    CfbdGameTeamStat,
    CfbdRanking,
)
from app.tasks.notify_decorator import notify
from app.services.sync.providers.cfbd import cfbd_provider
from app.services.sync.snapshots import record_snapshot
from app.services.sync.upsert import batch_upsert

logger = logging.getLogger(__name__)

# asyncpg/psycopg cap statements at 32767 bind params; keep batches under that.
def _batch(cols: int) -> int:
    return max(1, 32767 // cols)


# --- /lines → cfbd_betting_lines --------------------------------------------
async def _sync_lines(db, games: list[dict], year: int) -> tuple[int, int]:
    now = datetime.utcnow()
    rows: dict[tuple, dict] = {}
    changed = 0
    for g in games:
        gid = g.get("id")
        if gid is None:
            continue
        if await record_snapshot(
            db,
            entity_type="cfbd_betting_line",
            entity_id=str(gid),
            payload=g,
            hash_fields={
                "lines": g.get("lines"),
                "homeScore": g.get("homeScore"),
                "awayScore": g.get("awayScore"),
            },
            source=cfbd_provider.name,
        ):
            changed += 1
        for ln in g.get("lines") or []:
            provider = ln.get("provider")
            if not provider:
                continue
            rows[(gid, provider)] = {
                "game_id": gid,
                "provider": provider,
                "season": g.get("season") or year,
                "season_type": g.get("seasonType") or "regular",
                "week": g.get("week"),
                "home_team_id": g.get("homeTeamId"),
                "home_team": g.get("homeTeam"),
                "away_team_id": g.get("awayTeamId"),
                "away_team": g.get("awayTeam"),
                "spread": ln.get("spread"),
                "spread_open": ln.get("spreadOpen"),
                "over_under": ln.get("overUnder"),
                "over_under_open": ln.get("overUnderOpen"),
                "home_moneyline": ln.get("homeMoneyline"),
                "away_moneyline": ln.get("awayMoneyline"),
                "formatted_spread": ln.get("formattedSpread"),
                "last_synced_at": now,
            }
    values = list(rows.values())
    if values:
        await batch_upsert(
            db, CfbdBettingLine, values, _batch(len(values[0])),
            index_elements=("game_id", "provider"),
        )
    return len(values), changed


# --- /rankings → cfbd_rankings ----------------------------------------------
async def _sync_rankings(db, weeks: list[dict], year: int) -> tuple[int, int]:
    now = datetime.utcnow()
    rows: dict[tuple, dict] = {}
    changed = 0
    for pw in weeks:
        season = pw.get("season") or year
        season_type = pw.get("seasonType") or "regular"
        week = pw.get("week")
        for poll in pw.get("polls") or []:
            poll_name = poll.get("poll")
            if poll_name is None or week is None:
                continue
            if await record_snapshot(
                db,
                entity_type="cfbd_ranking",
                entity_id=f"{season}:{season_type}:{week}:{poll_name}",
                payload=poll,
                hash_fields={"ranks": poll.get("ranks")},
                source=cfbd_provider.name,
            ):
                changed += 1
            for rk in poll.get("ranks") or []:
                team_id = rk.get("teamId")
                if team_id is None:
                    continue
                rows[(season, season_type, week, poll_name, team_id)] = {
                    "season": season,
                    "season_type": season_type,
                    "week": week,
                    "poll": poll_name,
                    "team_id": team_id,
                    "school": rk.get("school"),
                    "conference": rk.get("conference"),
                    "rank": rk.get("rank"),
                    "first_place_votes": rk.get("firstPlaceVotes"),
                    "points": rk.get("points"),
                    "last_synced_at": now,
                }
    values = list(rows.values())
    if values:
        await batch_upsert(
            db, CfbdRanking, values, _batch(len(values[0])),
            index_elements=("season", "season_type", "week", "poll", "team_id"),
        )
    return len(values), changed


# --- /games/teams → cfbd_game_team_stats ------------------------------------
async def _sync_team_stats(db, games: list[dict], year: int) -> tuple[int, int]:
    now = datetime.utcnow()
    rows: dict[tuple, dict] = {}
    changed = 0
    for gts in games:
        gid = gts.get("id")
        if gid is None:
            continue
        if await record_snapshot(
            db,
            entity_type="cfbd_game_team_stat",
            entity_id=str(gid),
            payload=gts,
            hash_fields={"teams": gts.get("teams")},
            source=cfbd_provider.name,
        ):
            changed += 1
        for tm in gts.get("teams") or []:
            team_id = tm.get("teamId")
            if team_id is None:
                continue
            for st in tm.get("stats") or []:
                category = st.get("category")
                if not category:
                    continue
                value = st.get("stat")
                rows[(gid, team_id, category)] = {
                    "game_id": gid,
                    "team_id": team_id,
                    "category": category,
                    "team": tm.get("team"),
                    "conference": tm.get("conference"),
                    "home_away": tm.get("homeAway"),
                    "points": tm.get("points"),
                    "stat": str(value) if value is not None else None,
                    "last_synced_at": now,
                }
    values = list(rows.values())
    if values:
        await batch_upsert(
            db, CfbdGameTeamStat, values, _batch(len(values[0])),
            index_elements=("game_id", "team_id", "category"),
        )
    return len(values), changed


# Endpoint key → season syncer. Endpoint keys match the provider's _FACT_ENDPOINTS.
_SYNCERS: dict[str, Callable[[Any, list[dict], int], Awaitable[tuple[int, int]]]] = {
    "lines": _sync_lines,
    "rankings": _sync_rankings,
    "game_team_stats": _sync_team_stats,
}


async def _load_coverage(db) -> dict[tuple[str, int], bool]:
    """{(endpoint, season_year): complete} for the fact endpoints."""
    result = await db.execute(
        select(
            CfbdFactCoverage.endpoint,
            CfbdFactCoverage.season_year,
            CfbdFactCoverage.complete,
        ).where(CfbdFactCoverage.endpoint.in_(_SYNCERS.keys()))
    )
    return {(ep, yr): done for ep, yr, done in result.all()}


@app.task(name="cfbd_facts", queueing_lock="cfbd_facts", retry=3)
@notify(task_name="cfbd_facts")
async def sync_cfbd_facts(timestamp: int | None = None) -> dict[str, Any]:
    """Smart daily materialization of CFBD fact tables (lines, rankings, team
    game stats). Backfills missing seasons; re-pulls only the current season."""
    current = datetime.utcnow().year
    start = settings.cfbd_facts_start_year
    result: dict[str, Any] = {}

    async with SessionLocal() as db:
        coverage = await _load_coverage(db)
        for endpoint, syncer in _SYNCERS.items():
            ep: dict[str, Any] = {"synced": [], "skipped": [], "processed": 0, "changed": 0}
            for year in range(start, current + 1):
                if coverage.get((endpoint, year)):  # finished season already ingested
                    ep["skipped"].append(year)
                    continue
                items = await cfbd_provider.fetch(endpoint, year=year)
                processed, changed = await syncer(db, items or [], year)

                # complete=True freezes a finished season so we never re-fetch it.
                await batch_upsert(
                    db, CfbdFactCoverage,
                    [{
                        "endpoint": endpoint,
                        "season_year": year,
                        "complete": year < current,
                        "row_count": processed,
                        "last_synced_at": datetime.utcnow(),
                    }],
                    1,
                    index_elements=("endpoint", "season_year"),
                )
                # Commit per season so backfill progress persists and self-heals.
                await db.commit()

                ep["synced"].append(year)
                ep["processed"] += processed
                ep["changed"] += changed
            result[endpoint] = ep

    logger.info("cfbd_facts sync: %s", result)
    return result
