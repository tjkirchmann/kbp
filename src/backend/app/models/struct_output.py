"""Structured-output registry.

One row fully describes a structured-output job: which source entity table to
read, what fields the LLM should produce (each with a type + description), the
prompt, the model, and runtime knobs (cron, enabled, locked, soft-delete state).

From a row we derive everything else at runtime:
  * a Pydantic model (``create_model``) the LLM fills in — see
    ``app/services/struct_output/schema.py``;
  * a per-definition ``struct_output_{name}`` data table created on demand — see
    ``app/services/struct_output/table.py``;
  * a Temporal batch/entity workflow + optional Schedule — see
    ``app/temporal/struct_output/``.

Definitions are DB-driven (admin-buildable in a later phase). The one we code
off of (``program_profile``) is *seeded* as a locked row from
``app/services/struct_output/seeds.py``; ``locked`` rows can't be deleted via the
API and are re-seeded idempotently on boot.

``fields`` JSON shape — a list of:
    {"name": str, "type": <FieldType>, "description": str,
     "enum": [str, ...]?}     # enum only for type == "tier"/"enum"
"""

from datetime import datetime

from sqlalchemy import Boolean, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StructOutputDefinition(Base):
    __tablename__ = "struct_output_definitions"

    # Slug; also drives the data table name (struct_output_{name}) and workflow ids.
    name: Mapped[str] = mapped_column(String, primary_key=True)

    # Source entity: table to read rows from, its PK column, and which columns to
    # feed the LLM as context (e.g. school/mascot/conference for cfbd_teams).
    source_table: Mapped[str] = mapped_column(String, nullable=False)
    source_pk: Mapped[str] = mapped_column(String, nullable=False, server_default="id")
    source_label_fields: Mapped[list] = mapped_column(JSONB, nullable=False)
    # Optional SQL boolean expression to scope source rows (e.g.
    # "classification = 'fbs'"). Empty = all rows. Trusted/admin-authored.
    source_filter: Mapped[str] = mapped_column(
        String, nullable=False, server_default=""
    )

    # Output schema (list of field specs) + the prompt that generates them.
    fields: Mapped[list] = mapped_column(JSONB, nullable=False)
    prompt_template: Mapped[str] = mapped_column(String, nullable=False)

    # LLM model in OpenRouter form (e.g. "openai/gpt-4o"); blank → settings default.
    model: Mapped[str] = mapped_column(String, nullable=False, server_default="")

    # Runtime knobs.
    cron: Mapped[str | None] = mapped_column(
        String, nullable=True
    )  # 5-field UTC; null = no schedule
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    # Locked = load-bearing seed; cannot be deleted/edited away via the API.
    locked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # Soft delete: deregisters the schedule and hides the definition, but keeps the
    # row + data table so it's recoverable. Hard delete (later phase) drops both.
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )
