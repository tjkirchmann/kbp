"""Registry access: load/list definitions, fetch source entity rows.

Thin DB helpers over ``struct_output_definitions``. Soft-deleted rows
(``deleted_at`` set) are excluded from the active views.
"""

import re

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.struct_output import StructOutputDefinition

_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


async def get_definition(
    db: AsyncSession, name: str, *, include_deleted: bool = False
) -> StructOutputDefinition | None:
    defn = await db.get(StructOutputDefinition, name)
    if defn is None:
        return None
    if defn.deleted_at is not None and not include_deleted:
        return None
    return defn


async def list_active(db: AsyncSession) -> list[StructOutputDefinition]:
    rows = await db.execute(
        select(StructOutputDefinition)
        .where(StructOutputDefinition.deleted_at.is_(None))
        .order_by(StructOutputDefinition.name)
    )
    return list(rows.scalars().all())


async def list_scheduled(db: AsyncSession) -> list[StructOutputDefinition]:
    """Active + enabled definitions that carry a cron (drive Temporal Schedules)."""
    return [d for d in await list_active(db) if d.enabled and (d.cron or "").strip()]


async def fetch_source_ids(db: AsyncSession, defn: StructOutputDefinition) -> list[int]:
    """All source entity ids in scope (honoring source_filter)."""
    if not _IDENT.match(defn.source_table) or not _IDENT.match(defn.source_pk):
        raise ValueError("invalid source_table/source_pk on definition")
    sql = f'SELECT "{defn.source_pk}" FROM "{defn.source_table}"'
    if (defn.source_filter or "").strip():
        # Trusted admin/seed-authored boolean expression.
        sql += f" WHERE {defn.source_filter}"
    rows = await db.execute(text(sql))
    return [r[0] for r in rows.all()]


async def fetch_source_row(
    db: AsyncSession, defn: StructOutputDefinition, entity_id: int
) -> dict | None:
    """One source row as a dict of {label_field: value} plus the pk, for prompting."""
    if not _IDENT.match(defn.source_table) or not _IDENT.match(defn.source_pk):
        raise ValueError("invalid source_table/source_pk on definition")
    cols = [defn.source_pk, *defn.source_label_fields]
    for c in cols:
        if not _IDENT.match(c):
            raise ValueError(f"invalid label field {c!r}")
    col_sql = ", ".join(f'"{c}"' for c in cols)
    sql = text(
        f'SELECT {col_sql} FROM "{defn.source_table}" WHERE "{defn.source_pk}" = :eid'
    )
    row = (await db.execute(sql, {"eid": entity_id})).mappings().first()
    return dict(row) if row else None
