"""add pool_questions and submission_answers

Adds an extensible per-pool question/answer system:
- pool_questions: admin-defined questions on a pool (ordered, typed, soft-deleted)
- submission_answers: a submitter's answer to a pool question (one per question)

Revision ID: z5c6d7e8f9a0
Revises: y4b5c6d7e8f9
Create Date: 2026-06-23 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM

from alembic import op

revision: str = "z5c6d7e8f9a0"
down_revision: str | None = "y4b5c6d7e8f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

question_type_enum = PG_ENUM(
    "text", "number", "boolean", name="question_type", create_type=False
)


def upgrade() -> None:
    op.execute("CREATE TYPE question_type AS ENUM ('text', 'number', 'boolean')")
    op.create_table(
        "pool_questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("pool_id", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.String(), nullable=False),
        sa.Column("question_type", question_type_enum, nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("required", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["pool_id"], ["pools.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pool_questions_pool_id", "pool_questions", ["pool_id"])

    op.create_table(
        "submission_answers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("answer_text", sa.String(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["submission_id"], ["pool_submissions.id"]),
        sa.ForeignKeyConstraint(["question_id"], ["pool_questions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "submission_id", "question_id", name="uq_submission_answers_sub_q"
        ),
    )
    op.create_index(
        "ix_submission_answers_submission_id",
        "submission_answers",
        ["submission_id"],
    )
    op.create_index(
        "ix_submission_answers_question_id",
        "submission_answers",
        ["question_id"],
    )


def downgrade() -> None:
    op.drop_table("submission_answers")
    op.drop_table("pool_questions")
    op.execute("DROP TYPE question_type")
