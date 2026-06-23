"""add pool tables

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f6
Create Date: 2026-05-09 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

scoring_strategy_enum = PG_ENUM("tbd", name="scoring_strategy", create_type=False)


def upgrade() -> None:
    op.execute("CREATE TYPE scoring_strategy AS ENUM ('tbd')")
    op.create_table(
        "pools",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("season_year", sa.Integer(), nullable=False),
        sa.Column("is_featured", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "submissions_open", sa.Boolean(), server_default="false", nullable=False
        ),
        sa.Column("submissions_due_at", sa.DateTime(), nullable=True),
        sa.Column("scoring_strategy", scoring_strategy_enum, nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "pool_games",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("pool_id", sa.Integer(), nullable=False),
        sa.Column("cfbd_game_id", sa.Integer(), nullable=False),
        sa.Column("cfbd_snapshot", JSONB(), nullable=False),
        sa.Column("home_team", sa.String(), nullable=False),
        sa.Column("away_team", sa.String(), nullable=False),
        sa.Column("game_date", sa.Date(), nullable=False),
        sa.Column("bowl_name", sa.String(), nullable=True),
        sa.Column("home_score", sa.Integer(), nullable=True),
        sa.Column("away_score", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(["pool_id"], ["pools.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pool_games_pool_id", "pool_games", ["pool_id"])

    op.create_table(
        "pool_submissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("pool_id", sa.Integer(), nullable=False),
        sa.Column("submitted_by_user_id", sa.Integer(), nullable=False),
        sa.Column("on_behalf_of_name", sa.String(), nullable=True),
        sa.Column("on_behalf_of_email", sa.String(), nullable=True),
        sa.Column("is_locked", sa.Boolean(), server_default="false", nullable=False),
        sa.ForeignKeyConstraint(["pool_id"], ["pools.id"]),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pool_submissions_pool_id", "pool_submissions", ["pool_id"])
    op.create_index(
        "ix_pool_submissions_submitted_by_user_id",
        "pool_submissions",
        ["submitted_by_user_id"],
    )

    op.create_table(
        "pool_submission_game_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("pool_game_id", sa.Integer(), nullable=False),
        sa.Column("picked_winner", sa.String(), nullable=False),
        sa.Column("picked_margin", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["submission_id"], ["pool_submissions.id"]),
        sa.ForeignKeyConstraint(["pool_game_id"], ["pool_games.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_pool_submission_game_items_submission_id",
        "pool_submission_game_items",
        ["submission_id"],
    )
    op.create_index(
        "ix_pool_submission_game_items_pool_game_id",
        "pool_submission_game_items",
        ["pool_game_id"],
    )


def downgrade() -> None:
    op.drop_table("pool_submission_game_items")
    op.drop_table("pool_submissions")
    op.drop_table("pool_games")
    op.drop_table("pools")
    op.execute("DROP TYPE scoring_strategy")
