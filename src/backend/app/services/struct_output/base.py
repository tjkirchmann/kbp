"""The structured-output Definition seam.

Both tiers of structured-output job implement one interface — ``BaseDefinition`` —
so the Temporal activities, the LLM runner, and the schedule reconciler are written
once and never care how a definition is authored or stored.

Tiers:
  * **Static** (``StaticDefinition``) — known at startup, authored in code. Output
    is a real Pydantic model + a real Alembic-migrated ORM table; source filtering
    is a real SQLAlchemy predicate. This is the load-bearing, type-safe path
    (e.g. ``program_profile``).
  * **Dynamic** (``DynamicDefinition``) — configured at runtime from a row in
    ``struct_output_definitions`` (a future admin UI is the author). Adapts the
    existing ``schema``/``registry``/``table`` dynamic machinery to the seam.

Resolver (``get_definition`` / ``all_scheduled``) looks a definition up by name
across both tiers — static first, then the DB. Static definitions register
themselves into ``STATIC`` at import via ``register_static`` (the ``definitions``
package does this; it's imported lazily here to avoid a load-time cycle).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.struct_output import StructOutputDefinition
from app.services.struct_output import registry, table
from app.services.struct_output.schema import build_model


class BaseDefinition(ABC):
    """Interface every structured-output definition implements.

    Subclasses provide the varying parts (the output schema, where source rows
    come from, how results are stored). Shared logic — prompt rendering and model
    resolution — lives here and is identical for both tiers.
    """

    # Identity + runtime knobs. Static defs set these as class attrs; the dynamic
    # adapter exposes them as properties over its registry row.
    name: str
    cron: str | None
    model: str  # OpenRouter id; "" → settings.openrouter_default_model

    @property
    @abstractmethod
    def prompt_template(self) -> str:
        """str.format-style prompt; references source label fields (e.g. {school})."""

    # --- shared logic ------------------------------------------------------

    def effective_model(self) -> str:
        """OpenRouter model id for this definition (blank → settings default)."""
        return (self.model or "").strip() or settings.openrouter_default_model

    def render_prompt(self, entity: dict) -> str:
        """Render the prompt template against a source row dict.

        Unknown placeholders (a template referencing a field not present in the
        source row) raise ``ValueError`` so a template/field mismatch fails loudly
        rather than producing an empty value.
        """
        try:
            return self.prompt_template.format(**entity)
        except KeyError as exc:
            raise ValueError(
                f"prompt_template for {self.name!r} references {exc} not present in "
                f"the source row (available fields: {list(entity)})"
            ) from exc

    # --- varying parts (each tier implements) ------------------------------

    @abstractmethod
    def output_model(self) -> type[BaseModel]:
        """The Pydantic model the LLM must produce (used as pydantic-ai output_type)."""

    @abstractmethod
    async def fetch_source_ids(self, db: AsyncSession) -> list[int]:
        """All source entity ids in scope (after any definition-level filter)."""

    @abstractmethod
    async def existing_entity_ids(self, db: AsyncSession) -> set[int]:
        """Entity ids already stored in this definition's output table."""

    @abstractmethod
    async def fetch_source_row(
        self, db: AsyncSession, entity_id: int
    ) -> dict | None:
        """One source row as {pk + label_fields} for prompt rendering. None if gone."""

    @abstractmethod
    async def upsert(
        self,
        db: AsyncSession,
        entity_id: int,
        values: dict,
        *,
        model: str,
        run_id: str,
    ) -> None:
        """Store one generated result keyed on the source entity id (idempotent)."""


class StaticDefinition(BaseDefinition):
    """A definition known at startup and authored in code.

    Subclass, set the class attributes below, override ``filter_source`` to scope
    source rows if needed, instantiate, and register via ``register_static`` (the
    ``definitions`` package does this at import). Output is fully type-safe: the
    LLM schema is a real Pydantic model and the results table is a real
    Alembic-migrated ORM model — no dynamic DDL, no string-built queries.

    Required class attrs:
      ``name``               — slug; also the data-table suffix (struct_output_{name})
      ``prompt_template``    — str.format-style prompt over source label fields
      ``output``             — the Pydantic ``BaseModel`` subclass (LLM output schema)
      ``output_orm``         — SQLAlchemy ORM model for the output table (its single
                               integer PK must be the FK to the source entity)
      ``source_model``       — the source ORM model (e.g. ``CfbdTeam``)
      ``source_label_fields``— source columns fed to the prompt (e.g. school/mascot)

    Optional:
      ``source_pk`` (default "id") — the source PK column
      ``cron`` (default None)      — 5-field UTC; None = no schedule
      ``model`` (default "")       — OpenRouter id; "" → settings default
    """

    name: str = ""
    prompt_template: str = ""
    cron: str | None = None
    model: str = ""

    output: type[BaseModel]
    output_orm: Any  # SQLAlchemy ORM model class
    source_model: Any
    source_pk: str = "id"
    source_label_fields: list[str]

    def filter_source(self, stmt: Any) -> Any:
        """Override to scope source rows (e.g.
        ``stmt.where(CfbdTeam.classification == 'fbs')``). Default: all rows.
        """
        return stmt

    def output_model(self) -> type[BaseModel]:
        return self.output

    async def fetch_source_ids(self, db: AsyncSession) -> list[int]:
        stmt = self.filter_source(select(getattr(self.source_model, self.source_pk)))
        rows = await db.execute(stmt)
        return [r[0] for r in rows.all()]

    async def existing_entity_ids(self, db: AsyncSession) -> set[int]:
        # The output table's PK *is* the entity FK by convention (one row per entity).
        pk_col = sa_inspect(self.output_orm).primary_key[0]
        rows = await db.execute(select(pk_col))
        return {r[0] for r in rows.all()}

    async def fetch_source_row(
        self, db: AsyncSession, entity_id: int
    ) -> dict | None:
        obj = await db.get(self.source_model, entity_id)
        if obj is None:
            return None
        cols = [self.source_pk, *self.source_label_fields]
        return {c: getattr(obj, c) for c in cols}

    async def upsert(
        self,
        db: AsyncSession,
        entity_id: int,
        values: dict,
        *,
        model: str,
        run_id: str,
    ) -> None:
        orm = self.output_orm
        pk_name = sa_inspect(orm).primary_key[0].name
        row = await db.get(orm, entity_id)
        if row is None:
            payload = {**values, pk_name: entity_id, "model": model, "run_id": run_id}
            db.add(orm(**payload))
        else:
            for key, val in values.items():
                setattr(row, key, val)
            row.model = model
            row.run_id = run_id
            row.generated_at = func.now()
        await db.commit()


