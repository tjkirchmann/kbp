"""add struct_output_definitions registry table

Creates ``struct_output_definitions`` — the registry of structured-output jobs.
Each row describes one job (source entity, output field specs, prompt, model,
schedule, lifecycle flags). The per-definition ``struct_output_{name}`` data
tables are NOT created here; they are created on demand at runtime from the
field spec (see ``app/services/struct_output/table.py``), since definitions are
DB-driven and admin-buildable.

Revision ID: 7f239d840e5c
Revises: 6138e8c55fa3
Create Date: 2026-06-26 01:16:05.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7f239d840e5c"
down_revision: str | None = "6138e8c55fa3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "struct_output_definitions",
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("source_table", sa.String(), nullable=False),
        sa.Column("source_pk", sa.String(), server_default="id", nullable=False),
        sa.Column("source_label_fields", JSONB(), nullable=False),
        sa.Column("source_filter", sa.String(), server_default="", nullable=False),
        sa.Column("fields", JSONB(), nullable=False),
        sa.Column("prompt_template", sa.String(), nullable=False),
        sa.Column("model", sa.String(), server_default="", nullable=False),
        sa.Column("cron", sa.String(), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("locked", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
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
        sa.PrimaryKeyConstraint("name"),
    )


def downgrade() -> None:
    op.drop_table("struct_output_definitions")
