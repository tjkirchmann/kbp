"""add structured-output tables (registry + program_profile)

Creates the two structured-output tables:

- ``struct_output_definitions`` — the registry of structured-output jobs. Each
  row describes one job (source entity, output field specs, prompt, model,
  schedule, lifecycle flags). The per-definition ``struct_output_{name}`` data
  tables for *dynamic* definitions are NOT created here; they are created on
  demand at runtime from the field spec (see
  ``app/services/struct_output/table.py``), since definitions are DB-driven and
  admin-buildable.

- ``struct_output_program_profile`` — the static (code-tracked) output table:
  one LLM-generated program-profile ranking per FBS team (``cfbd_teams``),
  produced by the ``ProgramProfileDefinition`` static definition. PK
  ``cfbd_team_id`` is the FK to ``cfbd_teams.id`` (one row per source entity,
  the convention static output tables follow). Hand-written mirror of the
  ``StructOutputProgramProfile`` ORM model.

Revision ID: a9b8c7d6e5f4
Revises: y4b5c6d7e8f9
Create Date: 2026-07-02 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9b8c7d6e5f4"
down_revision: str | None = "y4b5c6d7e8f9"
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
    op.drop_table("struct_output_definitions")
