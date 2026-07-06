from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import String, func, inspect, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_admin
from app.core.database import get_db
from app.models import (
    CfbdBettingLine,
    CfbdCalendar,
    CfbdCoach,
    CfbdCoachSeason,
    CfbdConference,
    CfbdDraftPosition,
    CfbdDraftTeam,
    CfbdDrive,
    CfbdEloRating,
    CfbdFactCoverage,
    CfbdFpiRating,
    CfbdGame,
    CfbdGameMedia,
    CfbdGamePlayerStat,
    CfbdGameTeamStat,
    CfbdGameWeather,
    CfbdPlay,
    CfbdPlayerSeasonStat,
    CfbdRanking,
    CfbdRecruitingGroup,
    CfbdRecruitingPlayer,
    CfbdRecruitingTeam,
    CfbdReturningProduction,
    CfbdSpRating,
    CfbdSrsRating,
    CfbdTeam,
    CfbdTeamRecord,
    CfbdTeamSeasonAdvStat,
    CfbdTeamSeasonStat,
    CfbdTeamTalent,
    CfbdVenue,
)

router = APIRouter(prefix="/admin/cfbd", dependencies=[Depends(require_admin)])

TABLE_MODELS: dict[str, type] = {
    # Ratings
    "rankings": CfbdRanking,
    "sp-ratings": CfbdSpRating,
    "srs-ratings": CfbdSrsRating,
    "elo-ratings": CfbdEloRating,
    "fpi-ratings": CfbdFpiRating,
    # Season
    "calendar": CfbdCalendar,
    "team-records": CfbdTeamRecord,
    "team-season-stats": CfbdTeamSeasonStat,
    "team-adv-stats": CfbdTeamSeasonAdvStat,
    "team-talent": CfbdTeamTalent,
    "returning-production": CfbdReturningProduction,
    # Recruiting
    "recruiting-teams": CfbdRecruitingTeam,
    "recruiting-players": CfbdRecruitingPlayer,
    "recruiting-groups": CfbdRecruitingGroup,
    # Games
    "games": CfbdGame,
    "betting-lines": CfbdBettingLine,
    "game-media": CfbdGameMedia,
    "game-weather": CfbdGameWeather,
    "game-team-stats": CfbdGameTeamStat,
    "game-player-stats": CfbdGamePlayerStat,
    # Single-purpose
    "drives": CfbdDrive,
    "player-season-stats": CfbdPlayerSeasonStat,
    # Dimensions + internal
    "conferences": CfbdConference,
    "venues": CfbdVenue,
    "coaches": CfbdCoach,
    "teams": CfbdTeam,
    "coach-seasons": CfbdCoachSeason,
    "draft-positions": CfbdDraftPosition,
    "draft-teams": CfbdDraftTeam,
    "fact-coverage": CfbdFactCoverage,
}

SEASON_COLUMNS = ("season", "year", "season_year")

# Human-readable labels for fact coverage endpoints (snake_case → display name)
FACT_ENDPOINT_LABELS: dict[str, dict[str, str]] = {
    # Ratings
    "rankings": {"label": "Poll Rankings", "group": "Ratings"},
    "sp_ratings": {"label": "SP+ Ratings", "group": "Ratings"},
    "srs_ratings": {"label": "SRS Ratings", "group": "Ratings"},
    "elo_ratings": {"label": "Elo Ratings", "group": "Ratings"},
    "fpi_ratings": {"label": "FPI Ratings", "group": "Ratings"},
    # Season
    "calendar": {"label": "Calendar", "group": "Season"},
    "records": {"label": "Team Records", "group": "Season"},
    "team_season_stats": {"label": "Team Season Stats", "group": "Season"},
    "team_season_adv_stats": {"label": "Advanced Team Stats", "group": "Season"},
    "talent": {"label": "Team Talent", "group": "Season"},
    "returning_production": {"label": "Returning Production", "group": "Season"},
    # Recruiting
    "recruiting_teams": {"label": "Recruiting Teams", "group": "Recruiting"},
    "recruiting_players": {"label": "Recruiting Players", "group": "Recruiting"},
    "recruiting_groups": {"label": "Recruiting Groups", "group": "Recruiting"},
    # Games
    "lines": {"label": "Betting Lines", "group": "Games"},
    "game_media": {"label": "Media / Broadcast", "group": "Games"},
    "game_weather": {"label": "Weather", "group": "Games"},
    "game_team_stats": {"label": "Team Box Stats", "group": "Games"},
    "game_player_stats": {"label": "Player Box Stats", "group": "Games"},
    # Single-purpose
    "drives": {"label": "Drives", "group": "Drives"},
    "player_season_stats": {"label": "Player Season Stats", "group": "Players"},
}


