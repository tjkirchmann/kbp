import asyncio
import logging
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.celery_app import celery_app
from app.core.database import TaskSessionLocal as SessionLocal
from app.models.cfbd import CfbdTeam
from app.services.cfbd import fetch_teams

logger = logging.getLogger(__name__)

# 12 columns in cfbd_teams; asyncpg limit is 32767 params per statement
_BATCH_SIZE = 32767 // 12  # ~2730; teams API returns ~900 so one batch always suffices


def _api_to_row(t: dict) -> dict:
    return {
        "id": t["id"],
        "school": t.get("school") or "",
        "mascot": t.get("mascot") or None,
        "abbreviation": t.get("abbreviation") or None,
        "color": t.get("color") or None,
        "alt_color": t.get("altColor") or None,  # CFBD API uses camelCase
        "logos": t.get("logos") or None,
        "conference": t.get("conference") or None,
        "division": t.get("division") or None,
        "classification": t.get("classification") or None,
        "twitter": t.get("twitter") or None,
        "last_synced_at": datetime.utcnow(),
    }


async def _run_sync() -> int:
    teams = await fetch_teams()
    rows = [_api_to_row(t) for t in teams if t.get("id")]
    if not rows:
        return 0

    update_keys = [c for c in rows[0] if c != "id"]
    async with SessionLocal() as db:
        for i in range(0, len(rows), _BATCH_SIZE):
            batch = rows[i : i + _BATCH_SIZE]
            stmt = pg_insert(CfbdTeam).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={c: stmt.excluded[c] for c in update_keys},
            )
            await db.execute(stmt)
        await db.commit()
    return len(rows)


@celery_app.task(
    name="app.tasks.cfbd_teams.sync_cfbd_teams",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def sync_cfbd_teams(self):
    logger.info("Starting CFBD teams sync")
    try:
        count = asyncio.run(_run_sync())
        logger.info("CFBD teams sync complete: %d teams upserted", count)
        return {"synced": count}
    except Exception as exc:
        logger.exception("CFBD teams sync failed: %s", exc)
        raise self.retry(exc=exc)
