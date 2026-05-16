from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class EspnGame(Base):
    __tablename__ = "espn_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cfbd_game_id: Mapped[int] = mapped_column(Integer, ForeignKey("cfbd_games.id"), unique=True, nullable=False)
    espn_event_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    status_state: Mapped[Optional[str]] = mapped_column(String, nullable=True)   # "pre"|"in"|"post"
    status_detail: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "Final", "4th Quarter", etc.
    period: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    clock: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    home_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    away_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    raw_payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    last_polled_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now(), onupdate=func.now())

    cfbd_game: Mapped["CfbdGame"] = relationship(back_populates="espn_game")  # type: ignore[name-defined]