class CfbdTableResponse(BaseModel):
    rows: list[dict[str, Any]]
    total: int
    season_max: int | None
    team_logos: dict[str, str | None] = {}


# Columns that may contain a team/school name — used to build the team_logos
# lookup map for frontend logo rendering.
TEAM_NAME_COLUMNS: set[str] = {
    "team",
    "school",
    "home_team",
    "away_team",
    "offense",
    "defense",
    "committed_to",
}


def _has_col(model: type, name: str) -> bool:
    return hasattr(model, name)


def _apply_eq_filter(stmt: Any, model: type, param: Any, *column_names: str) -> Any:
    if param is None:
        return stmt
    for col_name in column_names:
        if _has_col(model, col_name):
            return stmt.where(getattr(model, col_name) == param)
    return stmt


def _apply_ilike_filter(stmt: Any, model: type, param: str | None, *column_names: str) -> Any:
    """Partial-match filter — wraps the value in % wildcards and applies ILIKE
    across every matching column via OR (any column can match)."""
    if not param:
        return stmt
    pattern = f"%{param}%"
    clauses = []
    for col_name in column_names:
        if _has_col(model, col_name):
            clauses.append(getattr(model, col_name).ilike(pattern))
    if not clauses:
        return stmt
    return stmt.where(or_(*clauses))


def _apply_text_search(stmt: Any, model: type, term: str | None) -> Any:
    if not term:
        return stmt
    mapper = inspect(model)
    patterns = []
    for column in mapper.columns:
        try:
            if isinstance(column.type, String):
                patterns.append(column.ilike(f"%{term}%"))
        except Exception:
            continue
    if not patterns:
        return stmt
    return stmt.where(or_(*patterns))


def _serialize_rows(rows: list[Any], model: type) -> list[dict[str, Any]]:
    mapper = inspect(model)
    col_names = [c.key for c in mapper.columns]
    return [{col: getattr(row, col) for col in col_names} for row in rows]


def _order_columns(model: type) -> list[Any]:
    if _has_col(model, "last_synced_at"):
        return [getattr(model, "last_synced_at").desc()]
    pk = list(inspect(model).primary_key)
    return pk if pk else [getattr(model, list(inspect(model).columns.keys())[0])]


async def _season_max(db: AsyncSession, model: type) -> int | None:
    for col_name in SEASON_COLUMNS:
        if _has_col(model, col_name):
            col = getattr(model, col_name)
            return await db.scalar(select(func.max(col)))
    return None


async def _build_team_logos(
    db: AsyncSession, rows: list[dict[str, Any]], model: type
) -> dict[str, str | None]:
    """Extract team names from serialized rows and build a name → first-logo-URL map."""
    mapper = inspect(model)
    team_cols = [c.key for c in mapper.columns if c.key in TEAM_NAME_COLUMNS]
    if not team_cols:
        return {}

    team_names: set[str] = set()
    for row in rows:
        for col in team_cols:
            val = row.get(col)
            if isinstance(val, str) and val:
                team_names.add(val)

    if not team_names:
        return {}

    stmt = select(CfbdTeam.school, CfbdTeam.logos).where(
        CfbdTeam.school.in_(team_names)
    )
    result = await db.execute(stmt)
    return {
        school: (logos[0] if logos else None)
        for school, logos in result.all()
    }


class CoverageSeasonItem(BaseModel):
    year: int
    complete: bool
    row_count: int
    last_synced_at: str | None = None


