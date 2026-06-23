"""add cron column to admin_notify_config (DB as sole schedule source)

Revision ID: r7a8b9c0d1e2
Revises: p5e6f7a8b9c0
Create Date: 2026-06-11 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "r7a8b9c0d1e2"
down_revision: str | None = "p5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Seed the schedules that previously lived in @app.periodic decorators. After this
# migration the DB is the sole source; the decorators are removed in code.
_SEED = {
    "cfbd_teams": "0 3 * * *",
    "cfbd_games": "*/15 * * * *",
    "espn_poll": "* * * * *",
}


def upgrade() -> None:
    op.add_column("admin_notify_config", sa.Column("cron", sa.String(), nullable=True))
    for task_name, cron in _SEED.items():
        op.execute(
            sa.text(
                "UPDATE admin_notify_config SET cron = :cron WHERE task_name = :t"
            ).bindparams(cron=cron, t=task_name)
        )


def downgrade() -> None:
    op.drop_column("admin_notify_config", "cron")
