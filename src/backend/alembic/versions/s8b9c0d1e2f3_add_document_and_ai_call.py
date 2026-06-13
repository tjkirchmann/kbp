"""add document + ai_call tables for durable document analysis

Revision ID: s8b9c0d1e2f3
Revises: q6f7a8b9c0d1
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 's8b9c0d1e2f3'
down_revision: Union[str, None] = 'q6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# extract/ai_call are high-volume; default them out of the run-history rail.
# Left as an admin toggle (hide_in_history) like any other task.
_HIDE_TASKS = ('extract', 'ai_call')


def upgrade() -> None:
    op.create_table(
        'document',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('mime', sa.String(), nullable=True),
        sa.Column('content_hash', sa.String(), nullable=False),
        sa.Column('storage_key', sa.String(), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('text_chars', sa.Integer(), nullable=True),
        sa.Column('error', sa.String(), nullable=True),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('job_id', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('content_hash', name='uq_document_content_hash'),
    )
    op.create_index('ix_document_status', 'document', ['status'])
    op.create_index('ix_document_created_at', 'document', ['created_at'])

    op.create_table(
        'ai_call',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('document_id', sa.BigInteger(), nullable=True),
        sa.Column('model', sa.String(), nullable=True),
        sa.Column('request', postgresql.JSONB(), nullable=False),
        sa.Column('response', postgresql.JSONB(), nullable=True),
        sa.Column('error', sa.String(), nullable=True),
        sa.Column('raw_output', sa.Text(), nullable=True),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('reprompts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('prompt_tokens', sa.Integer(), nullable=True),
        sa.Column('completion_tokens', sa.Integer(), nullable=True),
        sa.Column('total_tokens', sa.Integer(), nullable=True),
        sa.Column('job_id', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['document_id'], ['document.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_ai_call_status', 'ai_call', ['status'])
    op.create_index('ix_ai_call_created_at', 'ai_call', ['created_at'])
    op.create_index('ix_ai_call_document_id', 'ai_call', ['document_id'])

    for task_name in _HIDE_TASKS:
        op.execute(
            sa.text(
                "INSERT INTO admin_notify_config (task_name, hide_in_history) "
                "VALUES (:t, true) ON CONFLICT (task_name) DO NOTHING"
            ).bindparams(t=task_name)
        )


def downgrade() -> None:
    for task_name in _HIDE_TASKS:
        op.execute(
            sa.text("DELETE FROM admin_notify_config WHERE task_name = :t").bindparams(t=task_name)
        )
    op.drop_index('ix_ai_call_document_id', table_name='ai_call')
    op.drop_index('ix_ai_call_created_at', table_name='ai_call')
    op.drop_index('ix_ai_call_status', table_name='ai_call')
    op.drop_table('ai_call')
    op.drop_index('ix_document_created_at', table_name='document')
    op.drop_index('ix_document_status', table_name='document')
    op.drop_table('document')
