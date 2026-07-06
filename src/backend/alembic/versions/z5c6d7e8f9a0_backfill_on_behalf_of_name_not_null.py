"""backfill on_behalf_of_name NOT NULL

Revision ID: z5c6d7e8f9a0
Revises: y4b5c6d7e8f9
Create Date: 2026-07-02 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "z5c6d7e8f9a0"
down_revision: str | None = "a9b8c7d6e5f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Backfill any NULL on_behalf_of_name rows to empty string
    op.execute(
        "UPDATE pool_submissions SET on_behalf_of_name = '' "
        "WHERE on_behalf_of_name IS NULL"
    )
    op.alter_column(
        "pool_submissions",
        "on_behalf_of_name",
        existing_type=sa.String(),
        nullable=False,
        server_default="",
    )


def downgrade() -> None:
    op.alter_column(
        "pool_submissions",
        "on_behalf_of_name",
        existing_type=sa.String(),
        nullable=True,
        server_default=None,
    )
