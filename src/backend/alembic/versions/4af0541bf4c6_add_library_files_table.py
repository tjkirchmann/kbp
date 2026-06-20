"""add library_files table

Revision ID: 4af0541bf4c6
Revises: v1e2f3a4b5c6
Create Date: 2026-06-20 04:19:41.934313

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '4af0541bf4c6'
down_revision: Union[str, None] = 'v1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'library_files',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('s3_key', sa.String(), nullable=False),
        sa.Column('original_name', sa.String(), nullable=False),
        sa.Column('content_type', sa.String(), nullable=True),
        sa.Column('size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('etag', sa.String(), nullable=True),
        sa.Column('status', sa.String(), server_default='pending', nullable=False),
        sa.Column('uploaded_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['uploaded_by_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('s3_key'),
    )


def downgrade() -> None:
    op.drop_table('library_files')
