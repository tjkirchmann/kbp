from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_admin
from app.core.database import get_db
from app.models.cfbd import (
    CfbdConference,
    CfbdEloRating,
    CfbdFpiRating,
    CfbdGame,
    CfbdPlayerSeasonStat,
    CfbdRanking,
    CfbdSpRating,
    CfbdSrsRating,
    CfbdTeam,
    CfbdTeamRecord,
    CfbdTeamSeasonAdvStat,
)

router = APIRouter(
    prefix="/admin/cfbd/analytics", dependencies=[Depends(require_admin)]
)

# ──────────────────────────────────────────────────────────────────────
# Response schemas
# ──────────────────────────────────────────────────────────────────────


class SeasonListItem(BaseModel):
    season: int


class SeasonListResponse(BaseModel):
    seasons: list[int]


class TeamRatingRow(BaseModel):
    team: str
    conference: str | None
    rating: float | None
    ranking: int | None
    logo: str | None
    color: str | None


class RatingsBundle(BaseModel):
    elo: list[TeamRatingRow]
    sp_plus: list[TeamRatingRow]
    srs: list[TeamRatingRow]
    fpi: list[TeamRatingRow]


class OverUnderTeam(BaseModel):
    team: str
    logo: str | None
    color: str | None
    expected_wins: float
    actual_wins: int
    delta: float  # positive = overachiever


class StandingsRow(BaseModel):
    team: str
    logo: str | None
    conf_wins: int
    conf_losses: int
    overall_wins: int
    overall_losses: int


class StandingsByConference(BaseModel):
    SEC: list[StandingsRow] = []
    Big_Ten: list[StandingsRow] = []
    ACC: list[StandingsRow] = []
    Big_12: list[StandingsRow] = []
    Mountain_West: list[StandingsRow] = []
    AAC: list[StandingsRow] = []
    Sun_Belt: list[StandingsRow] = []
    MAC: list[StandingsRow] = []
    Conference_USA: list[StandingsRow] = []
    Pac_12: list[StandingsRow] = []
    Independents: list[StandingsRow] = []


class SeasonSummaryResponse(BaseModel):
    season: int
    team_count: int
    ratings: RatingsBundle
    overachievers: list[OverUnderTeam]
    underachievers: list[OverUnderTeam]
    standings: StandingsByConference


class PlayerLeaderRow(BaseModel):
    player: str
    team: str
    logo: str | None
    stat_value: str


class PlayerLeadersResponse(BaseModel):
    season: int
    category: str
    leaders: list[PlayerLeaderRow]


class TeamSlicerRow(BaseModel):
    team: str
    conference: str | None
    logo: str | None
    color: str | None
    abbreviation: str | None
    value: float | None


class TeamSlicerResponse(BaseModel):
    season: int
    metric: str
    teams: list[TeamSlicerRow]


class TeamScheduleGame(BaseModel):
    game_id: int
    opponent: str
    opponent_logo: str | None
    date: str | None
    home_away: str
    team_score: int | None
    opponent_score: int | None
    result: str  # "W", "L", or "—"
    bowl_name: str | None


class TeamPercentileRow(BaseModel):
    stat: str
    label: str
    value: str | None
    percentile: float | None
    rank: int | None
    total: int


class TeamDetailResponse(BaseModel):
    season: int
    team: str
    logo: str | None
    color: str | None
    conference: str | None
    record: str | None
    expected_wins: float | None
    schedule: list[TeamScheduleGame]
    player_leaders: dict[str, list[PlayerLeaderRow]]
    percentiles: list[TeamPercentileRow]


# ──────────────────────────────────────────────────────────────────────
# Helper: build a team→metadata lookup (logo, color, abbreviation, conference)
# ──────────────────────────────────────────────────────────────────────


async def _team_metadata_map(
    db: AsyncSession, team_names: set[str]
) -> dict[str, dict[str, str | None]]:
    if not team_names:
        return {}
    stmt = select(
        CfbdTeam.school,
        CfbdTeam.logos,
        CfbdTeam.color,
        CfbdTeam.abbreviation,
        CfbdTeam.conference,
    ).where(CfbdTeam.school.in_(team_names))
    rows = (await db.execute(stmt)).all()
    return {
        school: {
            "logo": logos[0] if logos else None,
            "color": color,
            "abbreviation": abbreviation,
            "conference": conference,
        }
        for school, logos, color, abbreviation, conference in rows
    }


