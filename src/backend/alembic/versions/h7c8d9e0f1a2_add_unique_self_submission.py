"""add partial unique index for self-submissions

Revision ID: h7c8d9e0f1a2
Revises: g6b7c8d9e0f1
Create Date: 2026-05-09 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "h7c8d9e0f1a2"
down_revision: str | None = "g6b7c8d9e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE UNIQUE INDEX uq_pool_submission_self
        ON pool_submissions (pool_id, submitted_by_user_id)
        WHERE on_behalf_of_name = ''
    """)


def downgrade() -> None:
    op.execute("DROP INDEX uq_pool_submission_self")