class DynamicDefinition(BaseDefinition):
    """A definition authored at runtime, stored as a registry row.

    Wraps a ``StructOutputDefinition`` and adapts the existing dynamic machinery
    (``schema.build_model``, the ``registry`` source fetchers, ``table`` DDL +
    upsert) to the ``BaseDefinition`` seam. The per-definition data table is
    created on demand on the first storage op (``CREATE TABLE IF NOT EXISTS``),
    so its schema cannot evolve once created — editing a dynamic definition's
    fields will not migrate its existing table. That is a known limitation,
    deferred until the admin-UI phase adds DDL migration.
    """

    def __init__(self, row: StructOutputDefinition) -> None:
        self.row = row

    @property
    def name(self) -> str:
        return self.row.name

    @property
    def prompt_template(self) -> str:
        return self.row.prompt_template

    @property
    def cron(self) -> str | None:
        return self.row.cron

    @property
    def model(self) -> str:
        return self.row.model

    def output_model(self) -> type[BaseModel]:
        return build_model(self.row.name, self.row.fields)

    async def fetch_source_ids(self, db: AsyncSession) -> list[int]:
        return await registry.fetch_source_ids(db, self.row)

    async def fetch_source_row(
        self, db: AsyncSession, entity_id: int
    ) -> dict | None:
        return await registry.fetch_source_row(db, self.row, entity_id)

    async def existing_entity_ids(self, db: AsyncSession) -> set[int]:
        # Lazily ensure the dynamic table exists before reading it.
        await table.ensure_output_table(db, self.row)
        return await table.existing_entity_ids(db, self.row)

    async def upsert(
        self,
        db: AsyncSession,
        entity_id: int,
        values: dict,
        *,
        model: str,
        run_id: str,
    ) -> None:
        await table.ensure_output_table(db, self.row)
        await table.upsert_output(
            db, self.row, entity_id, values, model=model, run_id=run_id
        )


# --- static-definition registry + combined resolver ----------------------

STATIC: dict[str, BaseDefinition] = {}
_static_loaded = False


def register_static(defn: BaseDefinition) -> None:
    """Register a static definition. Idempotent by name (last write wins)."""
    STATIC[defn.name] = defn


def _ensure_static_loaded() -> None:
    """Import the definitions package once so ``STATIC`` is populated.

    The ``definitions`` package registers each static definition at import via
    ``register_static``. We trigger it lazily here so callers (activities, schedule
    reconcile, the admin router) never have to remember to import it — and so this
    module does not hard-depend on the definitions package at load time, which
    would create an import cycle (definitions → base → definitions).
    """
    global _static_loaded
    if _static_loaded:
        return
    import app.services.struct_output.definitions  # noqa: F401  (side-effect import)

    _static_loaded = True


async def get_definition(db: AsyncSession, name: str) -> BaseDefinition | None:
    """Resolve a definition by name across both tiers (static first, then DB)."""
    _ensure_static_loaded()
    if name in STATIC:
        return STATIC[name]
    row = await registry.get_definition(db, name)
    return DynamicDefinition(row) if row else None


async def all_definitions(db: AsyncSession) -> list[BaseDefinition]:
    """All definitions — static (code) ∪ dynamic (registry, not soft-deleted).

    Static wins on name collisions (a dynamic row shadowed by a static definition
    is skipped), matching ``get_definition`` / ``all_scheduled``.
    """
    _ensure_static_loaded()
    out: list[BaseDefinition] = list(STATIC.values())
    for row in await registry.list_active(db):
        if row.name in STATIC:
            continue
        out.append(DynamicDefinition(row))
    return out


async def all_scheduled(db: AsyncSession) -> list[BaseDefinition]:
    """All scheduled definitions — static (code, cron set) ∪ dynamic (DB, enabled).

    Static definitions take precedence by name: a dynamic registry row whose name
    collides with a static definition is skipped, matching ``get_definition``'s
    static-first semantics. This keeps a stale or colliding row from producing a
    duplicate (or conflicting) schedule.
    """
    _ensure_static_loaded()
    scheduled: list[BaseDefinition] = [
        d for d in STATIC.values() if (d.cron or "").strip()
    ]
    for row in await registry.list_scheduled(db):
        if row.name in STATIC:
            continue  # static wins; skip the shadowed dynamic row
        scheduled.append(DynamicDefinition(row))
    return scheduled
