"""add espn_games and admin_config tables

Revision ID: j9e0f1a2b3c4
Revises: i8d9e0f1a2b3
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from alembic import op

revision: str = 'j9e0f1a2b3c4'
down_revision: Union[str, None] = 'i8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'espn_games',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('cfbd_game_id', sa.Integer(), sa.ForeignKey('cfbd_games.id'), nullable=False, unique=True),
        sa.Column('espn_event_id', sa.String(), nullable=False),
        sa.Column('status_state', sa.String(), nullable=True),
        sa.Column('status_detail', sa.String(), nullable=True),
        sa.Column('period', sa.Integer(), nullable=True),
        sa.Column('clock', sa.String(), nullable=True),
        sa.Column('home_score', sa.Integer(), nullable=True),
        sa.Column('away_score', sa.Integer(), nullable=True),
        sa.Column('raw_payload', JSONB(), nullable=True),
        sa.Column('last_polled_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_espn_games_espn_event_id', 'espn_games', ['espn_event_id'])

    op.create_table(
        'admin_config',
        sa.Column('key', sa.String(), primary_key=True),
        sa.Column('value', sa.String(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_index('ix_espn_games_espn_event_id', table_name='espn_games')
    op.drop_table('espn_games')
    op.drop_table('admin_config')
