"""merge library_files and cfbd_games_week heads

Revision ID: b0034b82fa22
Revises: 4af0541bf4c6, x3a4b5c6d7e8
Create Date: 2026-06-24 02:01:12.303005

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b0034b82fa22"
down_revision: str | None = ("4af0541bf4c6", "x3a4b5c6d7e8")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
