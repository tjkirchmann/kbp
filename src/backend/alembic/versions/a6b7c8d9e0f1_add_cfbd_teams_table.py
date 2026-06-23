"""add cfbd_teams table

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-05-09 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

from alembic import op

revision: str = "a6b7c8d9e0f1"
down_revision: str | None = "f5a6b7c8d9e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cfbd_teams",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("school", sa.String(), nullable=False),
        sa.Column("mascot", sa.String(), nullable=True),
        sa.Column("abbreviation", sa.String(), nullable=True),
        sa.Column("color", sa.String(), nullable=True),
        sa.Column("alt_color", sa.String(), nullable=True),
        sa.Column("logos", ARRAY(sa.String()), nullable=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("division", sa.String(), nullable=True),
        sa.Column("classification", sa.String(), nullable=True),
        sa.Column("twitter", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("cfbd_teams")
