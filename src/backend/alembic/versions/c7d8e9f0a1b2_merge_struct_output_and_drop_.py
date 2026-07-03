"""merge struct_output and drop_procrastinate heads

Revision ID: c7d8e9f0a1b2
Revises: f0e1d2c3b4a5, y4b5c6d7e8f9
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d8e9f0a1b2'
down_revision: Union[str, None] = ('f0e1d2c3b4a5', 'y4b5c6d7e8f9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
