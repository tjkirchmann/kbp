"""add week column to cfbd_games

Adds a nullable `week` column to cfbd_games so the pool-create game finder can
filter by week. Populated from the CFBD games API (`week` field) on upsert.

Revision ID: w2f3a4b5c6d7
Revises: v1e2f3a4b5c6
Create Date: 2026-06-20 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "w2f3a4b5c6d7"
down_revision: str | None = "v1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("cfbd_games", sa.Column("week", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("cfbd_games", "week")
