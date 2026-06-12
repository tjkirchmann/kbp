"""add admin_notify_config

Revision ID: m2b3c4d5e6f7
Revises: l1a2b3c4d5e6
Create Date: 2026-06-09 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'm2b3c4d5e6f7'
down_revision: Union[str, None] = 'l1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SEED_TASKS = ['cfbd_teams', 'cfbd_games', 'espn_poll', 'espn_seed']


def upgrade() -> None:
    op.create_table(
        'admin_notify_config',
        sa.Column('task_name', sa.String(), primary_key=True),
        sa.Column('notify_on_start', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('notify_on_success', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('notify_on_failure', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('strategy', sa.String(), nullable=False, server_default='discord'),
        sa.Column('webhook_url', sa.String(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    # Seed failure-on rows for the existing tasks (closes the CFBD silent-failure gap).
    notify = sa.table(
        'admin_notify_config',
        sa.column('task_name', sa.String),
        sa.column('notify_on_failure', sa.Boolean),
    )
    op.bulk_insert(notify, [{'task_name': t, 'notify_on_failure': True} for t in _SEED_TASKS])


def downgrade() -> None:
    op.drop_table('admin_notify_config')
