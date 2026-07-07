"""Temporal activities for CFBD dimension ingestion.

Activities run outside the workflow sandbox, so normal I/O is fine here: each
opens its own ``TaskSessionLocal`` session, fetches from CFBD, records a
content-hash snapshot per changed entity, and batch-upserts into the entity
table. Everything is idempotent (dedupe by primary key + ``ON CONFLICT`` upsert),
so periodic, manual, and retried runs all converge.

Two activities cover all six dimensions:
  * ``sync_flat_dim(entity_key)`` — the five single-PK dims (teams, conferences,
    venues, draft positions, draft teams), driven by ``DIM_SPECS``.
  * ``sync_coaches()`` — the two-table coach + coach-season case.

Row/hash mappers and the dimension registry live in
``app.services.sync.cfbd_dims_syncers``.
"""

import logging
from typing import Any

from temporalio import activity

from app.core.database import TaskSessionLocal as SessionLocal
from app.models.cfbd import CfbdCoach, CfbdCoachSeason
from app.services.sync.cfbd_dims_syncers import (
    DIM_SPECS,
    FLAT_DIM_KEYS,
    coach_hash,
    coach_id,
    coach_row,
    coach_season_row,
)
from app.services.sync.providers.cfbd import cfbd_provider
from app.services.sync.snapshots import record_snapshot
from app.services.sync.upsert import batch_upsert

logger = logging.getLogger(__name__)

# asyncpg/psycopg cap statements at 32767 bind params; keep batches under that.
_BATCH = lambda cols: 32767 // cols  # noqa: E731


@activity.defn
async def sync_flat_dim(entity_key: str) -> dict[str, Any]:
    """Fetch + snapshot + upsert one single-PK dimension.

    Rows are deduped by the spec's PK (last wins) so a single ``ON CONFLICT``
    statement never touches the same key twice. Returns
    ``{"entity", "processed", "changed"}``.
    """
    spec = DIM_SPECS[entity_key]
    items = await cfbd_provider.fetch(spec.endpoint)

    rows: dict[Any, dict] = {}
    changed = 0
    async with SessionLocal() as db:
        for it in items:
            row = spec.row_fn(it)
            key = row[spec.pk]
            if key is None or key == "":
                continue
            if await record_snapshot(
                db,
                entity_type=spec.entity_type,
                entity_id=str(key),
                payload=it,
                hash_fields=spec.hash_fn(it),
                source=cfbd_provider.name,
            ):
                changed += 1
            rows[key] = row
        values = list(rows.values())
        if values:
            await batch_upsert(
                db,
                spec.model,
                values,
                _BATCH(len(values[0])),
                index_elements=(spec.pk,),
            )
        await db.commit()

    result = {"entity": entity_key, "processed": len(rows), "changed": changed}
    logger.info("cfbd_dims sync_flat_dim: %s", result)
    return result


@activity.defn
async def sync_coaches() -> dict[str, Any]:
    """Fetch + snapshot + upsert coaches, then their seasons (child FK).

    Two tables in one activity so the parent rows are guaranteed present before
    the FK-bearing season rows. Returns coach + season counts.
    """
    coaches = await cfbd_provider.fetch("coaches")

    coach_rows: dict[str, dict] = {}
    season_rows: dict[tuple, dict] = {}
    changed = 0
    async with SessionLocal() as db:
        for c in coaches:
            cid = coach_id(c)
            if await record_snapshot(
                db,
                entity_type="cfbd_coach",
                entity_id=cid,
                payload=c,
                hash_fields=coach_hash(c),
                source=cfbd_provider.name,
            ):
                changed += 1
            coach_rows[cid] = coach_row(c, cid)
            for s in c.get("seasons") or []:
                school, year = s.get("school"), s.get("year")
                if school is None or year is None:
                    continue
                season_rows[(cid, school, year)] = coach_season_row(s, cid)

        coaches_v = list(coach_rows.values())
        if coaches_v:
            await batch_upsert(
                db,
                CfbdCoach,
                coaches_v,
                _BATCH(len(coaches_v[0])),
                index_elements=("coach_id",),
            )
        activity.heartbeat("coaches upserted; upserting seasons")
        seasons_v = list(season_rows.values())
        if seasons_v:
            await batch_upsert(
                db,
                CfbdCoachSeason,
                seasons_v,
                _BATCH(len(seasons_v[0])),
                index_elements=("coach_id", "school", "year"),
            )
        await db.commit()

    result = {
        "coaches": {"processed": len(coach_rows), "changed": changed},
        "coach_seasons": {"processed": len(season_rows)},
    }
    logger.info("cfbd_dims sync_coaches: %s", result)
    return result
