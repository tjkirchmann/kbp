"""add cfbd dimension tables (conferences, venues, coaches, draft) + cfbd_dims cron

Creates the slowly-changing CFBD dimension tables materialized by the new
cfbd_dims nightly task, seeds its schedule (admin_notify_config.cron, the sole
schedule source), and retires the standalone cfbd_teams task by nulling its cron
(teams is now folded into cfbd_dims). The cfbd_teams notify-config row is kept so
its historical runs remain queryable.

Revision ID: s8b9c0d1e2f3
Revises: s8b9c0d1e2f4
Create Date: 2026-06-16 00:00:00.000000

Note: now chained after s8b9c0d1e2f4 (drop_global_webhook), which previously
shared this revision id. Linearizing the two resolves the duplicate-revision /
multi-head break; this migration keeps its id so t9c0d1e2f3a4 still chains off it.

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 's8b9c0d1e2f3'
down_revision: Union[str, None] = 's8b9c0d1e2f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DIMS_CRON = '0 3 * * *'  # the nightly slot teams used


def upgrade() -> None:
    op.create_table(
        'cfbd_conferences',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('short_name', sa.String(), nullable=True),
        sa.Column('abbreviation', sa.String(), nullable=True),
        sa.Column('classification', sa.String(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=False),
    )
    op.create_table(
        'cfbd_venues',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('city', sa.String(), nullable=True),
        sa.Column('state', sa.String(), nullable=True),
        sa.Column('zip', sa.String(), nullable=True),
        sa.Column('country_code', sa.String(), nullable=True),
        sa.Column('timezone', sa.String(), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('elevation', sa.String(), nullable=True),
        sa.Column('capacity', sa.Integer(), nullable=True),
        sa.Column('construction_year', sa.Integer(), nullable=True),
        sa.Column('grass', sa.Boolean(), nullable=True),
        sa.Column('dome', sa.Boolean(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=False),
    )
    op.create_table(
        'cfbd_coaches',
        sa.Column('coach_id', sa.String(), primary_key=True),
        sa.Column('first_name', sa.String(), nullable=True),
        sa.Column('last_name', sa.String(), nullable=True),
        sa.Column('hire_date', sa.String(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=False),
    )
    op.create_table(
        'cfbd_coach_seasons',
        sa.Column(
            'coach_id', sa.String(),
            sa.ForeignKey('cfbd_coaches.coach_id', ondelete='CASCADE'), primary_key=True,
        ),
        sa.Column('school', sa.String(), primary_key=True),
        sa.Column('year', sa.Integer(), primary_key=True),
        sa.Column('games', sa.Integer(), nullable=True),
        sa.Column('wins', sa.Integer(), nullable=True),
        sa.Column('losses', sa.Integer(), nullable=True),
        sa.Column('ties', sa.Integer(), nullable=True),
        sa.Column('preseason_rank', sa.Integer(), nullable=True),
        sa.Column('postseason_rank', sa.Integer(), nullable=True),
        sa.Column('srs', sa.Float(), nullable=True),
        sa.Column('sp_overall', sa.Float(), nullable=True),
        sa.Column('sp_offense', sa.Float(), nullable=True),
        sa.Column('sp_defense', sa.Float(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=False),
    )
    op.create_table(
        'cfbd_draft_positions',
        sa.Column('name', sa.String(), primary_key=True),
        sa.Column('abbreviation', sa.String(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=False),
    )
    op.create_table(
        'cfbd_draft_teams',
        sa.Column('display_name', sa.String(), primary_key=True),
        sa.Column('location', sa.String(), nullable=True),
        sa.Column('nickname', sa.String(), nullable=True),
        sa.Column('logo', sa.String(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=False),
    )

    # Seed the cfbd_dims notify-config row (failure-on default) + nightly cron,
    # and retire the standalone teams task by clearing its cron.
    op.execute(
        sa.text(
            "INSERT INTO admin_notify_config (task_name, notify_on_failure, cron) "
            "VALUES ('cfbd_dims', true, :cron) "
            "ON CONFLICT (task_name) DO UPDATE SET cron = :cron"
        ).bindparams(cron=_DIMS_CRON)
    )
    op.execute("UPDATE admin_notify_config SET cron = NULL WHERE task_name = 'cfbd_teams'")


def downgrade() -> None:
    # Restore teams' nightly cron and drop the cfbd_dims row.
    op.execute(
        sa.text("UPDATE admin_notify_config SET cron = :cron WHERE task_name = 'cfbd_teams'")
        .bindparams(cron=_DIMS_CRON)
    )
    op.execute("DELETE FROM admin_notify_config WHERE task_name = 'cfbd_dims'")

    op.drop_table('cfbd_draft_teams')
    op.drop_table('cfbd_draft_positions')
    op.drop_table('cfbd_coach_seasons')
    op.drop_table('cfbd_coaches')
    op.drop_table('cfbd_venues')
    op.drop_table('cfbd_conferences')