# ──────────────────────────────────────────────────────────────────────
# GET /seasons
# ──────────────────────────────────────────────────────────────────────


@router.get("/seasons", response_model=SeasonListResponse)
async def list_available_seasons(db: AsyncSession = Depends(get_db)):
    """Return every season that has at least one record in cfbd_sp_ratings."""
    rows = (
        await db.execute(
            select(CfbdSpRating.year).distinct().order_by(CfbdSpRating.year.desc())
        )
    ).scalars().all()
    return SeasonListResponse(seasons=list(rows))


# ──────────────────────────────────────────────────────────────────────
# GET /season-summary
# ──────────────────────────────────────────────────────────────────────


CONFERENCE_STANDING_ORDER: list[tuple[str, str]] = [
    ("SEC", "SEC"),
    ("Big Ten", "Big_Ten"),
    ("ACC", "ACC"),
    ("Big 12", "Big_12"),
    ("Mountain West", "Mountain_West"),
    ("American Athletic", "AAC"),
    ("Sun Belt", "Sun_Belt"),
    ("Mid-American", "MAC"),
    ("Conference USA", "Conference_USA"),
    ("Pac-12", "Pac_12"),
    ("FBS Independents", "Independents"),
]


async def _ratings_for_season(db: AsyncSession, season: int) -> RatingsBundle:
    """Build each ratings list with team metadata (logo, color, conference)."""
    # ── Elo ──
    elo_rows = (
        (
            await db.execute(
                select(CfbdEloRating)
                .where(CfbdEloRating.year == season)
                .order_by(CfbdEloRating.elo.desc())
            )
        )
        .scalars()
        .all()
    )
    elo_teams = {r.team for r in elo_rows}
    meta = await _team_metadata_map(db, elo_teams)
    elo = [
        TeamRatingRow(
            team=r.team,
            conference=r.conference,
            rating=r.elo,
            ranking=idx + 1,
            logo=meta.get(r.team, {}).get("logo"),
            color=meta.get(r.team, {}).get("color"),
        )
        for idx, r in enumerate(elo_rows)
    ]

    # ── SP+ ──
    sp_rows = (
        (
            await db.execute(
                select(CfbdSpRating)
                .where(CfbdSpRating.year == season)
                .order_by(CfbdSpRating.rating.desc())
            )
        )
        .scalars()
        .all()
    )
    sp_teams = {r.team for r in sp_rows}
    meta_sp = await _team_metadata_map(db, sp_teams)
    sp_plus = [
        TeamRatingRow(
            team=r.team,
            conference=r.conference,
            rating=r.rating,
            ranking=r.ranking,
            logo=meta_sp.get(r.team, {}).get("logo"),
            color=meta_sp.get(r.team, {}).get("color"),
        )
        for r in sp_rows
    ]

    # ── SRS ──
    srs_rows = (
        (
            await db.execute(
                select(CfbdSrsRating)
                .where(CfbdSrsRating.year == season)
                .order_by(CfbdSrsRating.rating.desc())
            )
        )
        .scalars()
        .all()
    )
    srs_teams = {r.team for r in srs_rows}
    meta_srs = await _team_metadata_map(db, srs_teams)
    srs = [
        TeamRatingRow(
            team=r.team,
            conference=r.conference,
            rating=r.rating,
            ranking=r.ranking,
            logo=meta_srs.get(r.team, {}).get("logo"),
            color=meta_srs.get(r.team, {}).get("color"),
        )
        for r in srs_rows
    ]

    # ── FPI ──
    fpi_rows = (
        (
            await db.execute(
                select(CfbdFpiRating)
                .where(CfbdFpiRating.year == season)
                .order_by(CfbdFpiRating.fpi.desc())
            )
        )
        .scalars()
        .all()
    )
    fpi_teams = {r.team for r in fpi_rows}
    meta_fpi = await _team_metadata_map(db, fpi_teams)
    fpi = [
        TeamRatingRow(
            team=r.team,
            conference=r.conference,
            rating=r.fpi,
            ranking=idx + 1,
            logo=meta_fpi.get(r.team, {}).get("logo"),
            color=meta_fpi.get(r.team, {}).get("color"),
        )
        for idx, r in enumerate(fpi_rows)
    ]

    return RatingsBundle(elo=elo, sp_plus=sp_plus, srs=srs, fpi=fpi)


