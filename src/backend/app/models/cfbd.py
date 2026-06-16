from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


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
