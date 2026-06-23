"""add cfbd fact tables (betting lines, rankings, game team stats) + coverage + cron

Creates the first three CFBD *fact* tables materialized by the new cfbd_facts
smart-daily task, plus its cfbd_fact_coverage cursor (per-season ingest state),
and seeds the task's schedule (admin_notify_config.cron, the sole schedule
source). cfbd_facts runs at 04:00 UTC, after cfbd_dims (03:00).

Revision ID: t9c0d1e2f3a4
Revises: s8b9c0d1e2f3
Create Date: 2026-06-16 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = "t9c0d1e2f3a4"
down_revision: str | None = "s8b9c0d1e2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FACTS_CRON = "0 4 * * *"  # nightly, after cfbd_dims (0 3 * * *)


def upgrade() -> None:
    op.create_table(
        "cfbd_betting_lines",
        sa.Column("game_id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(), primary_key=True),
        sa.Column("season", sa.Integer(), nullable=False),
        sa.Column("season_type", sa.String(), nullable=False, server_default="regular"),
        sa.Column("week", sa.Integer(), nullable=True),
        sa.Column("home_team_id", sa.Integer(), nullable=True),
        sa.Column("home_team", sa.String(), nullable=True),
        sa.Column("away_team_id", sa.Integer(), nullable=True),
        sa.Column("away_team", sa.String(), nullable=True),
        sa.Column("spread", sa.Float(), nullable=True),
        sa.Column("spread_open", sa.Float(), nullable=True),
        sa.Column("over_under", sa.Float(), nullable=True),
        sa.Column("over_under_open", sa.Float(), nullable=True),
        sa.Column("home_moneyline", sa.Integer(), nullable=True),
        sa.Column("away_moneyline", sa.Integer(), nullable=True),
        sa.Column("formatted_spread", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_rankings",
        sa.Column("season", sa.Integer(), primary_key=True),
        sa.Column("season_type", sa.String(), primary_key=True),
        sa.Column("week", sa.Integer(), primary_key=True),
        sa.Column("poll", sa.String(), primary_key=True),
        sa.Column("team_id", sa.Integer(), primary_key=True),
        sa.Column("school", sa.String(), nullable=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("rank", sa.Integer(), nullable=True),
        sa.Column("first_place_votes", sa.Integer(), nullable=True),
        sa.Column("points", sa.Integer(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_game_team_stats",
        sa.Column("game_id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), primary_key=True),
        sa.Column("category", sa.String(), primary_key=True),
        sa.Column("team", sa.String(), nullable=True),
        sa.Column("conference", sa.String(), nullable=True),
        sa.Column("home_away", sa.String(), nullable=True),
        sa.Column("points", sa.Integer(), nullable=True),
        sa.Column("stat", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "cfbd_fact_coverage",
        sa.Column("endpoint", sa.String(), primary_key=True),
        sa.Column("season_year", sa.Integer(), primary_key=True),
        sa.Column("complete", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("row_count", sa.Integer(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )

    # Seed the cfbd_facts notify-config row (failure-on default) + nightly cron.
    op.execute(
        sa.text(
            "INSERT INTO admin_notify_config (task_name, notify_on_failure, cron) "
            "VALUES ('cfbd_facts', true, :cron) "
            "ON CONFLICT (task_name) DO UPDATE SET cron = :cron"
        ).bindparams(cron=_FACTS_CRON)
    )


def downgrade() -> None:
    op.execute("DELETE FROM admin_notify_config WHERE task_name = 'cfbd_facts'")
    op.drop_table("cfbd_fact_coverage")
    op.drop_table("cfbd_game_team_stats")
    op.drop_table("cfbd_rankings")
    op.drop_table("cfbd_betting_lines")
