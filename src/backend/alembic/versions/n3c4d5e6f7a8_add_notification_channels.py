"""add notification_channels and channel routing + catch-up to notify config

Revision ID: n3c4d5e6f7a8
Revises: m2b3c4d5e6f7
Create Date: 2026-06-09 05:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from alembic import op

revision: str = 'n3c4d5e6f7a8'
down_revision: Union[str, None] = 'm2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notification_channels',
        sa.Column('name', sa.String(), primary_key=True),
        sa.Column('strategy', sa.String(), nullable=False, server_default='discord'),
        sa.Column('config', JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.add_column(
        'admin_notify_config',
        sa.Column('channel_name', sa.String(), nullable=True),
    )
    op.create_foreign_key(
        'fk_admin_notify_config_channel',
        'admin_notify_config', 'notification_channels',
        ['channel_name'], ['name'], ondelete='SET NULL',
    )
    op.add_column(
        'admin_notify_config',
        sa.Column('run_catchup', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )


def downgrade() -> None:
    op.drop_constraint('fk_admin_notify_config_channel', 'admin_notify_config', type_='foreignkey')
    op.drop_column('admin_notify_config', 'run_catchup')
    op.drop_column('admin_notify_config', 'channel_name')
    op.drop_table('notification_channels')
