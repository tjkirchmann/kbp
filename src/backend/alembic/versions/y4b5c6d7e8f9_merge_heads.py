"""merge heads

Unifies the three divergent alembic heads that existed on this branch:
- 4af0541bf4c6 (add library_files table)
- w2f3a4b5c6d7 (add submitted_at to pool_submissions)
- x3a4b5c6d7e8 (add week column to cfbd_games)

Revision ID: y4b5c6d7e8f9
Revises: 4af0541bf4c6, w2f3a4b5c6d7, x3a4b5c6d7e8
Create Date: 2026-06-23 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

revision: str = "y4b5c6d7e8f9"
down_revision: tuple[str, ...] = (
    "4af0541bf4c6",
    "w2f3a4b5c6d7",
    "x3a4b5c6d7e8",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
