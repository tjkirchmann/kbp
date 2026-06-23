"""add espn_rate_tokens and event_log

Revision ID: l1a2b3c4d5e6
Revises: k0f1a2b3c4d5
Create Date: 2026-06-08 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "l1a2b3c4d5e6"
down_revision: str | None = "k0f1a2b3c4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "espn_rate_tokens",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "acquired_at", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_espn_rate_tokens_acquired_at", "espn_rate_tokens", ["acquired_at"]
    )

    op.create_table(
        "event_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("event", sa.String(), nullable=False),
        sa.Column(
            "payload", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
    )
    op.create_index("ix_event_log_at", "event_log", ["at"])


def downgrade() -> None:
    op.drop_index("ix_event_log_at", table_name="event_log")
    op.drop_table("event_log")
    op.drop_index("ix_espn_rate_tokens_acquired_at", table_name="espn_rate_tokens")
    op.drop_table("espn_rate_tokens")
