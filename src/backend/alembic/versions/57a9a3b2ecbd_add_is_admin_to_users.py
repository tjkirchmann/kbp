"""add_is_admin_to_users

Revision ID: 57a9a3b2ecbd
Revises: 3c788ce6d281
Create Date: 2026-05-06 20:59:24.423582

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "57a9a3b2ecbd"
down_revision: str | None = "3c788ce6d281"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("users", "is_admin")
