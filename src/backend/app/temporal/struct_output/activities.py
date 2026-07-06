"""Activities for structured-output jobs (run outside the workflow sandbox).

Two activities cover any definition (static or dynamic — they only speak the
``BaseDefinition`` seam, resolved by name via the combined resolver):
  * ``resolve_targets(name, overwrite)`` — return the entity ids to process.
    Populate-only (overwrite=False) skips ids already present; overwrite returns
    every in-scope source id.
  * ``generate_and_upsert(name, entity_id, run_id)`` — fetch the source row, run
    the LLM via the runner, upsert one output row. Idempotent (upsert keyed on
    entity id), so retries and re-runs converge.

Each opens its own ``TaskSessionLocal`` session (NullPool — safe for background).
A dynamic definition lazily ensures its data table on the first storage op
(``existing_entity_ids``/``upsert``); a static definition's table is a real
migration, so it always exists.
"""

import logging
from dataclasses import dataclass

from temporalio import activity

from app.core.database import TaskSessionLocal as SessionLocal
from app.services.struct_output.base import BaseDefinition, get_definition
from app.services.struct_output.runner import generate

logger = logging.getLogger(__name__)


@dataclass
class ResolveResult:
    name: str
    entity_ids: list[int]
    total_in_scope: int
    overwrite: bool


async def _load_or_raise(db, name: str) -> BaseDefinition:
    defn = await get_definition(db, name)
    if defn is None:
        raise ValueError(f"struct-output definition not found: {name!r}")
    return defn


@activity.defn
async def resolve_targets(name: str, overwrite: bool) -> ResolveResult:
    async with SessionLocal() as db:
        defn = await _load_or_raise(db, name)
        all_ids = await defn.fetch_source_ids(db)
        if overwrite:
            targets = list(all_ids)
        else:
            done = await defn.existing_entity_ids(db)
            targets = [i for i in all_ids if i not in done]
    logger.info(
        "struct_output.resolve_targets name=%s overwrite=%s -> %d/%d",
        name,
        overwrite,
        len(targets),
        len(all_ids),
    )
    return ResolveResult(
        name=name, entity_ids=targets, total_in_scope=len(all_ids), overwrite=overwrite
    )


@activity.defn
async def generate_and_upsert(name: str, entity_id: int, run_id: str) -> dict:
    async with SessionLocal() as db:
        defn = await _load_or_raise(db, name)
        entity = await defn.fetch_source_row(db, entity_id)
        if entity is None:
            raise ValueError(f"{name}: source entity {entity_id} not found")
        activity.heartbeat(f"generating {name} for {entity_id}")
        output, model_name = await generate(defn, entity)
        await defn.upsert(db, entity_id, output, model=model_name, run_id=run_id)
    return {"entity_id": entity_id, "model": model_name}
