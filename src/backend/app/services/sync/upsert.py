"""Shared batch upsert for sync tasks.

Postgres/asyncpg cap a statement at 32767 bind params, so rows are chunked into
batches of `batch_size` and upserted with ON CONFLICT DO UPDATE. The first row's
keys define the column set; every column except the conflict target(s) is updated.
"""

from collections.abc import Sequence
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession


async def batch_upsert(
    db: AsyncSession,
    model: Any,
    rows: list[dict],
    batch_size: int,
    *,
    index_elements: Sequence[str] = ("id",),
) -> None:
    """Upsert `rows` into `model` in chunks, keyed on `index_elements`."""
    if not rows:
        return
    conflict = set(index_elements)
    update_keys = [c for c in rows[0] if c not in conflict]
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        stmt = pg_insert(model).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=list(index_elements),
            set_={c: stmt.excluded[c] for c in update_keys},
        )
        await db.execute(stmt)
