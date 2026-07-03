"""Structured-output admin routes (read-only, both tiers).

Lets admins list definitions across both tiers (static = code-tracked,
dynamic = registry row) and inspect a definition's generated rows. Each item is
tagged with its ``tier`` so the admin UI can tell them apart. The outputs endpoint
LEFT JOINs each definition's declared source table and prepends its
``source_label_fields`` as ``_labels``, so rows carry friendly identity values
(e.g. a team name) alongside their generated columns. Build / trigger / delete
endpoints are deferred to a later phase; the trigger seam already exists as
``app.temporal.struct_output.schedule.trigger_batch`` / ``trigger_entity``.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_admin
from app.core.database import get_db
from app.services.struct_output import base, table
from app.services.struct_output.base import StaticDefinition

router = APIRouter(prefix="/admin/struct-output", dependencies=[Depends(require_admin)])


def _type_label(annotation: Any) -> str:
    """Best-effort human type label for a Pydantic field annotation (admin view)."""
    name = getattr(annotation, "__name__", None)
    if name:
        return name
    return str(annotation).removeprefix("typing.")


def _summary(defn: Any) -> dict[str, Any]:
    """One-row summary for the list view — uniform across tiers."""
    if isinstance(defn, StaticDefinition):
        return {
            "name": defn.name,
            "tier": "static",
            "source": defn.source_model.__tablename__,
            "field_count": len(defn.output.model_fields),
            "model": defn.effective_model(),
            "cron": defn.cron,
            "enabled": True,
            "locked": True,
        }
    row = defn.row
    return {
        "name": row.name,
        "tier": "dynamic",
        "source": row.source_table,
        "field_count": len(row.fields),
        "model": defn.effective_model(),
        "cron": row.cron,
        "enabled": row.enabled,
        "locked": row.locked,
    }


def _source_join(defn: Any) -> tuple[str, str, list[str], str]:
    """Resolve the source join for ``list_outputs`` (uniform across tiers).

    Returns ``(source_table, source_pk, label_fields, output_entity_column)``
    where ``output_entity_column`` is the FK column in the output table that joins
    back to ``source_table.source_pk``. Every definition declares its source via
    the ``BaseDefinition`` seam, so this works for static (code) and dynamic
    (registry) definitions alike.
    """
    if isinstance(defn, StaticDefinition):
        entity_col = sa_inspect(defn.output_orm).primary_key[0].name
        return (
            defn.source_model.__tablename__,
            defn.source_pk,
            list(defn.source_label_fields),
            entity_col,
        )
    row = defn.row
    return (
        row.source_table,
        row.source_pk,
        list(row.source_label_fields),
        table._entity_col(row),
    )


@router.get("/")
async def list_definitions(db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    return [_summary(d) for d in await base.all_definitions(db)]


@router.get("/{name}")
async def get_definition(
    name: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    defn = await base.get_definition(db, name)
    if defn is None:
        raise HTTPException(status_code=404, detail=f"Unknown definition {name!r}")
    if isinstance(defn, StaticDefinition):
        return {
            "name": defn.name,
            "tier": "static",
            "source": defn.source_model.__tablename__,
            "source_label_fields": defn.source_label_fields,
            "fields": [
                {"name": n, "type": _type_label(f.annotation)}
                for n, f in defn.output.model_fields.items()
            ],
            "prompt_template": defn.prompt_template,
            "model": defn.effective_model(),
            "cron": defn.cron,
            "enabled": True,
            "locked": True,
        }
    row = defn.row
    return {
        "name": row.name,
        "tier": "dynamic",
        "source_table": row.source_table,
        "source_pk": row.source_pk,
        "source_filter": row.source_filter,
        "source_label_fields": row.source_label_fields,
        "fields": row.fields,
        "prompt_template": row.prompt_template,
        "model": defn.effective_model(),
        "cron": row.cron,
        "enabled": row.enabled,
        "locked": row.locked,
    }


@router.get("/{name}/outputs")
async def list_outputs(
    name: str, limit: int = 200, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    defn = await base.get_definition(db, name)
    if defn is None:
        raise HTTPException(status_code=404, detail=f"Unknown definition {name!r}")

    # LEFT JOIN the source table and prepend the definition's declared label
    # fields so rows read "Alabama" instead of a bare entity-id integer. Works for
    # both tiers — every definition declares its source via the BaseDefinition seam.
    src_table, src_pk, label_fields, entity_col = _source_join(defn)
    tbl = table.output_table_name(defn.name)

    # Quote every identifier. Label fields are aliased ``__label_<name>`` so they
    # can't collide with an output column of the same name; they're re-nested into
    # ``_labels`` in the response below.
    label_select = ", ".join(
        f'{table._ident(lf, "label field")} AS "__label_{lf}"' for lf in label_fields
    )
    select_clause = "o.*" + (", " + label_select if label_select else "")
    sql = (
        f"SELECT {select_clause} "
        f"FROM {table._ident(tbl, 'output table')} AS o "
        f"LEFT JOIN {table._ident(src_table, 'source table')} AS s "
        f"ON s.{table._ident(src_pk, 'source pk')} = o.{table._ident(entity_col, 'entity column')} "
        f"ORDER BY o.generated_at DESC LIMIT :lim"
    )
    try:
        rows = await db.execute(text(sql), {"lim": min(limit, 1000)})
    except ProgrammingError:
        # Dynamic definition that has never run has no table yet.
        return {"label_fields": label_fields, "rows": []}

    out: list[dict[str, Any]] = []
    for mapping in rows.mappings().all():
        row = dict(mapping)
        labels = {lf: row.pop(f"__label_{lf}", None) for lf in label_fields}
        out.append({**row, "_labels": labels})
    return {"label_fields": label_fields, "rows": out}
