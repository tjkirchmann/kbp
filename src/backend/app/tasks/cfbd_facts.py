"""CFBD fact-table ingestion on Procrastinate — one smart daily task.

Materializes CFBD *fact* tables (event/measurement data that changes over time),
as opposed to the slowly-changing *dimension* tables handled by the
CfbdDimsWorkflow Temporal workflow (app/temporal/cfbd_dims/).

Smart sync — only hits the API for data we're missing
-----------------------------------------------------
Fact data for a *finished* season is immutable, so we fetch each season once,
mark it complete in cfbd_fact_coverage, then never call the API for it again.
Only the in-progress (current calendar year) season is re-pulled daily; the
first run backfills every season from settings.cfbd_facts_start_year, and the
task then converges to one call per endpoint per day. Coverage is recorded only
after a successful upsert (committed per season), so an interrupted backfill
self-heals on the next run.

Pattern (per entity) mirrors cfbd_sync and the cfbd-dims Temporal workflow:
record a content-hash snapshot
(app/services/sync/snapshots.py) → batch-upsert keyed on the table's PK
(app/services/sync/upsert.py). Idempotent: periodic + manual + retry runs all
converge with no duplicate rows.

CFBD fact-table coverage roadmap (✅ done · ⬜ planned)
------------------------------------------------------
  /games                  game                    cfbd_games            ✅ (cfbd_sync, 15-min)
  /lines                  game × provider         cfbd_betting_lines    ✅
  /rankings               season·week·poll·team   cfbd_rankings         ✅
  /games/teams            game × team × stat      cfbd_game_team_stats  ✅
  /games/players          game × player × stat    cfbd_game_player_stats ✅
  /games/weather          game                    cfbd_game_weather     ✅ (premium)
  /games/media            game × outlet           cfbd_game_media       ✅
  /drives                 drive                   cfbd_drives           ✅
  /calendar               season·week             cfbd_calendar         ✅
  /records                season × team           cfbd_team_records     ✅
  /stats/season           season × team × stat    cfbd_team_season_stats ✅
  /stats/season/advanced  season × team × stat    cfbd_team_season_adv_stats ✅
  /stats/player/season    season × player × stat  cfbd_player_season_stats ✅
  /ratings/sp,srs,elo,fpi season × team           cfbd_{sp,srs,elo,fpi}_ratings ✅
  /talent                 season × team            cfbd_team_talent      ✅
  /recruiting/teams       season × team            cfbd_recruiting_teams ✅
  /recruiting/players     season × player          cfbd_recruiting_players ✅
  /recruiting/groups      season × team × group    cfbd_recruiting_groups ✅
  /player/returning       season × team            cfbd_returning_production ✅
  /plays, /plays/stats    play                     cfbd_plays, cfbd_play_stats  ✅ (cfbd_plays, manual/cron-less)
  /game/box/advanced      game (per gameId)        cfbd_game_box_advanced  ⬜ (deferred: one call per game)
  /stats/game/advanced,/havoc  game × team         cfbd_team_game_adv      ⬜ (deferred: per-gameId fan-out)
  /ppa/*, /wepa/*, /metrics/wp*  varies            cfbd_ppa_*, …           ⬜ (deferred)
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
    CfbdCalendar,
    CfbdDrive,
    CfbdEloRating,
    CfbdFactCoverage,
    CfbdFpiRating,
    CfbdGameMedia,
    CfbdGamePlayerStat,
    CfbdGameTeamStat,
    CfbdGameWeather,
    CfbdPlayerSeasonStat,
    CfbdRanking,
    CfbdRecruitingGroup,
    CfbdRecruitingPlayer,
    CfbdRecruitingTeam,
    CfbdReturningProduction,
    CfbdSpRating,
    CfbdSrsRating,
    CfbdTeamRecord,
    CfbdTeamSeasonAdvStat,
    CfbdTeamSeasonStat,
    CfbdTeamTalent,
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


# ---------------------------------------------------------------------------
# Generic syncer for the remaining fact endpoints.
#
# Each CFBD item expands to one or more rows via `expand(item, year, now)`, which
# yields (pk_tuple, row_dict). `entity_id` controls snapshotting: when it returns
# a key we record a content-hash snapshot per item; when None (the high-cardinality
# EAV endpoints) snapshotting is skipped to keep the snapshot table bounded.
# ---------------------------------------------------------------------------
def _f(v) -> Any:
    """Pass-through; CFBD already returns native JSON numbers/strings/bools."""
    return v


def _flatten(prefix: str, obj: dict, out: dict) -> None:
    """Flatten a nested dict into dotted keys (e.g. {'offense': {'ppa': 1}} ->
    {'offense.ppa': 1}), so evolving nested stat blocks land as EAV rows."""
    for k, v in obj.items():
        key = f"{prefix}.{k}" if prefix else str(k)
        if isinstance(v, dict):
            _flatten(key, v, out)
        elif not isinstance(v, list):
            out[key] = v


def _make_generic(
    *,
    entity_type: str,
    model: Any,
    index_elements: tuple[str, ...],
    expand: Callable[[dict, int, datetime], list[tuple[tuple, dict]]],
    entity_id: Callable[[dict, int], Any] | None,
    hash_fields: Callable[[dict], dict] | None = None,
) -> Callable[[Any, list[dict], int], Awaitable[tuple[int, int]]]:
    async def _syncer(db, items: list[dict], year: int) -> tuple[int, int]:
        now = datetime.utcnow()
        rows: dict[tuple, dict] = {}
        changed = 0
        for it in items:
            if entity_id is not None:
                eid = entity_id(it, year)
                if eid is not None and await record_snapshot(
                    db,
                    entity_type=entity_type,
                    entity_id=str(eid),
                    payload=it,
                    hash_fields=hash_fields(it) if hash_fields else it,
                    source=cfbd_provider.name,
                ):
                    changed += 1
            for key, row in expand(it, year, now):
                rows[key] = row
        values = list(rows.values())
        if values:
            await batch_upsert(
                db, model, values, _batch(len(values[0])), index_elements=index_elements
            )
        return len(values), changed

    return _syncer


def _g(d: Any, key: str) -> Any:
    return (d or {}).get(key)


# --- /calendar → cfbd_calendar ----------------------------------------------
def _expand_calendar(it, year, now):
    season = it.get("season") or year
    st = it.get("seasonType") or "regular"
    wk = it.get("week")
    if wk is None:
        return []
    return [((season, st, wk), {
        "season": season, "season_type": st, "week": wk,
        "start_date": it.get("startDate"), "end_date": it.get("endDate"),
        "first_game_start": it.get("firstGameStart"),
        "last_game_start": it.get("lastGameStart"),
        "last_synced_at": now,
    })]


# --- /records → cfbd_team_records -------------------------------------------
def _expand_records(it, year, now):
    tid = it.get("teamId")
    if tid is None:
        return []
    yr = it.get("year") or year
    total, conf = it.get("total") or {}, it.get("conferenceGames") or {}
    home, away = it.get("homeGames") or {}, it.get("awayGames") or {}
    return [((yr, tid), {
        "year": yr, "team_id": tid, "team": it.get("team"),
        "conference": it.get("conference"), "division": it.get("division"),
        "expected_wins": it.get("expectedWins"),
        "total_games": total.get("games"), "total_wins": total.get("wins"),
        "total_losses": total.get("losses"), "total_ties": total.get("ties"),
        "conference_games": conf.get("games"), "conference_wins": conf.get("wins"),
        "conference_losses": conf.get("losses"), "conference_ties": conf.get("ties"),
        "home_games": home.get("games"), "home_wins": home.get("wins"),
        "home_losses": home.get("losses"), "home_ties": home.get("ties"),
        "away_games": away.get("games"), "away_wins": away.get("wins"),
        "away_losses": away.get("losses"), "away_ties": away.get("ties"),
        "last_synced_at": now,
    })]


# --- /ratings/sp → cfbd_sp_ratings ------------------------------------------
def _expand_sp(it, year, now):
    team = it.get("team")
    if team is None:
        return []
    yr = it.get("year") or year
    off, deff, st = it.get("offense") or {}, it.get("defense") or {}, it.get("specialTeams") or {}
    return [((yr, team), {
        "year": yr, "team": team, "conference": it.get("conference"),
        "rating": it.get("rating"), "ranking": it.get("ranking"),
        "second_order_wins": it.get("secondOrderWins"), "sos": it.get("sos"),
        "offense_rating": off.get("rating"), "offense_ranking": off.get("ranking"),
        "defense_rating": deff.get("rating"), "defense_ranking": deff.get("ranking"),
        "special_teams_rating": st.get("rating"),
        "last_synced_at": now,
    })]


# --- /ratings/srs → cfbd_srs_ratings ----------------------------------------
def _expand_srs(it, year, now):
    team = it.get("team")
    if team is None:
        return []
    yr = it.get("year") or year
    return [((yr, team), {
        "year": yr, "team": team, "conference": it.get("conference"),
        "division": it.get("division"), "rating": it.get("rating"),
        "ranking": it.get("ranking"), "last_synced_at": now,
    })]


# --- /ratings/elo → cfbd_elo_ratings ----------------------------------------
def _expand_elo(it, year, now):
    team = it.get("team")
    if team is None:
        return []
    yr = it.get("year") or year
    return [((yr, team), {
        "year": yr, "team": team, "conference": it.get("conference"),
        "elo": it.get("elo"), "last_synced_at": now,
    })]


# --- /ratings/fpi → cfbd_fpi_ratings ----------------------------------------
def _expand_fpi(it, year, now):
    team = it.get("team")
    if team is None:
        return []
    yr = it.get("year") or year
    eff = it.get("efficiencies") or {}
    return [((yr, team), {
        "year": yr, "team": team, "conference": it.get("conference"),
        "fpi": it.get("fpi"),
        "efficiency_overall": eff.get("overall"),
        "efficiency_offense": eff.get("offense"),
        "efficiency_defense": eff.get("defense"),
        "efficiency_special_teams": eff.get("specialTeams"),
        "last_synced_at": now,
    })]


# --- /stats/season → cfbd_team_season_stats (EAV) ---------------------------
def _expand_team_season_stats(it, year, now):
    season, team = it.get("season") or year, it.get("team")
    name = it.get("statName")
    if team is None or name is None:
        return []
    val = it.get("statValue")
    return [((season, team, name), {
        "season": season, "team": team, "stat_name": name,
        "conference": it.get("conference"),
        "stat_value": str(val) if val is not None else None,
        "last_synced_at": now,
    })]


# --- /stats/season/advanced → cfbd_team_season_adv_stats (EAV flatten) ------
def _expand_team_season_adv(it, year, now):
    season, team = it.get("season") or year, it.get("team")
    if team is None:
        return []
    flat: dict = {}
    for side in ("offense", "defense"):
        if isinstance(it.get(side), dict):
            _flatten(side, it[side], flat)
    conf = it.get("conference")
    return [((season, team, stat), {
        "season": season, "team": team, "stat": stat, "conference": conf,
        "value": str(v) if v is not None else None, "last_synced_at": now,
    }) for stat, v in flat.items()]


# --- /stats/player/season → cfbd_player_season_stats (EAV) ------------------
def _expand_player_season_stats(it, year, now):
    season = it.get("season") or year
    pid = it.get("playerId")
    category, stat_type = it.get("category"), it.get("statType")
    if pid is None or category is None or stat_type is None:
        return []
    val = it.get("stat")
    return [((season, str(pid), category, stat_type), {
        "season": season, "player_id": str(pid), "category": category,
        "stat_type": stat_type, "player": it.get("player"), "team": it.get("team"),
        "conference": it.get("conference"),
        "stat": str(val) if val is not None else None, "last_synced_at": now,
    })]


# --- /talent → cfbd_team_talent ---------------------------------------------
def _expand_talent(it, year, now):
    school = it.get("school")
    if school is None:
        return []
    yr = it.get("year") or year
    return [((yr, school), {
        "year": yr, "school": school, "talent": it.get("talent"),
        "last_synced_at": now,
    })]


# --- /recruiting/teams → cfbd_recruiting_teams ------------------------------
def _expand_recruiting_teams(it, year, now):
    team = it.get("team")
    if team is None:
        return []
    yr = it.get("year") or year
    return [((yr, team), {
        "year": yr, "team": team, "rank": it.get("rank"),
        "points": it.get("points"), "last_synced_at": now,
    })]


# --- /recruiting/players → cfbd_recruiting_players --------------------------
def _expand_recruiting_players(it, year, now):
    rid = it.get("id")
    if rid is None:
        return []
    return [((rid,), {
        "id": rid, "athlete_id": it.get("athleteId"),
        "recruit_type": it.get("recruitType"), "year": it.get("year") or year,
        "ranking": it.get("ranking"), "name": it.get("name"),
        "school": it.get("school"), "committed_to": it.get("committedTo"),
        "position": it.get("position"), "height": it.get("height"),
        "weight": it.get("weight"), "stars": it.get("stars"),
        "rating": it.get("rating"), "city": it.get("city"),
        "state_province": it.get("stateProvince"), "country": it.get("country"),
        "last_synced_at": now,
    })]


# --- /recruiting/groups → cfbd_recruiting_groups ----------------------------
def _expand_recruiting_groups(it, year, now):
    team, grp = it.get("team"), it.get("positionGroup")
    if team is None or grp is None:
        return []
    yr = it.get("startYear") or it.get("year") or year
    return [((yr, team, grp), {
        "year": yr, "team": team, "position_group": grp,
        "conference": it.get("conference"),
        "average_rating": it.get("averageRating"),
        "total_rating": it.get("totalRating"), "commits": it.get("commits"),
        "average_stars": it.get("averageStars"), "last_synced_at": now,
    })]


# --- /player/returning → cfbd_returning_production --------------------------
def _expand_returning(it, year, now):
    team = it.get("team")
    if team is None:
        return []
    season = it.get("season") or year
    return [((season, team), {
        "season": season, "team": team, "conference": it.get("conference"),
        "total_ppa": it.get("totalPPA"), "total_passing_ppa": it.get("totalPassingPPA"),
        "total_rushing_ppa": it.get("totalRushingPPA"),
        "total_receiving_ppa": it.get("totalReceivingPPA"),
        "percent_ppa": it.get("percentPPA"),
        "percent_passing_ppa": it.get("percentPassingPPA"),
        "percent_rushing_ppa": it.get("percentRushingPPA"),
        "percent_receiving_ppa": it.get("percentReceivingPPA"),
        "usage": it.get("usage"), "passing_usage": it.get("passingUsage"),
        "rushing_usage": it.get("rushingUsage"), "receiving_usage": it.get("receivingUsage"),
        "last_synced_at": now,
    })]


# --- /games/media → cfbd_game_media -----------------------------------------
def _expand_game_media(it, year, now):
    gid = it.get("id")
    if gid is None:
        return []
    media_type = it.get("mediaType") or ""
    outlet = it.get("outlet") or ""
    return [((gid, media_type, outlet), {
        "game_id": gid, "media_type": media_type, "outlet": outlet,
        "season": it.get("season") or year, "week": it.get("week"),
        "season_type": it.get("seasonType"), "start_time": it.get("startTime"),
        "is_start_time_tbd": it.get("isStartTimeTBD"),
        "home_team": it.get("homeTeam"), "away_team": it.get("awayTeam"),
        "last_synced_at": now,
    })]


# --- /games/weather → cfbd_game_weather -------------------------------------
def _expand_game_weather(it, year, now):
    gid = it.get("id")
    if gid is None:
        return []
    return [((gid,), {
        "game_id": gid, "season": it.get("season") or year, "week": it.get("week"),
        "season_type": it.get("seasonType"), "start_time": it.get("startTime"),
        "game_indoors": it.get("gameIndoors"), "home_team": it.get("homeTeam"),
        "away_team": it.get("awayTeam"), "venue_id": it.get("venueId"),
        "venue": it.get("venue"), "temperature": it.get("temperature"),
        "dew_point": it.get("dewPoint"), "humidity": it.get("humidity"),
        "precipitation": it.get("precipitation"), "snowfall": it.get("snowfall"),
        "wind_direction": it.get("windDirection"), "wind_speed": it.get("windSpeed"),
        "pressure": it.get("pressure"),
        "weather_condition_code": it.get("weatherConditionCode"),
        "weather_condition": it.get("weatherCondition"), "last_synced_at": now,
    })]


# --- /games/players → cfbd_game_player_stats (EAV, nested) -------------------
def _expand_game_player_stats(it, year, now):
    gid = it.get("id")
    if gid is None:
        return []
    out: list[tuple[tuple, dict]] = []
    for tm in it.get("teams") or []:
        team, conf, ha = tm.get("team"), tm.get("conference"), tm.get("homeAway")
        for cat in tm.get("categories") or []:
            cname = cat.get("name")
            for typ in cat.get("types") or []:
                tname = typ.get("name")
                for ath in typ.get("athletes") or []:
                    pid = ath.get("id")
                    if pid is None or cname is None or tname is None:
                        continue
                    val = ath.get("stat")
                    out.append(((gid, str(pid), cname, tname), {
                        "game_id": gid, "player_id": str(pid), "category": cname,
                        "stat_type": tname, "player": ath.get("name"), "team": team,
                        "conference": conf, "home_away": ha,
                        "stat": str(val) if val is not None else None,
                        "last_synced_at": now,
                    }))
    return out


# --- /drives → cfbd_drives --------------------------------------------------
def _expand_drives(it, year, now):
    did = it.get("id")
    if did is None:
        return []
    return [((str(did),), {
        "id": str(did), "game_id": it.get("gameId"), "offense": it.get("offense"),
        "offense_conference": it.get("offenseConference"), "defense": it.get("defense"),
        "defense_conference": it.get("defenseConference"),
        "drive_number": it.get("driveNumber"), "scoring": it.get("scoring"),
        "start_period": it.get("startPeriod"), "start_yardline": it.get("startYardline"),
        "start_yards_to_goal": it.get("startYardsToGoal"),
        "end_period": it.get("endPeriod"), "end_yardline": it.get("endYardline"),
        "end_yards_to_goal": it.get("endYardsToGoal"), "plays": it.get("plays"),
        "yards": it.get("yards"), "drive_result": it.get("driveResult"),
        "is_home_offense": it.get("isHomeOffense"), "last_synced_at": now,
    })]


# Endpoint key → season syncer. Endpoint keys match the provider's _FACT_ENDPOINTS.
_SYNCERS: dict[str, Callable[[Any, list[dict], int], Awaitable[tuple[int, int]]]] = {
    "lines": _sync_lines,
    "rankings": _sync_rankings,
    "game_team_stats": _sync_team_stats,
    "calendar": _make_generic(
        entity_type="cfbd_calendar", model=CfbdCalendar,
        index_elements=("season", "season_type", "week"),
        expand=_expand_calendar,
        entity_id=lambda it, yr: f"{it.get('season') or yr}:{it.get('seasonType') or 'regular'}:{it.get('week')}",
    ),
    "records": _make_generic(
        entity_type="cfbd_team_record", model=CfbdTeamRecord,
        index_elements=("year", "team_id"), expand=_expand_records,
        entity_id=lambda it, yr: f"{it.get('year') or yr}:{it.get('teamId')}",
    ),
    "sp_ratings": _make_generic(
        entity_type="cfbd_sp_rating", model=CfbdSpRating,
        index_elements=("year", "team"), expand=_expand_sp,
        entity_id=lambda it, yr: f"{it.get('year') or yr}:{it.get('team')}",
    ),
    "srs_ratings": _make_generic(
        entity_type="cfbd_srs_rating", model=CfbdSrsRating,
        index_elements=("year", "team"), expand=_expand_srs,
        entity_id=lambda it, yr: f"{it.get('year') or yr}:{it.get('team')}",
    ),
    "elo_ratings": _make_generic(
        entity_type="cfbd_elo_rating", model=CfbdEloRating,
        index_elements=("year", "team"), expand=_expand_elo,
        entity_id=lambda it, yr: f"{it.get('year') or yr}:{it.get('team')}",
    ),
    "fpi_ratings": _make_generic(
        entity_type="cfbd_fpi_rating", model=CfbdFpiRating,
        index_elements=("year", "team"), expand=_expand_fpi,
        entity_id=lambda it, yr: f"{it.get('year') or yr}:{it.get('team')}",
    ),
    "team_season_stats": _make_generic(
        entity_type="cfbd_team_season_stat", model=CfbdTeamSeasonStat,
        index_elements=("season", "team", "stat_name"),
        expand=_expand_team_season_stats, entity_id=None,  # EAV: skip snapshots
    ),
    "team_season_adv_stats": _make_generic(
        entity_type="cfbd_team_season_adv_stat", model=CfbdTeamSeasonAdvStat,
        index_elements=("season", "team", "stat"),
        expand=_expand_team_season_adv,
        entity_id=lambda it, yr: f"{it.get('season') or yr}:{it.get('team')}",
    ),
    "player_season_stats": _make_generic(
        entity_type="cfbd_player_season_stat", model=CfbdPlayerSeasonStat,
        index_elements=("season", "player_id", "category", "stat_type"),
        expand=_expand_player_season_stats, entity_id=None,  # EAV: skip snapshots
    ),
    "talent": _make_generic(
        entity_type="cfbd_team_talent", model=CfbdTeamTalent,
        index_elements=("year", "school"), expand=_expand_talent,
        entity_id=lambda it, yr: f"{it.get('year') or yr}:{it.get('school')}",
    ),
    "recruiting_teams": _make_generic(
        entity_type="cfbd_recruiting_team", model=CfbdRecruitingTeam,
        index_elements=("year", "team"), expand=_expand_recruiting_teams,
        entity_id=lambda it, yr: f"{it.get('year') or yr}:{it.get('team')}",
    ),
    "recruiting_players": _make_generic(
        entity_type="cfbd_recruiting_player", model=CfbdRecruitingPlayer,
        index_elements=("id",), expand=_expand_recruiting_players,
        entity_id=lambda it, yr: it.get("id"),
    ),
    "recruiting_groups": _make_generic(
        entity_type="cfbd_recruiting_group", model=CfbdRecruitingGroup,
        index_elements=("year", "team", "position_group"),
        expand=_expand_recruiting_groups,
        entity_id=lambda it, yr: f"{yr}:{it.get('team')}:{it.get('positionGroup')}",
    ),
    "returning_production": _make_generic(
        entity_type="cfbd_returning_production", model=CfbdReturningProduction,
        index_elements=("season", "team"), expand=_expand_returning,
        entity_id=lambda it, yr: f"{it.get('season') or yr}:{it.get('team')}",
    ),
    "game_media": _make_generic(
        entity_type="cfbd_game_media", model=CfbdGameMedia,
        index_elements=("game_id", "media_type", "outlet"), expand=_expand_game_media,
        entity_id=lambda it, yr: f"{it.get('id')}:{it.get('mediaType')}:{it.get('outlet')}",
    ),
    "game_weather": _make_generic(
        entity_type="cfbd_game_weather", model=CfbdGameWeather,
        index_elements=("game_id",), expand=_expand_game_weather,
        entity_id=lambda it, yr: it.get("id"),
    ),
    "game_player_stats": _make_generic(
        entity_type="cfbd_game_player_stat", model=CfbdGamePlayerStat,
        index_elements=("game_id", "player_id", "category", "stat_type"),
        expand=_expand_game_player_stats, entity_id=None,  # EAV: skip snapshots
    ),
    "drives": _make_generic(
        entity_type="cfbd_drive", model=CfbdDrive,
        index_elements=("id",), expand=_expand_drives,
        entity_id=lambda it, yr: it.get("id"),
    ),
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
            ep: dict[str, Any] = {
                "synced": [], "skipped": [], "errors": [], "processed": 0, "changed": 0,
            }
            for year in range(start, current + 1):
                if coverage.get((endpoint, year)):  # finished season already ingested
                    ep["skipped"].append(year)
                    continue
                # Isolate per-(endpoint, year) failures (e.g. a premium endpoint
                # 403): log and move on without marking the season complete, so it
                # self-heals on the next run instead of failing every other table.
                try:
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
                except Exception:
                    await db.rollback()
                    logger.exception("cfbd_facts %s %s failed", endpoint, year)
                    ep["errors"].append(year)
                    continue

                ep["synced"].append(year)
                ep["processed"] += processed
                ep["changed"] += changed
            result[endpoint] = ep

    logger.info("cfbd_facts sync: %s", result)
    return result