class CoverageFactEndpoint(BaseModel):
    endpoint: str
    label: str
    group: str
    seasons: list[CoverageSeasonItem]


class CoverageGameSeason(BaseModel):
    season_year: int
    total: int
    completed: int
    last_synced_at: str | None = None


class CoverageDimension(BaseModel):
    name: str
    label: str
    count: int
    last_synced_at: str | None = None


class CoveragePlays(BaseModel):
    seasons: list[dict[str, Any]]


class CfbdCoverageResponse(BaseModel):
    facts: list[CoverageFactEndpoint]
    games: list[CoverageGameSeason]
    dimensions: list[CoverageDimension]
    plays: CoveragePlays


@router.get("/coverage", response_model=CfbdCoverageResponse)
async def get_coverage_dashboard(db: AsyncSession = Depends(get_db)):
    # --- Facts ---
    coverage_rows = (
        (
            await db.execute(
                select(CfbdFactCoverage).order_by(
                    CfbdFactCoverage.endpoint, CfbdFactCoverage.season_year
                )
            )
        )
        .scalars()
        .all()
    )

    facts_by_endpoint: dict[str, list[CoverageSeasonItem]] = {}
    for row in coverage_rows:
        meta = FACT_ENDPOINT_LABELS.get(row.endpoint, {"label": row.endpoint, "group": "Other"})
        if row.endpoint not in facts_by_endpoint:
            facts_by_endpoint[row.endpoint] = []
        facts_by_endpoint[row.endpoint].append(
            CoverageSeasonItem(
                year=row.season_year,
                complete=row.complete if row.complete is not None else False,
                row_count=row.row_count or 0,
                last_synced_at=row.last_synced_at.isoformat() if row.last_synced_at else None,
            )
        )

    facts_list: list[CoverageFactEndpoint] = []
    for endpoint, seasons in sorted(facts_by_endpoint.items()):
        meta = FACT_ENDPOINT_LABELS.get(endpoint, {"label": endpoint, "group": "Other"})
        facts_list.append(
            CoverageFactEndpoint(
                endpoint=endpoint,
                label=meta["label"],
                group=meta["group"],
                seasons=sorted(seasons, key=lambda s: s.year),
            )
        )

    # --- Games ---
    games_rows = (
        (
            await db.execute(
                select(
                    CfbdGame.season_year,
                    func.count().label("total"),
                    func.count().filter(CfbdGame.completed.is_(True)).label("completed"),
                    func.max(CfbdGame.last_synced_at).label("last_synced_at"),
                )
                .group_by(CfbdGame.season_year)
                .order_by(CfbdGame.season_year)
            )
        )
        .all()
    )

    games_list: list[CoverageGameSeason] = []
    for row in games_rows:
        games_list.append(
            CoverageGameSeason(
                season_year=row.season_year,
                total=row.total or 0,
                completed=row.completed or 0,
                last_synced_at=row.last_synced_at.isoformat() if row.last_synced_at else None,
            )
        )

    # --- Dimensions ---
    dim_queries = [
        ("teams", "Teams", CfbdTeam),
        ("conferences", "Conferences", CfbdConference),
        ("venues", "Venues", CfbdVenue),
        ("coaches", "Coaches", CfbdCoach),
        ("coach_seasons", "Coach Seasons", CfbdCoachSeason),
        ("draft_positions", "Draft Positions", CfbdDraftPosition),
        ("draft_teams", "Draft Teams", CfbdDraftTeam),
    ]

    dimensions_list: list[CoverageDimension] = []
    for name, label, model in dim_queries:
        result = await db.execute(
            select(
                func.count().label("count"),
                func.max(model.last_synced_at).label("last_synced_at"),
            )
        )
        row = result.one()
        dimensions_list.append(
            CoverageDimension(
                name=name,
                label=label,
                count=row.count or 0,
                last_synced_at=row.last_synced_at.isoformat() if row.last_synced_at else None,
            )
        )

    # --- Plays ---
    plays_rows = (
        (
            await db.execute(
                select(
                    CfbdPlay.season,
                    func.count().label("play_count"),
                    func.count(func.distinct(CfbdPlay.game_id)).label("games_with_plays"),
                )
                .group_by(CfbdPlay.season)
                .order_by(CfbdPlay.season)
            )
        )
        .all()
    )

    plays_seasons: list[dict[str, Any]] = []
    for row in plays_rows:
        plays_seasons.append(
            {
                "season": row.season,
                "play_count": row.play_count or 0,
                "games_with_plays": row.games_with_plays or 0,
            }
        )

    return CfbdCoverageResponse(
        facts=facts_list,
        games=games_list,
        dimensions=dimensions_list,
        plays=CoveragePlays(seasons=plays_seasons),
    )


