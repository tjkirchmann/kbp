"""add submitted_at to pool_submissions

Revision ID: w2f3a4b5c6d7
Revises: v1e2f3a4b5c6
Create Date: 2026-06-20 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'w2f3a4b5c6d7'
down_revision: Union[str, None] = 'v1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'pool_submissions',
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('pool_submissions', 'submitted_at')
