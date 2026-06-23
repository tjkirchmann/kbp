"""@notify decorator: fire start/success/failure notifications around a task,
and optionally suppress restart catch-up runs.

Stacked directly above @app.task (so it wraps the task coroutine). Reads each
task's settings from admin_notify_config at run time, so toggling events in the
admin panel takes effect without redeploying. All notification work is isolated
in try/except — a notification failure can never break or fail the task itself.

Catch-up suppression: Procrastinate defers the last missed cron slot when a
worker restarts. If a task has run_catchup disabled and this invocation is a
stale catch-up (scheduled timestamp older than one cron interval), the wrapper
skips the task body entirely instead of running it.
"""

import functools
import logging
import time
from datetime import UTC, datetime

from app.core.database import TaskSessionLocal as SessionLocal
from app.services.notifications import notification_service
from app.services.notify_config import get_notify_config, resolve_delivery

logger = logging.getLogger(__name__)

# Extra slack beyond one cron interval before a run counts as a stale catch-up,
# so a run that merely starts a few seconds late is never mistaken for one.
_CATCHUP_GRACE_SECONDS = 30


def _cron_interval_seconds(task_name: str) -> float | None:
    """Seconds between consecutive fires of a periodic task, or None if not periodic."""
    from croniter import croniter

    from app.core.procrastinate import procrastinate_app

    procrastinate_app.perform_import_paths()
    for pt in procrastinate_app.periodic_registry.periodic_tasks.values():
        if pt.task.name == task_name:
            try:
                it = croniter(pt.cron, datetime.now(UTC))
                first = it.get_next(float)
                return it.get_next(float) - first
            except Exception:
                return None
    return None


def _is_stale_catchup(task_name: str, scheduled_timestamp: int | None) -> bool:
    """True if this run is a restart catch-up of an already-past cron slot."""
    if scheduled_timestamp is None:
        return False  # manual / run-only defer, never a catch-up
    interval = _cron_interval_seconds(task_name)
    if interval is None:
        return False
    return (time.time() - scheduled_timestamp) > (interval + _CATCHUP_GRACE_SECONDS)


async def _fire(task_name: str, event: str, payload: dict) -> None:
    try:
        async with SessionLocal() as db:
            cfg = await get_notify_config(db, task_name)
            if event not in cfg.events:
                return
            strategy, config = await resolve_delivery(db, cfg)
        await notification_service.notify(
            strategy=strategy,
            config=config,
            event=event,
            payload={
                "task_name": task_name,
                "event": event,
                "at": datetime.now(UTC).isoformat(),
                **payload,
            },
        )
    except Exception:
        logger.exception("notify hook failed (task=%s event=%s)", task_name, event)


async def _catchup_suppressed(task_name: str, kwargs: dict) -> bool:
    """Whether to skip this run as a suppressed restart catch-up."""
    try:
        if not _is_stale_catchup(task_name, kwargs.get("timestamp")):
            return False
        async with SessionLocal() as db:
            cfg = await get_notify_config(db, task_name)
        if cfg.run_catchup:
            return False
        logger.info(
            "Suppressing restart catch-up run of %s (run_catchup off)", task_name
        )
        return True
    except Exception:
        # On any error, don't suppress — running is safer than silently skipping.
        logger.exception("catch-up check failed (task=%s); running anyway", task_name)
        return False


def notify(task_name: str):
    """Wrap a task so it emits configured lifecycle notifications."""

    def deco(task_func):
        @functools.wraps(task_func)
        async def wrapper(*args, **kwargs):
            if await _catchup_suppressed(task_name, kwargs):
                return {"skipped": "catchup"}
            await _fire(task_name, "start", {})
            try:
                result = await task_func(*args, **kwargs)
            except Exception as exc:
                await _fire(
                    task_name, "failure", {"error": f"{type(exc).__name__}: {exc}"}
                )
                raise
            await _fire(
                task_name,
                "success",
                {"result": result if isinstance(result, dict) else {}},
            )
            return result

        return wrapper

    return deco
