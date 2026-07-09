"""add pipeline builder

Creates the pipeline breadboard editor tables (pipelines, pipeline_runs,
node_runs, artifacts) plus project workspaces that own files and runs.

Revision ID: 2afb1d2de0ef
Revises: z5c6d7e8f9a0
Create Date: 2026-07-08 23:22:16.531845

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2afb1d2de0ef"
down_revision: str | None = "z5c6d7e8f9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── projects ─────────────────────────────────────────────────────────
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_projects_owner_id"), "projects", ["owner_id"], unique=False
    )

    op.add_column(
        "library_files", sa.Column("project_id", sa.Integer(), nullable=True)
    )
    op.create_index(
        op.f("ix_library_files_project_id"),
        "library_files",
        ["project_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_library_files_project_id",
        "library_files",
        "projects",
        ["project_id"],
        ["id"],
    )

    # ── pipelines ────────────────────────────────────────────────────────
    op.create_table(
        "pipelines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("graph", JSONB(), server_default="{}", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── pipeline_runs ────────────────────────────────────────────────────
    op.create_table(
        "pipeline_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pipeline_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("workflow_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), server_default="queued", nullable=False),
        sa.Column("graph", JSONB(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["pipeline_id"], ["pipelines.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_pipeline_runs_pipeline_id"),
        "pipeline_runs",
        ["pipeline_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_pipeline_runs_project_id"),
        "pipeline_runs",
        ["project_id"],
        unique=False,
    )

    # ── node_runs ────────────────────────────────────────────────────────
    op.create_table(
        "node_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.String(), nullable=False),
        sa.Column("step_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), server_default="queued", nullable=False),
        sa.Column("progress", sa.Float(), nullable=True),
        sa.Column("log_tail", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("attempt", sa.Integer(), server_default="1", nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["run_id"], ["pipeline_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "node_id"),
    )
    op.create_index(op.f("ix_node_runs_run_id"), "node_runs", ["run_id"], unique=False)

    # ── artifacts ────────────────────────────────────────────────────────
    op.create_table(
        "artifacts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.String(), nullable=False),
        sa.Column("output_port", sa.String(), nullable=False),
        sa.Column("library_file_id", sa.Integer(), nullable=True),
        sa.Column("s3_key", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("meta", JSONB(), server_default="{}", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["pipeline_runs.id"]),
        sa.ForeignKeyConstraint(["library_file_id"], ["library_files.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_artifacts_run_id"), "artifacts", ["run_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_artifacts_run_id"), table_name="artifacts")
    op.drop_table("artifacts")

    op.drop_index(op.f("ix_node_runs_run_id"), table_name="node_runs")
    op.drop_table("node_runs")

    op.drop_index(op.f("ix_pipeline_runs_project_id"), table_name="pipeline_runs")
    op.drop_index(op.f("ix_pipeline_runs_pipeline_id"), table_name="pipeline_runs")
    op.drop_table("pipeline_runs")

    op.drop_table("pipelines")

    op.drop_constraint(
        "fk_library_files_project_id", "library_files", type_="foreignkey"
    )
    op.drop_index(op.f("ix_library_files_project_id"), table_name="library_files")
    op.drop_column("library_files", "project_id")

    op.drop_index(op.f("ix_projects_owner_id"), table_name="projects")
    op.drop_table("projects")
