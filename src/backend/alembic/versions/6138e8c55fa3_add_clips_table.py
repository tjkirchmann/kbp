"""add clips table

Creates the ``clips`` table — the central object of the video-processing
pipeline. A clip derives from a source ``library_files`` row (N:1) and carries
ffprobe-probed video metadata. ``status`` is the ``clip_status`` enum
(ready | failed).

Revision ID: 6138e8c55fa3
Revises: b0034b82fa22
Create Date: 2026-06-24 02:01:40.105978

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6138e8c55fa3"
down_revision: str | None = "b0034b82fa22"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: the type is emitted manually below so SQLAlchemy's
# auto-CREATE-TYPE event (fired on model import in env.py) doesn't collide.
clip_status = PG_ENUM("ready", "failed", name="clip_status", create_type=False)


def upgrade() -> None:
    # Guarded: SQLAlchemy's metadata event may have already emitted the type
    # (it fires on model import in env.py). Idempotent so a clean DB still works.
    op.execute(
        "DO $$ BEGIN "
        "CREATE TYPE clip_status AS ENUM ('ready', 'failed'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$"
    )
    op.create_table(
        "clips",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("library_file_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            clip_status,
            server_default="ready",
            nullable=False,
        ),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("fps", sa.String(), nullable=True),
        sa.Column("codec", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["library_file_id"], ["library_files.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_clips_library_file_id"), "clips", ["library_file_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_clips_library_file_id"), table_name="clips")
    op.drop_table("clips")
    op.execute("DROP TYPE clip_status")