async def _over_under(
    db: AsyncSession, season: int
) -> tuple[list[OverUnderTeam], list[OverUnderTeam]]:
    """Return top 5 overachievers and top 5 underachievers by delta (FBS only)."""
    # Get FBS team names to filter out D-II/D-III schools
    fbs_teams = (
        await db.execute(
            select(CfbdTeam.school).where(CfbdTeam.classification == "fbs")
        )
    ).scalars().all()
    fbs_set = set(fbs_teams)

    rows = (
        (
            await db.execute(
                select(CfbdTeamRecord).where(CfbdTeamRecord.year == season)
            )
        )
        .scalars()
        .all()
    )

    teams = []
    for r in rows:
        if (
            r.expected_wins is not None
            and r.total_wins is not None
            and r.team in fbs_set
        ):
            teams.append(
                {
                    "team": r.team,
                    "expected_wins": r.expected_wins,
                    "actual_wins": r.total_wins,
                    "delta": r.total_wins - r.expected_wins,
                }
            )

    teams.sort(key=lambda t: t["delta"], reverse=True)
    over = teams[:5]
    under = sorted(teams[-5:], key=lambda t: t["delta"])
    team_names = {t["team"] for t in (*over, *under)}
    meta = await _team_metadata_map(db, team_names)

    return (
        [
            OverUnderTeam(
                team=t["team"],
                logo=meta.get(t["team"], {}).get("logo"),
                color=meta.get(t["team"], {}).get("color"),
                expected_wins=round(t["expected_wins"], 1),
                actual_wins=t["actual_wins"],
                delta=round(t["delta"], 1),
            )
            for t in over
        ],
        [
            OverUnderTeam(
                team=t["team"],
                logo=meta.get(t["team"], {}).get("logo"),
                color=meta.get(t["team"], {}).get("color"),
                expected_wins=round(t["expected_wins"], 1),
                actual_wins=t["actual_wins"],
                delta=round(t["delta"], 1),
            )
            for t in under
        ],
    )


async def _standings(
    db: AsyncSession, season: int
) -> StandingsByConference:
    """Build conference standings from cfbd_team_records."""
    rows = (
        (
            await db.execute(
                select(CfbdTeamRecord).where(CfbdTeamRecord.year == season)
            )
        )
        .scalars()
        .all()
    )

    # Group by conference
    by_conf: dict[str, list[CfbdTeamRecord]] = {}
    for r in rows:
        conf = r.conference or "Independents"
        by_conf.setdefault(conf, []).append(r)

    # Map conference display names to keys
    import re

    def conf_key(raw: str) -> str:
        return re.sub(r"[ /]", "_", raw).replace(".", "") if raw else "Independents"

    all_team_names: set[str] = set()
    for records in by_conf.values():
        for r in records:
            if r.team:
                all_team_names.add(r.team)
    meta = await _team_metadata_map(db, all_team_names)

    def build_standings(conf_name: str) -> list[StandingsRow]:
        records = by_conf.get(conf_name, [])
        # Sort by conference wins desc, then overall wins desc
        records.sort(
            key=lambda r: (
                -(r.conference_wins or 0),
                -(r.total_wins or 0),
            )
        )
        return [
            StandingsRow(
                team=r.team or "Unknown",
                logo=meta.get(r.team or "", {}).get("logo"),
                conf_wins=r.conference_wins or 0,
                conf_losses=r.conference_losses or 0,
                overall_wins=r.total_wins or 0,
                overall_losses=r.total_losses or 0,
            )
            for r in records
        ]

    result = StandingsByConference()
    for conf_name, field in CONFERENCE_STANDING_ORDER:
        standings_list = build_standings(conf_name)
        if standings_list:
            setattr(result, field, standings_list)

    # Catch any conferences not in our ordered list
    for conf_name in by_conf:
        mapped = False
        for cname, cfield in CONFERENCE_STANDING_ORDER:
            if cname == conf_name:
                mapped = True
                break
        if not mapped:
            key = conf_key(conf_name)
            if hasattr(result, key):
                setattr(result, key, build_standings(conf_name))

    return result


