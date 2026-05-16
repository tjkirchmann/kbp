"""add multiplier and playoff_slot to pool_games

Revision ID: i8d9e0f1a2b3
Revises: h7c8d9e0f1a2
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'i8d9e0f1a2b3'
down_revision: Union[str, None] = 'h7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('pool_games', sa.Column('multiplier', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('pool_games', sa.Column('playoff_slot', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('pool_games', 'playoff_slot')
    op.drop_column('pool_games', 'multiplier')
