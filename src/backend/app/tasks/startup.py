"""Config-driven startup defers.

On boot, defer every task whose admin_notify_config has run_on_startup=true,
optionally skipping ones that succeeded recently (startup_stale_seconds). This
replaces the single hardcoded espn_seed defer that used to live in main.py.

Independent of cron and of Procrastinate's periodic catch-up: this is about
guaranteeing data is present when the app comes up, regardless of schedule.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import TaskSessionLocal as SessionLocal
from app.services.notify_config import get_notify_config

logger = logging.getLogger(__name__)

_LAST_SUCCESS_SQL = text(
    """
    SELECT max(e.at)
    FROM procrastinate_events e
    JOIN procrastinate_jobs j ON j.id = e.job_id
    WHERE j.task_name = :task AND e.type = 'succeeded'
    """
)


async def _last_success_at(db: AsyncSession, task_name: str) -> datetime | None:
    return await db.scalar(_LAST_SUCCESS_SQL, {"task": task_name})


async def defer_startup_tasks(app) -> None:
    """Defer all tasks flagged run_on_startup, honoring staleness windows."""
    from procrastinate.exceptions import AlreadyEnqueued

    app.perform_import_paths()
    tasks = {
        name: task
        for name, task in app.tasks.items()
        if not name.startswith(("builtin:", "procrastinate."))
    }

    for name, task in tasks.items():
        async with SessionLocal() as db:
            cfg = await get_notify_config(db, name)
            if not cfg.run_on_startup:
                continue
            # A queueing_lock is what makes repeated boot defers (crash loops)
            # collapse to a single job; without it we'd risk stacking dupes.
            if task.queueing_lock is None:
                logger.warning(
                    "Skipping startup defer of %s: run_on_startup set but no queueing_lock",
                    name,
                )
                continue
            if cfg.startup_stale_seconds is not None:
                last = await _last_success_at(db, name)
                if last is not None:
                    if last.tzinfo is None:
                        last = last.replace(tzinfo=UTC)
                    age = (datetime.now(UTC) - last).total_seconds()
                    if age < cfg.startup_stale_seconds:
                        logger.info(
                            "Startup defer of %s skipped: last success %.0fs ago < %ds threshold",
                            name,
                            age,
                            cfg.startup_stale_seconds,
                        )
                        continue

        try:
            await task.defer_async()
            logger.info("Startup-deferred %s", name)
        except AlreadyEnqueued:
            logger.info("Startup defer of %s skipped: already enqueued", name)