@router.get("/season-summary", response_model=SeasonSummaryResponse)
async def season_summary(
    season: int = Query(..., ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
):
    # Verify season exists
    exists = await db.scalar(
        select(func.count()).select_from(CfbdSpRating).where(CfbdSpRating.year == season)
    )
    if not exists:
        raise HTTPException(status_code=404, detail=f"No data for season {season}")

    ratings = await _ratings_for_season(db, season)
    over, under = await _over_under(db, season)
    standings = await _standings(db, season)

    team_count_row = await db.scalar(
        select(func.count())
        .select_from(CfbdTeamRecord)
        .where(CfbdTeamRecord.year == season)
    )

    return SeasonSummaryResponse(
        season=season,
        team_count=team_count_row or 0,
        ratings=ratings,
        overachievers=over,
        underachievers=under,
        standings=standings,
    )


# ──────────────────────────────────────────────────────────────────────
# GET /player-leaders
# ──────────────────────────────────────────────────────────────────────

PLAYER_CATEGORIES = {
    "passing",
    "rushing",
    "receiving",
    "tackles",
    "interceptions",
    "kicking",
    "punting",
    "defense",
    "fumbles",
}


@router.get("/player-leaders", response_model=PlayerLeadersResponse)
async def player_leaders(
    season: int = Query(..., ge=2000, le=2100),
    category: str = Query("passing"),
    db: AsyncSession = Depends(get_db),
):
    if category not in PLAYER_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown category '{category}'. Valid: {sorted(PLAYER_CATEGORIES)}",
        )

    # Player season stats are EAV — we find the "YDS" or primary stat_type
    # for each category and get the top 25 by that stat.
    # For simplicity, get all rows for the category and sort by stat DESC.
    rows = (
        (
            await db.execute(
                select(CfbdPlayerSeasonStat)
                .where(
                    CfbdPlayerSeasonStat.season == season,
                    CfbdPlayerSeasonStat.category == category,
                )
                .order_by(desc(CfbdPlayerSeasonStat.stat))
                .limit(25)
            )
        )
        .scalars()
        .all()
    )

    team_names = {r.team for r in rows if r.team}
    meta = await _team_metadata_map(db, team_names)

    return PlayerLeadersResponse(
        season=season,
        category=category,
        leaders=[
            PlayerLeaderRow(
                player=r.player or "Unknown",
                team=r.team or "Unknown",
                logo=meta.get(r.team or "", {}).get("logo"),
                stat_value=r.stat or "0",
            )
            for r in rows
        ],
    )


# ──────────────────────────────────────────────────────────────────────
# GET /team-slicer
# ──────────────────────────────────────────────────────────────────────

_SLICER_MODELS: dict[str, type] = {
    "elo": CfbdEloRating,
    "sp_plus": CfbdSpRating,
    "srs": CfbdSrsRating,
    "fpi": CfbdFpiRating,
}

_SLICER_VALUE_COLS: dict[str, str] = {
    "elo": "elo",
    "sp_plus": "rating",
    "srs": "rating",
    "fpi": "fpi",
}

# Poll-based slicers use cfbd_rankings (latest week)
_POLL_SLICERS = {"ap_poll", "cfp_rank"}


