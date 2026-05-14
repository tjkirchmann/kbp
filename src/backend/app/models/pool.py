from datetime import datetime
from typing import Optional
import enum
from sqlalchemy import Boolean, Integer, String, ForeignKey, Enum, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.cfbd import CfbdGame


class ScoringStrategy(str, enum.Enum):
    tbd = "tbd"


class Pool(Base):
    __tablename__ = "pools"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
    name: Mapped[str] = mapped_column(String, nullable=False)
    season_year: Mapped[int] = mapped_column(Integer, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    submissions_open: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    submissions_due_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    scoring_strategy: Mapped[Optional[ScoringStrategy]] = mapped_column(
        Enum(ScoringStrategy, name="scoring_strategy"), nullable=True
    )
    password_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    games: Mapped[list["PoolGame"]] = relationship(back_populates="pool", cascade="all, delete-orphan")
    submissions: Mapped[list["PoolSubmission"]] = relationship(back_populates="pool", cascade="all, delete-orphan")


class PoolGame(Base):
    __tablename__ = "pool_games"
    __table_args__ = (
        UniqueConstraint("pool_id", "cfbd_game_id", name="uq_pool_games_pool_cfbd"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    pool_id: Mapped[int] = mapped_column(ForeignKey("pools.id"), nullable=False, index=True)
    cfbd_game_id: Mapped[int] = mapped_column(ForeignKey("cfbd_games.id"), nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    multiplier: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    playoff_slot: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    pool: Mapped["Pool"] = relationship(back_populates="games")
    cfbd_game: Mapped["CfbdGame"] = relationship(back_populates="pool_games")
    submission_items: Mapped[list["PoolSubmissionGameItem"]] = relationship(back_populates="pool_game")


class PoolSubmission(Base):
    __tablename__ = "pool_submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
    pool_id: Mapped[int] = mapped_column(ForeignKey("pools.id"), nullable=False, index=True)
    submitted_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    on_behalf_of_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    on_behalf_of_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    deleted_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    pool: Mapped["Pool"] = relationship(back_populates="submissions")
    submitted_by: Mapped["User"] = relationship(back_populates="submissions")
    game_items: Mapped[list["PoolSubmissionGameItem"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )


class PoolSubmissionGameItem(Base):
    __tablename__ = "pool_submission_game_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("pool_submissions.id"), nullable=False, index=True)
    pool_game_id: Mapped[int] = mapped_column(ForeignKey("pool_games.id"), nullable=False, index=True)
    picked_winner: Mapped[str] = mapped_column(String, nullable=False)
    picked_margin: Mapped[int] = mapped_column(Integer, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    submission: Mapped["PoolSubmission"] = relationship(back_populates="game_items")
    pool_game: Mapped["PoolGame"] = relationship(back_populates="submission_items")
