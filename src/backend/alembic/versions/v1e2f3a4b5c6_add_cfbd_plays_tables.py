"""add CFBD play-by-play tables + run-only cfbd_plays task

Adds the two highest-volume CFBD fact tables (cfbd_plays, cfbd_play_stats) and
seeds the cfbd_plays notify-config row WITHOUT a cron. cfbd_plays is run-only
(deferred manually from the admin Run button, never scheduled), mirroring
espn_seed — a NULL cron means it never fires automatically.

Revision ID: v1e2f3a4b5c6
Revises: u0d1e2f3a4b5
Create Date: 2026-06-17 00:00:01.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "v1e2f3a4b5c6"
down_revision: str | None = "u0d1e2f3a4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cfbd_plays",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("game_id", sa.Integer(), nullable=True),
        sa.Column("drive_id", sa.String(), nullable=True),
        sa.Column("season", sa.Integer(), nullable=True),
        sa.Column("week", sa.Integer(), nullable=True),
        sa.Column("season_type", sa.String(), nullable=True),
        sa.Column("offense", sa.String(), nullable=True),
        sa.Column("offense_conference", sa.String(), nullable=True),
        sa.Column("defense", sa.String(), nullable=True),
        sa.Column("defense_conference", sa.String(), nullable=True),
        sa.Column("home", sa.String(), nullable=True),
        sa.Column("away", sa.String(), nullable=True),
        sa.Column("offense_score", sa.Integer(), nullable=True),
        sa.Column("defense_score", sa.Integer(), nullable=True),
        sa.Column("period", sa.Integer(), nullable=True),
        sa.Column("yard_line", sa.Integer(), nullable=True),
        sa.Column("yards_to_goal", sa.Integer(), nullable=True),
        sa.Column("down", sa.Integer(), nullable=True),
        sa.Column("distance", sa.Integer(), nullable=True),
        sa.Column("scoring", sa.Boolean(), nullable=True),
        sa.Column("yards_gained", sa.Integer(), nullable=True),
        sa.Column("play_type", sa.String(), nullable=True),
        sa.Column("play_text", sa.String(), nullable=True),
        sa.Column("ppa", sa.Float(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_play_stats",
        sa.Column("play_id", sa.String(), primary_key=True),
        sa.Column("athlete_id", sa.String(), primary_key=True),
        sa.Column("stat_type", sa.String(), primary_key=True),
        sa.Column("game_id", sa.Integer(), nullable=True),
        sa.Column("season", sa.Integer(), nullable=True),
        sa.Column("week", sa.Integer(), nullable=True),
        sa.Column("team", sa.String(), nullable=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("opponent", sa.String(), nullable=True),
        sa.Column("athlete_name", sa.String(), nullable=True),
        sa.Column("stat", sa.Integer(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )

    # Run-only: seed the notify-config row with NO cron so it never schedules.
    # ON CONFLICT clears any cron if the row somehow already exists.
    op.execute(
        "INSERT INTO admin_notify_config (task_name, notify_on_failure, cron) "
        "VALUES ('cfbd_plays', true, NULL) "
        "ON CONFLICT (task_name) DO UPDATE SET cron = NULL"
    )


def downgrade() -> None:
    op.execute("DELETE FROM admin_notify_config WHERE task_name = 'cfbd_plays'")
    op.drop_table("cfbd_play_stats")
    op.drop_table("cfbd_plays")
