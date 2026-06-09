"""add sync_snapshots table

Revision ID: k0f1a2b3c4d5
Revises: j9e0f1a2b3c4
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from alembic import op

revision: str = 'k0f1a2b3c4d5'
down_revision: Union[str, None] = 'j9e0f1a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sync_snapshots',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('entity_type', sa.String(), nullable=False),
        sa.Column('entity_id', sa.String(), nullable=False),
        sa.Column('captured_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('content_hash', sa.LargeBinary(), nullable=False),
        sa.Column('payload', JSONB(), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
    )
    op.create_index(
        'ix_sync_snapshots_entity_captured',
        'sync_snapshots',
        ['entity_type', 'entity_id', 'captured_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_sync_snapshots_entity_captured', table_name='sync_snapshots')
    op.drop_table('sync_snapshots')
