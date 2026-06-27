"""Structured-output admin routes (Phase 1: read-only views).

Lets admins list registry definitions and inspect a definition's generated rows.
Build/trigger/delete endpoints are deferred to later phases (see the plan); the
trigger seam already exists as ``app.temporal.struct_output.schedule.trigger_*``.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_admin
from app.core.database import get_db
from app.services.struct_output import registry, table

router = APIRouter(prefix="/admin/struct-output", dependencies=[Depends(require_admin)])


@router.get("/")
async def list_definitions(db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    defs = await registry.list_active(db)
    return [
        {
            "name": d.name,
            "source_table": d.source_table,
            "field_count": len(d.fields),
            "model": d.model,
            "cron": d.cron,
            "enabled": d.enabled,
            "locked": d.locked,
        }
        for d in defs
    ]


@router.get("/{name}")
async def get_definition(
    name: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    d = await registry.get_definition(db, name)
    if d is None:
        raise HTTPException(status_code=404, detail=f"Unknown definition {name!r}")
    return {
        "name": d.name,
        "source_table": d.source_table,
        "source_pk": d.source_pk,
        "source_filter": d.source_filter,
        "source_label_fields": d.source_label_fields,
        "fields": d.fields,
        "prompt_template": d.prompt_template,
        "model": d.model,
        "cron": d.cron,
        "enabled": d.enabled,
        "locked": d.locked,
    }


@router.get("/{name}/outputs")
async def list_outputs(
    name: str, limit: int = 200, db: AsyncSession = Depends(get_db)
) -> list[dict[str, Any]]:
    d = await registry.get_definition(db, name)
    if d is None:
        raise HTTPException(status_code=404, detail=f"Unknown definition {name!r}")
    tbl = table.output_table_name(d.name)
    try:
        rows = await db.execute(
            text(f'SELECT * FROM "{tbl}" ORDER BY generated_at DESC LIMIT :lim'),
            {"lim": min(limit, 1000)},
        )
    except Exception:
        # Table not created yet (definition never run).
        return []
    return [dict(r) for r in rows.mappings().all()]
