from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# ---------------------------------------------------------------------------
# CFBD fact tables (event/measurement data that changes over time).
#
# Dimensions (slowly-changing reference data) are synced by the CfbdDimsWorkflow
# Temporal workflow (app/temporal/cfbd_dims/); the
# fact tables below are synced by cfbd_facts (see app/tasks/cfbd_facts.py for
# the full coverage roadmap of every CFBD fact endpoint). cfbd_games is also a
# fact table but predates this group and runs on its own 15-min cadence.
# ---------------------------------------------------------------------------


class CfbdGame(Base):
    __tablename__ = "cfbd_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    home_team: Mapped[str] = mapped_column(String, nullable=False)
    away_team: Mapped[str] = mapped_column(String, nullable=False)
    start_date: Mapped[datetime] = mapped_column(nullable=False)
    start_time_tbd: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bowl_name: Mapped[str | None] = mapped_column(String, nullable=True)
    season_type: Mapped[str] = mapped_column(
        String, nullable=False, server_default="regular"
    )
    season_year: Mapped[int] = mapped_column(Integer, nullable=False)
    home_classification: Mapped[str | None] = mapped_column(String, nullable=True)
    away_classification: Mapped[str | None] = mapped_column(String, nullable=True)
    home_conference: Mapped[str | None] = mapped_column(String, nullable=True)
    away_conference: Mapped[str | None] = mapped_column(String, nullable=True)
    conference_game: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    neutral_site: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    completed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)

    pool_games: Mapped[list["PoolGame"]] = relationship(back_populates="cfbd_game")
    espn_game: Mapped[Optional["EspnGame"]] = relationship(
        back_populates="cfbd_game", uselist=False
    )  # type: ignore[name-defined]


