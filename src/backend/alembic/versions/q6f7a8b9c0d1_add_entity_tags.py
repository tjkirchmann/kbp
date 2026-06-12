"""add entity_tags global tagging table

Revision ID: q6f7a8b9c0d1
Revises: r7a8b9c0d1e2
Create Date: 2026-06-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'q6f7a8b9c0d1'
down_revision: Union[str, None] = 'r7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'entity_tags',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('entity_type', sa.String(), nullable=False),
        sa.Column('entity_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('entity_type', 'entity_id', 'name', name='uq_entity_tags_type_id_name'),
    )
    op.create_index('ix_entity_tags_type_id', 'entity_tags', ['entity_type', 'entity_id'])
    op.create_index('ix_entity_tags_type_name', 'entity_tags', ['entity_type', 'name'])


def downgrade() -> None:
    op.drop_index('ix_entity_tags_type_name', table_name='entity_tags')
    op.drop_index('ix_entity_tags_type_id', table_name='entity_tags')
    op.drop_table('entity_tags')