class DistinctValuesResponse(BaseModel):
    values: list[str]


SAFE_DISTINCT_COLUMNS = {
    "conference",
    "classification",
    "division",
    "school",
    "team",
    "week",
    "media_type",
    "season_type",
    "category",
    "poll",
    "provider",
    "position",
    "stat_name",
    "stat_type",
    "stars",
}


# Column name aliases: when a column doesn't exist on a model, try these fallbacks.
COLUMN_ALIASES: dict[str, list[str]] = {
    "stat_name": ["stat_name", "stat_type", "stat"],
    "position": ["position", "position_group"],
}

# Column groups: when a filter key spans multiple columns, UNION their distinct values.
COLUMN_GROUPS: dict[str, list[str]] = {
    "team": ["team", "home_team", "away_team", "offense", "defense"],
}


@router.get("/{table_slug}/distinct/{column}", response_model=DistinctValuesResponse)
async def get_distinct_values(
    table_slug: str,
    column: str,
    db: AsyncSession = Depends(get_db),
):
    model = TABLE_MODELS.get(table_slug)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Unknown CFBD table: {table_slug}")

    if column not in SAFE_DISTINCT_COLUMNS:
        raise HTTPException(status_code=400, detail=f"Column not allowed for distinct query: {column}")

    # Handle column groups (UNION across multiple columns)
    if column in COLUMN_GROUPS:
        group_cols = [c for c in COLUMN_GROUPS[column] if _has_col(model, c)]
        if not group_cols:
            return DistinctValuesResponse(values=[])
        if len(group_cols) == 1:
            col = getattr(model, group_cols[0])
            rows = (
                (await db.execute(select(func.distinct(col)).where(col.isnot(None)).order_by(col)))
                .scalars()
                .all()
            )
            return DistinctValuesResponse(values=[str(v) for v in rows if v is not None])
        # UNION distinct values from multiple columns
        queries = [
            select(func.distinct(getattr(model, c)).label("val")).where(getattr(model, c).isnot(None))
            for c in group_cols
        ]
        union_stmt = queries[0].union(*queries[1:]).order_by("val")
        rows = (await db.execute(union_stmt)).scalars().all()
        return DistinctValuesResponse(values=[str(v) for v in rows if v is not None])

    # Try exact column first, then aliases
    candidates = COLUMN_ALIASES.get(column, [column])
    col = None
    for candidate in candidates:
        if _has_col(model, candidate):
            col = getattr(model, candidate)
            break

    if col is None:
        return DistinctValuesResponse(values=[])

    rows = (
        (await db.execute(select(func.distinct(col)).where(col.isnot(None)).order_by(col)))
        .scalars()
        .all()
    )
    return DistinctValuesResponse(values=[str(v) for v in rows if v is not None])