@router.get("/team-slicer", response_model=TeamSlicerResponse)
async def team_slicer(
    season: int = Query(..., ge=2000, le=2100),
    metric: str = Query("elo"),
    conference: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if metric in _POLL_SLICERS:
        # Poll rankings — get the latest week's rankings for this poll
        poll_name = "AP Top 25" if metric == "ap_poll" else "Playoff Committee Rankings"
        max_week = await db.scalar(
            select(func.max(CfbdRanking.week))
            .where(
                CfbdRanking.season == season,
                CfbdRanking.poll == poll_name,
            )
        )
        if max_week is None:
            return TeamSlicerResponse(season=season, metric=metric, teams=[])

        raw_rows = (
            (
                await db.execute(
                    select(CfbdRanking)
                    .where(
                        CfbdRanking.season == season,
                        CfbdRanking.poll == poll_name,
                        CfbdRanking.week == max_week,
                    )
                    .order_by(CfbdRanking.rank)
                )
            )
            .scalars()
            .all()
        )
        team_names = {r.school for r in raw_rows if r.school}
        meta = await _team_metadata_map(db, team_names)

        teams: list[TeamSlicerRow] = []
        for r in raw_rows:
            m = meta.get(r.school or "", {})
            if conference and conference != m.get("conference"):
                continue
            teams.append(
                TeamSlicerRow(
                    team=r.school or "Unknown",
                    conference=m.get("conference"),
                    logo=m.get("logo"),
                    color=m.get("color"),
                    abbreviation=m.get("abbreviation"),
                    value=float(r.rank) if r.rank else None,
                )
            )
        return TeamSlicerResponse(season=season, metric=metric, teams=teams)

    model = _SLICER_MODELS.get(metric)
    if model is None:
        valid = sorted(list(_SLICER_MODELS) + list(_POLL_SLICERS))
        raise HTTPException(
            status_code=400, detail=f"Unknown metric '{metric}'. Valid: {valid}"
        )

    value_col = _SLICER_VALUE_COLS[metric]
    is_desc = metric != "ap_poll"  # rating metrics: higher is better → desc

    stmt = (
        select(model)
        .where(getattr(model, "year") == season)
        .order_by(
            getattr(model, value_col).desc() if is_desc else getattr(model, value_col).asc()
        )
    )
    if conference and hasattr(model, "conference"):
        stmt = stmt.where(getattr(model, "conference") == conference)

    rows = (await db.execute(stmt)).scalars().all()
    team_names = {r.team for r in rows if r.team}  # type: ignore[attr-defined]
    meta = await _team_metadata_map(db, team_names)

    return TeamSlicerResponse(
        season=season,
        metric=metric,
        teams=[
            TeamSlicerRow(
                team=r.team,  # type: ignore[attr-defined]
                conference=r.conference if hasattr(r, "conference") else None,
                logo=meta.get(r.team, {}).get("logo"),
                color=meta.get(r.team, {}).get("color"),
                abbreviation=meta.get(r.team, {}).get("abbreviation"),
                value=getattr(r, value_col),
            )
            for r in rows
        ],
    )


# ──────────────────────────────────────────────────────────────────────
# GET /team-detail
# ──────────────────────────────────────────────────────────────────────

# Stats to surface in the percentile dashboard (from cfbd_team_season_adv_stats)
_PERCENTILE_STATS: list[tuple[str, str]] = [
    ("offense.ppa", "Offensive PPA"),
    ("defense.ppa", "Defensive PPA"),
    ("offense.successRate", "Off. Success Rate"),
    ("defense.successRate", "Def. Success Rate"),
    ("offense.explosiveness", "Off. Explosiveness"),
    ("defense.explosiveness", "Def. Explosiveness"),
    ("offense.rushingPPA", "Rushing PPA"),
    ("defense.rushingPPA", "Rush Def. PPA"),
    ("offense.passingPPA", "Passing PPA"),
    ("defense.passingPPA", "Pass Def. PPA"),
    ("offense.stuffRate", "Stuff Rate"),
    ("defense.stuffRate", "Def. Stuff Rate"),
    ("offense.lineYards", "Line Yards"),
    ("defense.lineYards", "Def. Line Yards"),
]


@router.get("/team-detail", response_model=TeamDetailResponse)
async def team_detail(
    season: int = Query(..., ge=2000, le=2100),
    team: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    # ── Team metadata ──
    team_row = (
        await db.execute(select(CfbdTeam).where(CfbdTeam.school == team))
    ).scalar_one_or_none()
    if team_row is None:
        raise HTTPException(status_code=404, detail=f"Team not found: {team}")

    logo = team_row.logos[0] if team_row.logos else None

    # ── Team record ──
    record_row = (
        await db.execute(
            select(CfbdTeamRecord).where(
                CfbdTeamRecord.year == season, CfbdTeamRecord.team == team
            )
        )
    ).scalar_one_or_none()

    record_str = None
    expected_wins = None
    if record_row:
        record_str = f"{record_row.total_wins or 0}-{record_row.total_losses or 0}"
        expected_wins = record_row.expected_wins

    # ── Schedule / Results ──
    game_rows = (
        (
            await db.execute(
                select(CfbdGame)
                .where(
                    CfbdGame.season_year == season,
                    (CfbdGame.home_team == team) | (CfbdGame.away_team == team),
                )
                .order_by(CfbdGame.start_date)
            )
        )
        .scalars()
        .all()
    )

    opponent_names: set[str] = set()
    for g in game_rows:
        opp = g.away_team if g.home_team == team else g.home_team
        if opp:
            opponent_names.add(opp)
    opp_meta = await _team_metadata_map(db, opponent_names)

    schedule: list[TeamScheduleGame] = []
    for g in game_rows:
        is_home = g.home_team == team
        opp = g.away_team if is_home else g.home_team
        home_away = "home" if is_home else "away"
        team_score = g.home_score if is_home else g.away_score
        opp_score = g.away_score if is_home else g.home_score

        if not g.completed or team_score is None or opp_score is None:
            result = "—"
        elif team_score > opp_score:
            result = "W"
        else:
            result = "L"

        schedule.append(
            TeamScheduleGame(
                game_id=g.id,
                opponent=opp or "Unknown",
                opponent_logo=opp_meta.get(opp or "", {}).get("logo"),
                date=g.start_date.isoformat() if g.start_date else None,
                home_away=home_away,
                team_score=team_score,
                opponent_score=opp_score,
                result=result,
                bowl_name=g.bowl_name,
            )
        )

    # ── Player leaders (top 5 per category) ──
    player_leaders_map: dict[str, list[PlayerLeaderRow]] = {}
    for cat in ["passing", "rushing", "receiving", "tackles", "interceptions"]:
        pr_rows = (
            (
                await db.execute(
                    select(CfbdPlayerSeasonStat)
                    .where(
                        CfbdPlayerSeasonStat.season == season,
                        CfbdPlayerSeasonStat.team == team,
                        CfbdPlayerSeasonStat.category == cat,
                    )
                    .order_by(desc(CfbdPlayerSeasonStat.stat))
                    .limit(5)
                )
            )
            .scalars()
            .all()
        )
        player_leaders_map[cat] = [
            PlayerLeaderRow(
                player=pr.player or "Unknown",
                team=pr.team or team,
                logo=logo,
                stat_value=pr.stat or "0",
            )
            for pr in pr_rows
        ]

    # ── Percentile dashboard ──
    percentiles: list[TeamPercentileRow] = []

    # Get the team's values
    team_adv = (
        (
            await db.execute(
                select(CfbdTeamSeasonAdvStat).where(
                    CfbdTeamSeasonAdvStat.season == season,
                    CfbdTeamSeasonAdvStat.team == team,
                )
            )
        )
        .scalars()
        .all()
    )
    team_adv_map = {a.stat: a.value for a in team_adv}

    # For each stat, compute percentile — get all teams' values for a stat
    # and count how many the current team beats.
    for stat_key, stat_label in _PERCENTILE_STATS:
        all_vals = (
            (
                await db.execute(
                    select(CfbdTeamSeasonAdvStat.value).where(
                        CfbdTeamSeasonAdvStat.season == season,
                        CfbdTeamSeasonAdvStat.stat == stat_key,
                    )
                )
            )
            .scalars()
            .all()
        )

        total = len(all_vals)
        if total == 0:
            continue

        team_val_str = team_adv_map.get(stat_key)

        # For offense stats: higher is better. For defense: lower is better.
        # We compute percentile as fraction of teams the current team beats.
        is_defense = stat_key.startswith("defense.")
        numeric_vals: list[tuple[str, float]] = []
        for v in all_vals:
            try:
                numeric_vals.append((v, float(v)))
            except (ValueError, TypeError):
                numeric_vals.append((v, 0.0))

        try:
            team_val_num = float(team_val_str) if team_val_str else None
        except (ValueError, TypeError):
            team_val_num = None

        if team_val_num is not None:
            if is_defense:
                # Lower is better for defense → rank by how many are worse (higher value)
                better_count = sum(1 for _, nv in numeric_vals if nv > team_val_num)
            else:
                better_count = sum(1 for _, nv in numeric_vals if nv < team_val_num)
            percentile = (better_count / total * 100) if total > 0 else 0.0
        else:
            percentile = None

        percentiles.append(
            TeamPercentileRow(
                stat=stat_key,
                label=stat_label,
                value=team_val_str,
                percentile=round(percentile, 1) if percentile is not None else None,
                rank=total - int(better_count) if team_val_num is not None else None,
                total=total,
            )
        )

    return TeamDetailResponse(
        season=season,
        team=team,
        logo=logo,
        color=team_row.color,
        conference=team_row.conference,
        record=record_str,
        expected_wins=round(expected_wins, 1) if expected_wins is not None else None,
        schedule=schedule,
        player_leaders=player_leaders_map,
        percentiles=percentiles,
    )
