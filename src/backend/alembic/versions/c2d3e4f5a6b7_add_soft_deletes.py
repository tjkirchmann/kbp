"""add soft deletes

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-05-09 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in (
        "users",
        "pools",
        "pool_games",
        "pool_submissions",
        "pool_submission_game_items",
    ):
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    for table in (
        "users",
        "pools",
        "pool_games",
        "pool_submissions",
        "pool_submission_game_items",
    ):
        op.drop_column(table, "deleted_at")
