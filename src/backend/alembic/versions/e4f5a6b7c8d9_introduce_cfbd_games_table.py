"""introduce cfbd_games table

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-05-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop FK and index from pool_submission_game_items → pool_games
    op.drop_constraint(
        'pool_submission_game_items_pool_game_id_fkey',
        'pool_submission_game_items',
        type_='foreignkey',
    )
    op.drop_index('ix_pool_submission_game_items_pool_game_id', table_name='pool_submission_game_items')

    # 2. Drop old pool_games
    op.drop_index('ix_pool_games_pool_id', table_name='pool_games')
    op.drop_table('pool_games')

    # 3. Create cfbd_games (natural PK = CFBD's own integer game id)
    op.create_table(
        'cfbd_games',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('home_team', sa.String(), nullable=False),
        sa.Column('away_team', sa.String(), nullable=False),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('start_time_tbd', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('bowl_name', sa.String(), nullable=True),
        sa.Column('season_type', sa.String(), nullable=False, server_default='regular'),
        sa.Column('season_year', sa.Integer(), nullable=False),
        sa.Column('home_classification', sa.String(), nullable=True),
        sa.Column('away_classification', sa.String(), nullable=True),
        sa.Column('home_conference', sa.String(), nullable=True),
        sa.Column('away_conference', sa.String(), nullable=True),
        sa.Column('conference_game', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('neutral_site', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('completed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('home_score', sa.Integer(), nullable=True),
        sa.Column('away_score', sa.Integer(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # 4. Create new pool_games (linkage only)
    op.create_table(
        'pool_games',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('pool_id', sa.Integer(), nullable=False),
        sa.Column('cfbd_game_id', sa.Integer(), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['pool_id'], ['pools.id']),
        sa.ForeignKeyConstraint(['cfbd_game_id'], ['cfbd_games.id']),
        sa.UniqueConstraint('pool_id', 'cfbd_game_id', name='uq_pool_games_pool_cfbd'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pool_games_pool_id', 'pool_games', ['pool_id'])
    op.create_index('ix_pool_games_cfbd_game_id', 'pool_games', ['cfbd_game_id'])

    # 5. Re-create pool_submission_game_items → pool_games FK
    op.create_index(
        'ix_pool_submission_game_items_pool_game_id',
        'pool_submission_game_items',
        ['pool_game_id'],
    )
    op.create_foreign_key(
        'pool_submission_game_items_pool_game_id_fkey',
        'pool_submission_game_items',
        'pool_games',
        ['pool_game_id'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'pool_submission_game_items_pool_game_id_fkey',
        'pool_submission_game_items',
        type_='foreignkey',
    )
    op.drop_index('ix_pool_submission_game_items_pool_game_id', table_name='pool_submission_game_items')

    op.drop_index('ix_pool_games_cfbd_game_id', table_name='pool_games')
    op.drop_index('ix_pool_games_pool_id', table_name='pool_games')
    op.drop_table('pool_games')
    op.drop_table('cfbd_games')

    op.create_table(
        'pool_games',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('pool_id', sa.Integer(), nullable=False),
        sa.Column('cfbd_game_id', sa.Integer(), nullable=False),
        sa.Column('cfbd_snapshot', sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column('home_team', sa.String(), nullable=False),
        sa.Column('away_team', sa.String(), nullable=False),
        sa.Column('game_date', sa.Date(), nullable=False),
        sa.Column('bowl_name', sa.String(), nullable=True),
        sa.Column('completed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('home_score', sa.Integer(), nullable=True),
        sa.Column('away_score', sa.Integer(), nullable=True),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['pool_id'], ['pools.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pool_games_pool_id', 'pool_games', ['pool_id'])

    op.create_index(
        'ix_pool_submission_game_items_pool_game_id',
        'pool_submission_game_items',
        ['pool_game_id'],
    )
    op.create_foreign_key(
        'pool_submission_game_items_pool_game_id_fkey',
        'pool_submission_game_items',
        'pool_games',
        ['pool_game_id'],
        ['id'],
    )
