"""Reconcile the Procrastinate periodic registry against DB-configured crons.

The DB (admin_notify_config.cron) is the sole source of schedules — the
@app.periodic decorators were removed. The worker process calls sync_registry()
at startup, on a poll interval, and on a NOTIFY, mutating the in-memory registry
so schedule edits take effect without a restart.

Because PeriodicTask.croniter is recomputed from the mutable .cron field every
deferrer tick, updating .cron in place reschedules all future fires from now.
Periodic jobs are deferred just-in-time (never pre-queued), so no job cleanup is
needed when a schedule changes or a task is paused.
"""
import logging

from croniter import croniter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_notify_config import AdminNotifyConfig

logger = logging.getLogger(__name__)

CRON_CHANNEL = "cron_changed"


async def load_crons(db: AsyncSession) -> dict[str, str]:
    """{task_name: cron} for tasks with a non-blank, valid cron. Blank = paused."""
    rows = await db.execute(
        select(AdminNotifyConfig.task_name, AdminNotifyConfig.cron)
        .where(AdminNotifyConfig.cron.is_not(None))
    )
    out: dict[str, str] = {}
    for task_name, cron in rows.all():
        cron = (cron or "").strip()
        if not cron:
            continue  # explicit pause
        try:
            croniter(cron)
        except Exception:
            logger.warning("Skipping invalid cron for %s: %r", task_name, cron)
            continue
        out[task_name] = cron
    return out


def sync_registry(app, desired: dict[str, str]) -> None:
    """Reconcile app.periodic_registry against `desired` {task_name: cron}.

    periodic_id is the task name (one schedule per task). Adds newly-scheduled
    tasks, updates changed crons in place, and removes paused/cleared ones.
    """
    app.perform_import_paths()  # ensure task modules are imported (populates app.tasks)
    registry = app.periodic_registry
    periodic = registry.periodic_tasks  # dict[(task_name, periodic_id), PeriodicTask]

    # Add / update. PeriodicTask is frozen, so a cron change is a delete + re-register
    # (cheap; the deferrer reads the registry fresh each tick).
    for task_name, cron in desired.items():
        task = app.tasks.get(task_name)
        if task is None:
            logger.warning("Cron set for unknown task %s; skipping", task_name)
            continue
        key = (task_name, task_name)
        existing = periodic.get(key)
        if existing is not None and existing.cron == cron:
            continue  # unchanged
        if existing is not None:
            del periodic[key]  # frozen — can't mutate; replace it
        registry.register_task(
            task=task, cron=cron, periodic_id=task_name, configure_kwargs={},
        )
        logger.info(
            "%s periodic task %s (cron %s)",
            "Updated" if existing is not None else "Registered", task_name, cron,
        )

    # Remove anything no longer desired (paused or cleared).
    for key in list(periodic.keys()):
        task_name = key[0]
        if task_name not in desired:
            del periodic[key]
            logger.info("Unscheduled periodic task %s (paused/cleared)", task_name)


async def resync(app, db: AsyncSession) -> None:
    """Load desired crons from the DB and reconcile the registry."""
    sync_registry(app, await load_crons(db))
