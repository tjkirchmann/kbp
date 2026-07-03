"""Structured-output admin routes (read-only, both tiers).

Lets admins list definitions across both tiers (static = code-tracked,
dynamic = registry row) and inspect a definition's generated rows. Each item is
tagged with its ``tier`` so the (future) admin UI can tell them apart. Build /
trigger / delete endpoints are deferred to a later phase; the trigger seam already
exists as ``app.temporal.struct_output.schedule.trigger_batch`` / ``trigger_entity``.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
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
) -> list[dict[str, Any]]:
    defn = await base.get_definition(db, name)
    if defn is None:
        raise HTTPException(status_code=404, detail=f"Unknown definition {name!r}")
    # Both tiers materialize a struct_output_{name} table, so a raw SELECT works
    # uniformly. A dynamic definition that has never run has no table yet → [].
    tbl = table.output_table_name(defn.name)
    try:
        rows = await db.execute(
            text(f'SELECT * FROM "{tbl}" ORDER BY generated_at DESC LIMIT :lim'),
            {"lim": min(limit, 1000)},
        )
    except ProgrammingError:
        # Table doesn't exist yet (dynamic definition that has never run).
        return []
    return [dict(r) for r in rows.mappings().all()]
