"""add run_on_startup + startup_stale_seconds to notify config

Revision ID: o4d5e6f7a8b9
Revises: n3c4d5e6f7a8
Create Date: 2026-06-10 23:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "o4d5e6f7a8b9"
down_revision: str | None = "n3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "admin_notify_config",
        sa.Column(
            "run_on_startup",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "admin_notify_config",
        sa.Column("startup_stale_seconds", sa.Integer(), nullable=True),
    )
    # Preserve current behavior: espn_seed was deferred at boot via a hardcoded
    # call in main.py, now removed in favor of this flag.
    op.execute(
        "UPDATE admin_notify_config SET run_on_startup = true WHERE task_name = 'espn_seed'"
    )


def downgrade() -> None:
    op.drop_column("admin_notify_config", "startup_stale_seconds")
    op.drop_column("admin_notify_config", "run_on_startup")