class CfbdTeam(Base):
    __tablename__ = "cfbd_teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school: Mapped[str] = mapped_column(String, nullable=False)
    mascot: Mapped[str | None] = mapped_column(String, nullable=True)
    abbreviation: Mapped[str | None] = mapped_column(String, nullable=True)
    color: Mapped[str | None] = mapped_column(String, nullable=True)
    alt_color: Mapped[str | None] = mapped_column(String, nullable=True)
    logos: Mapped[list[str] | None] = mapped_column(PG_ARRAY(String), nullable=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    division: Mapped[str | None] = mapped_column(String, nullable=True)
    classification: Mapped[str | None] = mapped_column(String, nullable=True)
    twitter: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


class CfbdConference(Base):
    __tablename__ = "cfbd_conferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    short_name: Mapped[str | None] = mapped_column(String, nullable=True)
    abbreviation: Mapped[str | None] = mapped_column(String, nullable=True)
    classification: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


class CfbdVenue(Base):
    __tablename__ = "cfbd_venues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    state: Mapped[str | None] = mapped_column(String, nullable=True)
    zip: Mapped[str | None] = mapped_column(String, nullable=True)
    country_code: Mapped[str | None] = mapped_column(String, nullable=True)
    timezone: Mapped[str | None] = mapped_column(String, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    elevation: Mapped[str | None] = mapped_column(String, nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    construction_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grass: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    dome: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


class CfbdCoach(Base):
    __tablename__ = "cfbd_coaches"

    # CFBD exposes no coach id; coach_id is a deterministic sha1 of
    # first|last|hireDate computed at sync time (see app/temporal/cfbd_dims/).
    coach_id: Mapped[str] = mapped_column(String, primary_key=True)
    first_name: Mapped[str | None] = mapped_column(String, nullable=True)
    last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    hire_date: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)

    seasons: Mapped[list["CfbdCoachSeason"]] = relationship(
        back_populates="coach", cascade="all, delete-orphan"
    )


class CfbdCoachSeason(Base):
    __tablename__ = "cfbd_coach_seasons"

    coach_id: Mapped[str] = mapped_column(
        ForeignKey("cfbd_coaches.coach_id", ondelete="CASCADE"), primary_key=True
    )
    school: Mapped[str] = mapped_column(String, primary_key=True)
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    games: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    losses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ties: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preseason_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    postseason_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    srs: Mapped[float | None] = mapped_column(Float, nullable=True)
    sp_overall: Mapped[float | None] = mapped_column(Float, nullable=True)
    sp_offense: Mapped[float | None] = mapped_column(Float, nullable=True)
    sp_defense: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)

    coach: Mapped["CfbdCoach"] = relationship(back_populates="seasons")


class CfbdDraftPosition(Base):
    __tablename__ = "cfbd_draft_positions"

    name: Mapped[str] = mapped_column(String, primary_key=True)
    abbreviation: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


class CfbdDraftTeam(Base):
    __tablename__ = "cfbd_draft_teams"

    display_name: Mapped[str] = mapped_column(String, primary_key=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    nickname: Mapped[str | None] = mapped_column(String, nullable=True)
    logo: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: betting lines (/lines) -------------------------------------------
class CfbdBettingLine(Base):
    """One betting line per game per sportsbook (CFBD BettingGame.lines[])."""

    __tablename__ = "cfbd_betting_lines"

    # Composite PK: a game has one line per provider (DraftKings, Bovada, ...).
    game_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String, primary_key=True)
    season: Mapped[int] = mapped_column(Integer, nullable=False)
    season_type: Mapped[str] = mapped_column(
        String, nullable=False, server_default="regular"
    )
    week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    home_team_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    home_team: Mapped[str | None] = mapped_column(String, nullable=True)
    away_team_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_team: Mapped[str | None] = mapped_column(String, nullable=True)
    spread: Mapped[float | None] = mapped_column(Float, nullable=True)
    spread_open: Mapped[float | None] = mapped_column(Float, nullable=True)
    over_under: Mapped[float | None] = mapped_column(Float, nullable=True)
    over_under_open: Mapped[float | None] = mapped_column(Float, nullable=True)
    home_moneyline: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_moneyline: Mapped[int | None] = mapped_column(Integer, nullable=True)
    formatted_spread: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: poll rankings (/rankings) ----------------------------------------
class CfbdRanking(Base):
    """One ranked team per poll per week (CFBD PollWeek.polls[].ranks[])."""

    __tablename__ = "cfbd_rankings"

    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    season_type: Mapped[str] = mapped_column(String, primary_key=True)
    week: Mapped[int] = mapped_column(Integer, primary_key=True)
    poll: Mapped[str] = mapped_column(String, primary_key=True)
    team_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school: Mapped[str | None] = mapped_column(String, nullable=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    first_place_votes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: team box-score stats (/games/teams) ------------------------------
class CfbdGameTeamStat(Base):
    """One stat value per team per game (CFBD GameTeamStats.teams[].stats[]).

    Long/EAV shape: CFBD's stat categories are open-ended, so a row-per-category
    layout avoids schema churn as new categories appear.
    """

    __tablename__ = "cfbd_game_team_stats"

    game_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String, primary_key=True)
    team: Mapped[str | None] = mapped_column(String, nullable=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    home_away: Mapped[str | None] = mapped_column(String, nullable=True)
    points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stat: Mapped[str | None] = mapped_column(
        String, nullable=True
    )  # CFBD returns values as strings
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- INTERNAL: smart-sync coverage cursor (no API) --------------------------
class CfbdFactCoverage(Base):
    """Per-(endpoint, season) ingest cursor powering cfbd_facts' smart sync.

    A row with complete=True marks a finished season fully ingested — cfbd_facts
    then skips that (endpoint, year) forever and only re-fetches the in-progress
    season. complete is set only after a successful upsert, so an interrupted
    backfill self-heals on the next run.
    """

    __tablename__ = "cfbd_fact_coverage"

    endpoint: Mapped[str] = mapped_column(String, primary_key=True)
    season_year: Mapped[int] = mapped_column(Integer, primary_key=True)
    complete: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# ===========================================================================
# Remaining CFBD fact tables (roadmap completion). All are season-scoped and
# synced by cfbd_facts (daily) except plays/play_stats, which are high-volume
# and synced by the separate, cron-less cfbd_plays task (manual run only).
# EAV/long shape (one row per stat) is used wherever CFBD's stat set is
# open-ended, mirroring CfbdGameTeamStat above.
# ===========================================================================


# --- FACT: season calendar (/calendar) --------------------------------------
class CfbdCalendar(Base):
    """One row per (season, season_type, week) defining the week's date window."""

    __tablename__ = "cfbd_calendar"

    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    season_type: Mapped[str] = mapped_column(String, primary_key=True)
    week: Mapped[int] = mapped_column(Integer, primary_key=True)
    start_date: Mapped[str | None] = mapped_column(String, nullable=True)
    end_date: Mapped[str | None] = mapped_column(String, nullable=True)
    first_game_start: Mapped[str | None] = mapped_column(String, nullable=True)
    last_game_start: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: team records (/records) ------------------------------------------
class CfbdTeamRecord(Base):
    """One season win/loss record per team, split by venue/conference."""

    __tablename__ = "cfbd_team_records"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team: Mapped[str | None] = mapped_column(String, nullable=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    division: Mapped[str | None] = mapped_column(String, nullable=True)
    expected_wins: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_games: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_losses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_ties: Mapped[int | None] = mapped_column(Integer, nullable=True)
    conference_games: Mapped[int | None] = mapped_column(Integer, nullable=True)
    conference_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    conference_losses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    conference_ties: Mapped[int | None] = mapped_column(Integer, nullable=True)
    home_games: Mapped[int | None] = mapped_column(Integer, nullable=True)
    home_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    home_losses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    home_ties: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_games: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_wins: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_losses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_ties: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: SP+ ratings (/ratings/sp) ----------------------------------------
class CfbdSpRating(Base):
    __tablename__ = "cfbd_sp_ratings"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    team: Mapped[str] = mapped_column(String, primary_key=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    ranking: Mapped[int | None] = mapped_column(Integer, nullable=True)
    second_order_wins: Mapped[float | None] = mapped_column(Float, nullable=True)
    sos: Mapped[float | None] = mapped_column(Float, nullable=True)
    offense_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    offense_ranking: Mapped[int | None] = mapped_column(Integer, nullable=True)
    defense_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    defense_ranking: Mapped[int | None] = mapped_column(Integer, nullable=True)
    special_teams_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: SRS ratings (/ratings/srs) ---------------------------------------
class CfbdSrsRating(Base):
    __tablename__ = "cfbd_srs_ratings"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    team: Mapped[str] = mapped_column(String, primary_key=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    division: Mapped[str | None] = mapped_column(String, nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    ranking: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: Elo ratings (/ratings/elo) ---------------------------------------
class CfbdEloRating(Base):
    __tablename__ = "cfbd_elo_ratings"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    team: Mapped[str] = mapped_column(String, primary_key=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    elo: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: FPI ratings (/ratings/fpi) ---------------------------------------
class CfbdFpiRating(Base):
    __tablename__ = "cfbd_fpi_ratings"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    team: Mapped[str] = mapped_column(String, primary_key=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    fpi: Mapped[float | None] = mapped_column(Float, nullable=True)
    efficiency_overall: Mapped[float | None] = mapped_column(Float, nullable=True)
    efficiency_offense: Mapped[float | None] = mapped_column(Float, nullable=True)
    efficiency_defense: Mapped[float | None] = mapped_column(Float, nullable=True)
    efficiency_special_teams: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: team season stats (/stats/season) — EAV --------------------------
class CfbdTeamSeasonStat(Base):
    """One stat value per team per season (long shape; open-ended categories)."""

    __tablename__ = "cfbd_team_season_stats"

    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    team: Mapped[str] = mapped_column(String, primary_key=True)
    stat_name: Mapped[str] = mapped_column(String, primary_key=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    stat_value: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: advanced team season stats (/stats/season/advanced) — EAV --------
class CfbdTeamSeasonAdvStat(Base):
    """Flattened advanced metrics; nested offense/defense dicts become dotted
    stat keys (e.g. offense.ppa) to absorb CFBD's deeply-nested, evolving shape."""

    __tablename__ = "cfbd_team_season_adv_stats"

    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    team: Mapped[str] = mapped_column(String, primary_key=True)
    stat: Mapped[str] = mapped_column(String, primary_key=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    value: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: player season stats (/stats/player/season) — EAV -----------------
class CfbdPlayerSeasonStat(Base):
    """One stat value per player per season per category/type (long shape)."""

    __tablename__ = "cfbd_player_season_stats"

    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[str] = mapped_column(String, primary_key=True)
    category: Mapped[str] = mapped_column(String, primary_key=True)
    stat_type: Mapped[str] = mapped_column(String, primary_key=True)
    player: Mapped[str | None] = mapped_column(String, nullable=True)
    team: Mapped[str | None] = mapped_column(String, nullable=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    stat: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: team talent composite (/talent) ----------------------------------
class CfbdTeamTalent(Base):
    __tablename__ = "cfbd_team_talent"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    school: Mapped[str] = mapped_column(String, primary_key=True)
    talent: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: team recruiting rankings (/recruiting/teams) ---------------------
class CfbdRecruitingTeam(Base):
    __tablename__ = "cfbd_recruiting_teams"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    team: Mapped[str] = mapped_column(String, primary_key=True)
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    points: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: recruit players (/recruiting/players) ----------------------------
class CfbdRecruitingPlayer(Base):
    __tablename__ = "cfbd_recruiting_players"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recruit_type: Mapped[str | None] = mapped_column(String, nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ranking: Mapped[int | None] = mapped_column(Integer, nullable=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    school: Mapped[str | None] = mapped_column(String, nullable=True)
    committed_to: Mapped[str | None] = mapped_column(String, nullable=True)
    position: Mapped[str | None] = mapped_column(String, nullable=True)
    height: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    stars: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    state_province: Mapped[str | None] = mapped_column(String, nullable=True)
    country: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: position-group recruiting (/recruiting/groups) -------------------
class CfbdRecruitingGroup(Base):
    __tablename__ = "cfbd_recruiting_groups"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    team: Mapped[str] = mapped_column(String, primary_key=True)
    position_group: Mapped[str] = mapped_column(String, primary_key=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    average_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    commits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    average_stars: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: returning production (/player/returning) -------------------------
class CfbdReturningProduction(Base):
    __tablename__ = "cfbd_returning_production"

    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    team: Mapped[str] = mapped_column(String, primary_key=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    total_ppa: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_passing_ppa: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_rushing_ppa: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_receiving_ppa: Mapped[float | None] = mapped_column(Float, nullable=True)
    percent_ppa: Mapped[float | None] = mapped_column(Float, nullable=True)
    percent_passing_ppa: Mapped[float | None] = mapped_column(Float, nullable=True)
    percent_rushing_ppa: Mapped[float | None] = mapped_column(Float, nullable=True)
    percent_receiving_ppa: Mapped[float | None] = mapped_column(Float, nullable=True)
    usage: Mapped[float | None] = mapped_column(Float, nullable=True)
    passing_usage: Mapped[float | None] = mapped_column(Float, nullable=True)
    rushing_usage: Mapped[float | None] = mapped_column(Float, nullable=True)
    receiving_usage: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: game media/broadcast (/games/media) ------------------------------
class CfbdGameMedia(Base):
    """One broadcast row per game per media type/outlet."""

    __tablename__ = "cfbd_game_media"

    game_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    media_type: Mapped[str] = mapped_column(String, primary_key=True)
    outlet: Mapped[str] = mapped_column(String, primary_key=True)
    season: Mapped[int | None] = mapped_column(Integer, nullable=True)
    week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    season_type: Mapped[str | None] = mapped_column(String, nullable=True)
    start_time: Mapped[str | None] = mapped_column(String, nullable=True)
    is_start_time_tbd: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    home_team: Mapped[str | None] = mapped_column(String, nullable=True)
    away_team: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: game weather (/games/weather) ------------------------------------
class CfbdGameWeather(Base):
    __tablename__ = "cfbd_game_weather"

    game_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    season: Mapped[int | None] = mapped_column(Integer, nullable=True)
    week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    season_type: Mapped[str | None] = mapped_column(String, nullable=True)
    start_time: Mapped[str | None] = mapped_column(String, nullable=True)
    game_indoors: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    home_team: Mapped[str | None] = mapped_column(String, nullable=True)
    away_team: Mapped[str | None] = mapped_column(String, nullable=True)
    venue_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    venue: Mapped[str | None] = mapped_column(String, nullable=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    dew_point: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    precipitation: Mapped[float | None] = mapped_column(Float, nullable=True)
    snowfall: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_direction: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    pressure: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_condition_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weather_condition: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: player box-score stats (/games/players) — EAV --------------------
class CfbdGamePlayerStat(Base):
    """One stat value per player per game per category/type (long shape)."""

    __tablename__ = "cfbd_game_player_stats"

    game_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[str] = mapped_column(String, primary_key=True)
    category: Mapped[str] = mapped_column(String, primary_key=True)
    stat_type: Mapped[str] = mapped_column(String, primary_key=True)
    player: Mapped[str | None] = mapped_column(String, nullable=True)
    team: Mapped[str | None] = mapped_column(String, nullable=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    home_away: Mapped[str | None] = mapped_column(String, nullable=True)
    stat: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: drives (/drives) -------------------------------------------------
class CfbdDrive(Base):
    __tablename__ = "cfbd_drives"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    game_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    offense: Mapped[str | None] = mapped_column(String, nullable=True)
    offense_conference: Mapped[str | None] = mapped_column(String, nullable=True)
    defense: Mapped[str | None] = mapped_column(String, nullable=True)
    defense_conference: Mapped[str | None] = mapped_column(String, nullable=True)
    drive_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scoring: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    start_period: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_yardline: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_yards_to_goal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_period: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_yardline: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_yards_to_goal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    plays: Mapped[int | None] = mapped_column(Integer, nullable=True)
    yards: Mapped[int | None] = mapped_column(Integer, nullable=True)
    drive_result: Mapped[str | None] = mapped_column(String, nullable=True)
    is_home_offense: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# ===========================================================================
# High-volume play-by-play — synced ONLY by the cron-less cfbd_plays task.
# ===========================================================================


# --- FACT: plays (/plays) ---------------------------------------------------
class CfbdPlay(Base):
    __tablename__ = "cfbd_plays"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    game_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    drive_id: Mapped[str | None] = mapped_column(String, nullable=True)
    season: Mapped[int | None] = mapped_column(Integer, nullable=True)
    week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    season_type: Mapped[str | None] = mapped_column(String, nullable=True)
    offense: Mapped[str | None] = mapped_column(String, nullable=True)
    offense_conference: Mapped[str | None] = mapped_column(String, nullable=True)
    defense: Mapped[str | None] = mapped_column(String, nullable=True)
    defense_conference: Mapped[str | None] = mapped_column(String, nullable=True)
    home: Mapped[str | None] = mapped_column(String, nullable=True)
    away: Mapped[str | None] = mapped_column(String, nullable=True)
    offense_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    defense_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    period: Mapped[int | None] = mapped_column(Integer, nullable=True)
    yard_line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    yards_to_goal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    down: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scoring: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    yards_gained: Mapped[int | None] = mapped_column(Integer, nullable=True)
    play_type: Mapped[str | None] = mapped_column(String, nullable=True)
    play_text: Mapped[str | None] = mapped_column(String, nullable=True)
    ppa: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: play stats (/plays/stats) — EAV ----------------------------------
class CfbdPlayStat(Base):
    """One stat value per play per athlete per stat type (long shape)."""

    __tablename__ = "cfbd_play_stats"

    play_id: Mapped[str] = mapped_column(String, primary_key=True)
    athlete_id: Mapped[str] = mapped_column(String, primary_key=True)
    stat_type: Mapped[str] = mapped_column(String, primary_key=True)
    game_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    season: Mapped[int | None] = mapped_column(Integer, nullable=True)
    week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    team: Mapped[str | None] = mapped_column(String, nullable=True)
    conference: Mapped[str | None] = mapped_column(String, nullable=True)
    opponent: Mapped[str | None] = mapped_column(String, nullable=True)
    athlete_name: Mapped[str | None] = mapped_column(String, nullable=True)
    stat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)
