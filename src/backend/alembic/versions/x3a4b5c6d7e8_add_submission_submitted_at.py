"""add submitted_at to pool_submissions

Revision ID: x3a4b5c6d7e8
Revises: w2f3a4b5c6d7
Create Date: 2026-06-20 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "x3a4b5c6d7e8"
down_revision: str | None = "w2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "pool_submissions",
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("pool_submissions", "submitted_at")
