"""merge library_files and cfbd_games_week heads

Revision ID: b0034b82fa22
Revises: 4af0541bf4c6, x3a4b5c6d7e8
Create Date: 2026-06-24 02:01:12.303005

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b0034b82fa22'
down_revision: Union[str, None] = ('4af0541bf4c6', 'x3a4b5c6d7e8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
