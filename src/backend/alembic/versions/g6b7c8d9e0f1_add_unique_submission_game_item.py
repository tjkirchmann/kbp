"""add unique constraint to pool_submission_game_items

Revision ID: g6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-05-09 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "g6b7c8d9e0f1"
down_revision: str | None = "a6b7c8d9e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_submission_game_items_sub_game",
        "pool_submission_game_items",
        ["submission_id", "pool_game_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_submission_game_items_sub_game",
        "pool_submission_game_items",
        type_="unique",
    )
