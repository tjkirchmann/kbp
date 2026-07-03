"""add struct_output_program_profile table

Creates the static (code-tracked) ``struct_output_program_profile`` table — one
LLM-generated program-profile ranking per FBS team (``cfbd_teams``), produced by
the ``ProgramProfileDefinition`` static definition. PK ``cfbd_team_id`` is the FK
to ``cfbd_teams.id`` (one row per source entity, the convention static output
tables follow).

Hand-written (rather than ``alembic revision --autogenerate``) because the dev DB
was stamped at a removed revision at the time; the schema is a straight mirror of
the ``StructOutputProgramProfile`` ORM model.

NOTE: if you previously ran the *dynamic* ``program_profile`` definition on this
branch, a same-named table created via ``CREATE TABLE IF NOT EXISTS`` already
exists locally — drop it once (``DROP TABLE struct_output_program_profile;``)
before running this migration. Pre-merge, no real data to preserve.

Revision ID: f0e1d2c3b4a5
Revises: 7f239d840e5c
Create Date: 2026-07-02 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f0e1d2c3b4a5"
down_revision: str | None = "7f239d840e5c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "struct_output_program_profile",
        sa.Column("cfbd_team_id", sa.Integer(), nullable=False),
        # --- 10 profile categories: score / tier / rationale ------------------
        sa.Column("historical_prestige_score", sa.Integer(), nullable=False),
        sa.Column("historical_prestige_tier", sa.String(), nullable=False),
        sa.Column("historical_prestige_rationale", sa.String(), nullable=False),
        sa.Column("stadium_atmosphere_score", sa.Integer(), nullable=False),
        sa.Column("stadium_atmosphere_tier", sa.String(), nullable=False),
        sa.Column("stadium_atmosphere_rationale", sa.String(), nullable=False),
        sa.Column("fanbase_passion_score", sa.Integer(), nullable=False),
        sa.Column("fanbase_passion_tier", sa.String(), nullable=False),
        sa.Column("fanbase_passion_rationale", sa.String(), nullable=False),
        sa.Column("brand_marketability_score", sa.Integer(), nullable=False),
        sa.Column("brand_marketability_tier", sa.String(), nullable=False),
        sa.Column("brand_marketability_rationale", sa.String(), nullable=False),
        sa.Column("facilities_resources_score", sa.Integer(), nullable=False),
        sa.Column("facilities_resources_tier", sa.String(), nullable=False),
        sa.Column("facilities_resources_rationale", sa.String(), nullable=False),
        sa.Column("nfl_pipeline_score", sa.Integer(), nullable=False),
        sa.Column("nfl_pipeline_tier", sa.String(), nullable=False),
        sa.Column("nfl_pipeline_rationale", sa.String(), nullable=False),
        sa.Column("recruiting_nil_score", sa.Integer(), nullable=False),
        sa.Column("recruiting_nil_tier", sa.String(), nullable=False),
        sa.Column("recruiting_nil_rationale", sa.String(), nullable=False),
        sa.Column("academic_profile_score", sa.Integer(), nullable=False),
        sa.Column("academic_profile_tier", sa.String(), nullable=False),
        sa.Column("academic_profile_rationale", sa.String(), nullable=False),
        sa.Column("conference_strength_score", sa.Integer(), nullable=False),
        sa.Column("conference_strength_tier", sa.String(), nullable=False),
        sa.Column("conference_strength_rationale", sa.String(), nullable=False),
        sa.Column("rivalries_culture_score", sa.Integer(), nullable=False),
        sa.Column("rivalries_culture_tier", sa.String(), nullable=False),
        sa.Column("rivalries_culture_rationale", sa.String(), nullable=False),
        # --- overall ----------------------------------------------------------
        sa.Column("overall_score", sa.Integer(), nullable=False),
        sa.Column("overall_rationale", sa.String(), nullable=False),
        # --- bookkeeping ------------------------------------------------------
        sa.Column(
            "generated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("run_id", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["cfbd_team_id"], ["cfbd_teams.id"]),
        sa.PrimaryKeyConstraint("cfbd_team_id"),
    )


def downgrade() -> None:
    op.drop_table("struct_output_program_profile")
