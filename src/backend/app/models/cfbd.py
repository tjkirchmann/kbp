from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

# ---------------------------------------------------------------------------
# CFBD fact tables (event/measurement data that changes over time).
#
# Dimensions (slowly-changing reference data) are synced by cfbd_dims; the
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
    start_time_tbd: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    bowl_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    season_type: Mapped[str] = mapped_column(String, nullable=False, server_default="regular")
    season_year: Mapped[int] = mapped_column(Integer, nullable=False)
    home_classification: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    away_classification: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    home_conference: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    away_conference: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    conference_game: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    neutral_site: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    home_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    away_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)

    pool_games: Mapped[list["PoolGame"]] = relationship(back_populates="cfbd_game")
    espn_game: Mapped[Optional["EspnGame"]] = relationship(back_populates="cfbd_game", uselist=False)  # type: ignore[name-defined]


class CfbdTeam(Base):
    __tablename__ = "cfbd_teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school: Mapped[str] = mapped_column(String, nullable=False)
    mascot: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    abbreviation: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    alt_color: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    logos: Mapped[Optional[list[str]]] = mapped_column(PG_ARRAY(String), nullable=True)
    conference: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    division: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    classification: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    twitter: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


class CfbdConference(Base):
    __tablename__ = "cfbd_conferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    short_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    abbreviation: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    classification: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


class CfbdVenue(Base):
    __tablename__ = "cfbd_venues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    zip: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    country_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    timezone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    elevation: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    capacity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    construction_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    grass: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    dome: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


class CfbdCoach(Base):
    __tablename__ = "cfbd_coaches"

    # CFBD exposes no coach id; coach_id is a deterministic sha1 of
    # first|last|hireDate computed at sync time (see app/tasks/cfbd_dims.py).
    coach_id: Mapped[str] = mapped_column(String, primary_key=True)
    first_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    hire_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
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
    games: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    wins: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    losses: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ties: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    preseason_rank: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    postseason_rank: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    srs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sp_overall: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sp_offense: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sp_defense: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)

    coach: Mapped["CfbdCoach"] = relationship(back_populates="seasons")


class CfbdDraftPosition(Base):
    __tablename__ = "cfbd_draft_positions"

    name: Mapped[str] = mapped_column(String, primary_key=True)
    abbreviation: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


class CfbdDraftTeam(Base):
    __tablename__ = "cfbd_draft_teams"

    display_name: Mapped[str] = mapped_column(String, primary_key=True)
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    nickname: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    logo: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)


# --- FACT: betting lines (/lines) -------------------------------------------
class CfbdBettingLine(Base):
    """One betting line per game per sportsbook (CFBD BettingGame.lines[])."""

    __tablename__ = "cfbd_betting_lines"

    # Composite PK: a game has one line per provider (DraftKings, Bovada, ...).
    game_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String, primary_key=True)
    season: Mapped[int] = mapped_column(Integer, nullable=False)
    season_type: Mapped[str] = mapped_column(String, nullable=False, server_default="regular")
    week: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    home_team_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    home_team: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    away_team_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    away_team: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    spread: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    spread_open: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    over_under: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    over_under_open: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    home_moneyline: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    away_moneyline: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    formatted_spread: Mapped[Optional[str]] = mapped_column(String, nullable=True)
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
    school: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    conference: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    rank: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    first_place_votes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
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
    team: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    conference: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    home_away: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stat: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # CFBD returns values as strings
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
    complete: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    row_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(nullable=False)
