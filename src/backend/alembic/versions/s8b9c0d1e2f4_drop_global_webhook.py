"""drop global webhook: channels are the only delivery primitive

Removes the legacy per-task webhook override and the global discord webhook
admin_config key. After this, every notification resolves to a notification_channels
row; a null/blank channel falls back to the built-in `none` channel (silence).

Revision ID: s8b9c0d1e2f4
Revises: q6f7a8b9c0d1
Create Date: 2026-06-16 00:00:00.000000

Note: re-id'd from the colliding 's8b9c0d1e2f3' (shared with add_cfbd_dim_tables
after two branches merged) to 's8b9c0d1e2f4' and chained before the dim-tables
migration, linearizing what was a duplicate-revision / multi-head break.

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 's8b9c0d1e2f4'
down_revision: Union[str, None] = 'q6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Migrate any legacy per-task webhook override onto a real channel so no
    #    delivery is silently lost. For each task with a webhook but no channel,
    #    upsert a `task:<name>` discord channel and point channel_name at it.
    #    Set-based and idempotent — a no-op when no such rows exist.
    op.execute(sa.text("""
        INSERT INTO notification_channels (name, strategy, config)
        SELECT 'task:' || task_name, 'discord',
               jsonb_build_object('webhook_url', webhook_url)
        FROM admin_notify_config
        WHERE webhook_url IS NOT NULL AND webhook_url <> '' AND channel_name IS NULL
        ON CONFLICT (name) DO NOTHING
    """))
    op.execute(sa.text("""
        UPDATE admin_notify_config
        SET channel_name = 'task:' || task_name
        WHERE webhook_url IS NOT NULL AND webhook_url <> '' AND channel_name IS NULL
    """))

    # 2. Drop the legacy override column.
    op.drop_column('admin_notify_config', 'webhook_url')

    # 3. Drop the now-orphaned global webhook admin_config key.
    op.execute(sa.text("DELETE FROM admin_config WHERE key = 'discord_webhook_url'"))


def downgrade() -> None:
    op.add_column(
        'admin_notify_config',
        sa.Column('webhook_url', sa.String(), nullable=True),
    )
    # No backfill: the global webhook key is not restored (data is unrecoverable
    # from the channel rows without ambiguity); add_column suffices for schema.
