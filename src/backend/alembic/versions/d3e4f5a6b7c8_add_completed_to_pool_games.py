"""add completed to pool_games

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-05-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('pool_games', sa.Column('completed', sa.Boolean(), nullable=True))
    # Backfill existing rows — all pre-existing games are 2025 bowl games (completed)
    op.execute("UPDATE pool_games SET completed = true WHERE completed IS NULL")
    op.alter_column('pool_games', 'completed', nullable=False, server_default='false')


def downgrade() -> None:
    op.drop_column('pool_games', 'completed')
