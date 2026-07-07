"""Temporal activity for CFBD games (fact table) ingestion.

Runs outside the workflow sandbox, so normal I/O is fine: opens its own
``TaskSessionLocal`` session, fetches the season's games from CFBD, records a
content-hash snapshot per changed game, and batch-upserts into ``cfbd_games``.
Idempotent (dedupe by primary key + ``ON CONFLICT`` upsert), so periodic,
manual, and retried runs all converge.

Row/hash mappers live in ``app.services.sync.cfbd_games_syncers``.
"""

import logging
from typing import Any

from temporalio import activity

from app.core.database import TaskSessionLocal as SessionLocal
from app.models.cfbd import CfbdGame
from app.services.sync.cfbd_games_syncers import (
    GAME_BATCH,
    game_hash_fields,
    game_row,
)
from app.services.sync.providers.cfbd import cfbd_provider
from app.services.sync.snapshots import record_snapshot
from app.services.sync.upsert import batch_upsert

logger = logging.getLogger(__name__)


@activity.defn
async def sync_games_season(year: int) -> dict[str, Any]:
    """Fetch, snapshot, and upsert one season's CFBD games."""
    games = [g for g in await cfbd_provider.fetch("games", year=year) if g.get("id")]
    if not games:
        return {"processed": 0, "changed": 0, "year": year}

    async with SessionLocal() as db:
        changed = 0
        for g in games:
            if await record_snapshot(
                db,
                entity_type="cfbd_game",
                entity_id=str(g["id"]),
                payload=g,
                hash_fields=game_hash_fields(g),
                source=cfbd_provider.name,
            ):
                changed += 1

        await batch_upsert(db, CfbdGame, [game_row(g, year) for g in games], GAME_BATCH)
        await db.commit()

    logger.info(
        "cfbd_games sync: year=%d processed=%d changed=%d", year, len(games), changed
    )
    return {"processed": len(games), "changed": changed, "year": year}
