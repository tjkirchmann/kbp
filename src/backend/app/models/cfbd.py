from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, Integer, String
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