@router.get("/{table_slug}", response_model=CfbdTableResponse)
async def list_cfbd_table_rows(
    table_slug: str,
    season: int | None = Query(None),
    season_type: str | None = Query(None),
    week: int | None = Query(None),
    team: str | None = Query(None),
    school: str | None = Query(None),
    conference: str | None = Query(None),
    classification: str | None = Query(None),
    game_id: int | None = Query(None),
    coach_id: str | None = Query(None),
    provider: str | None = Query(None),
    poll: str | None = Query(None),
    position: str | None = Query(None),
    category: str | None = Query(None),
    stat_name: str | None = Query(None),
    stars: int | None = Query(None),
    search: str | None = Query(None),
    sort: str | None = Query(None),
    order: str | None = Query(None, pattern="^(asc|desc)$"),
    limit: int = Query(250, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    if table_slug == "draft":
        positions = (
            (
                await db.execute(
                    select(CfbdDraftPosition).order_by(CfbdDraftPosition.name)
                )
            )
            .scalars()
            .all()
        )
        teams = (
            (
                await db.execute(
                    select(CfbdDraftTeam).order_by(CfbdDraftTeam.display_name)
                )
            )
            .scalars()
            .all()
        )
        rows = [
            {
                "name": p.name,
                "abbreviation": p.abbreviation,
                "display_name": None,
                "location": None,
                "nickname": None,
                "source": "position",
                "last_synced_at": p.last_synced_at,
            }
            for p in positions
        ] + [
            {
                "name": None,
                "abbreviation": None,
                "display_name": t.display_name,
                "location": t.location,
                "nickname": t.nickname,
                "source": "team",
                "last_synced_at": t.last_synced_at,
            }
            for t in teams
        ]
        if search:
            term = search.lower()
            rows = [
                row
                for row in rows
                if term
                in " ".join(
                    str(v).lower() for v in row.values() if isinstance(v, str) and v
                )
            ]
        total = len(rows)
        page = rows[offset : offset + limit]
        return CfbdTableResponse(rows=page, total=total, season_max=None, team_logos={})

    model = TABLE_MODELS.get(table_slug)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Unknown CFBD table: {table_slug}")

    stmt = select(model)
    stmt = _apply_eq_filter(stmt, model, season, "season", "year", "season_year")
    stmt = _apply_eq_filter(stmt, model, season_type, "season_type")
    stmt = _apply_eq_filter(stmt, model, week, "week")
    stmt = _apply_ilike_filter(stmt, model, team, "team", "home_team", "away_team")
    stmt = _apply_ilike_filter(stmt, model, school, "school")
    stmt = _apply_ilike_filter(stmt, model, conference, "conference", "home_conference", "away_conference")
    stmt = _apply_eq_filter(stmt, model, classification, "classification")
    stmt = _apply_eq_filter(stmt, model, game_id, "game_id")
    stmt = _apply_eq_filter(stmt, model, coach_id, "coach_id")
    stmt = _apply_ilike_filter(stmt, model, provider, "provider")
    stmt = _apply_ilike_filter(stmt, model, poll, "poll")
    stmt = _apply_ilike_filter(stmt, model, position, "position", "position_group")
    stmt = _apply_ilike_filter(stmt, model, category, "category")
    stmt = _apply_ilike_filter(stmt, model, stat_name, "stat_name", "stat_type", "stat")
    stmt = _apply_eq_filter(stmt, model, stars, "stars")
    stmt = _apply_text_search(stmt, model, search)

    # ── sorting ──────────────────────────────────────────────────
    if sort and _has_col(model, sort):
        col = getattr(model, sort)
        stmt = stmt.order_by(col.desc() if order == "desc" else col.asc())

    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        (
            await db.execute(
                stmt.limit(limit).offset(offset)
            )
        )
        .scalars()
        .all()
    )

    serialized = _serialize_rows(rows, model)

    # Enrich coach-seasons with coach full name
    if table_slug == "coach-seasons" and serialized:
        coach_ids = {row["coach_id"] for row in serialized if row.get("coach_id")}
        if coach_ids:
            coach_rows = (
                (await db.execute(
                    select(CfbdCoach.coach_id, CfbdCoach.first_name, CfbdCoach.last_name).where(
                        CfbdCoach.coach_id.in_(coach_ids)
                    )
                ))
                .all()
            )
            coach_name_map = {
                cid: f"{fn or ''} {ln or ''}".strip() or cid
                for cid, fn, ln in coach_rows
            }
            for row in serialized:
                cid = row.get("coach_id")
                if cid:
                    row["coach_name"] = coach_name_map.get(cid, cid)

    return CfbdTableResponse(
        rows=serialized,
        total=total or 0,
        season_max=await _season_max(db, model),
        team_logos=await _build_team_logos(db, serialized, model),
    )
