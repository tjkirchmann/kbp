"""Temporal Schedules for structured-output definitions.

Each scheduled definition (static or dynamic) with a ``cron`` gets a Temporal
Schedule that runs its ``StructOutputBatchWorkflow`` in *populate-only* mode
(scheduled runs never overwrite — overwrite is a manual/explicit action).
Schedules are reconciled at worker boot across both tiers via the combined
resolver (``reconcile_schedules``), the same self-registering pattern the CFBD
workflows use.

Manual control:
  * ``trigger_batch(client, name, overwrite)`` — start a one-off batch now
    (the "Run now" / "Refresh" action; overwrite=True re-generates everyone).
  * ``trigger_entity(client, name, entity_id)`` — generate one entity (the unit a
    future webhook starts).

CLI:  python -m app.temporal.struct_output.schedule <name> [--overwrite]
"""

import logging
from datetime import timedelta

from temporalio.client import (
    Client,
    Schedule,
    ScheduleActionStartWorkflow,
    ScheduleAlreadyRunningError,
    ScheduleOverlapPolicy,
    SchedulePolicy,
    ScheduleSpec,
    ScheduleUpdate,
    ScheduleUpdateInput,
)
from temporalio.service import RPCError, RPCStatusCode

from app.core.config import settings
from app.services.struct_output.base import BaseDefinition, all_scheduled
from app.temporal.struct_output.workflow import (
    BatchInput,
    StructOutputBatchWorkflow,
    StructOutputEntityWorkflow,
)

logger = logging.getLogger(__name__)


def schedule_id(name: str) -> str:
    return f"struct-output-{name}"


# Bound how far back a restarted Temporal server will backfill missed runs; one
# day comfortably covers a daily schedule without replaying ancient slots.
_CATCHUP_WINDOW = timedelta(days=1)


def _desired_schedule(defn: BaseDefinition) -> Schedule:
    return Schedule(
        action=ScheduleActionStartWorkflow(
            StructOutputBatchWorkflow.run,
            # Scheduled runs are populate-only — never clobber existing rows.
            BatchInput(name=defn.name, overwrite=False),
            id=schedule_id(defn.name),
            task_queue=settings.temporal_task_queue,
        ),
        spec=ScheduleSpec(cron_expressions=[defn.cron]),
        policy=SchedulePolicy(
            overlap=ScheduleOverlapPolicy.SKIP,
            catchup_window=_CATCHUP_WINDOW,
        ),
    )


async def ensure_schedule(client: Client, defn: BaseDefinition) -> None:
    sid = schedule_id(defn.name)
    schedule = _desired_schedule(defn)
    try:
        await client.create_schedule(sid, schedule)
        logger.info("Created struct-output schedule %s (cron %s)", sid, defn.cron)
    except (ScheduleAlreadyRunningError, RPCError) as err:
        # The SDK raises the typed ScheduleAlreadyRunningError when the schedule
        # exists; older/other paths surface a raw RPCError(ALREADY_EXISTS). Treat
        # both as "exists → update" so worker reboots are idempotent. Anything
        # else is a real error and propagates.
        if isinstance(err, RPCError) and err.status != RPCStatusCode.ALREADY_EXISTS:
            raise

        def _update(_input: ScheduleUpdateInput) -> ScheduleUpdate:
            return ScheduleUpdate(schedule=schedule)

        await client.get_schedule_handle(sid).update(_update)
        logger.info("Updated struct-output schedule %s (cron %s)", sid, defn.cron)


async def delete_schedule(client: Client, name: str) -> None:
    """Deregister a definition's schedule (used on soft/hard delete + disable)."""
    try:
        await client.get_schedule_handle(schedule_id(name)).delete()
        logger.info("Deleted struct-output schedule %s", schedule_id(name))
    except Exception:  # noqa: BLE001 — already gone is fine
        logger.info("No struct-output schedule to delete for %s", name)


async def reconcile_schedules(client: Client) -> None:
    """Boot-time reconcile: create/update schedules for all scheduled definitions.

    Covers both tiers via the combined resolver (``all_scheduled``): static
    definitions (code, cron set) ∪ dynamic definitions (registry, enabled). Static
    wins on name collisions. Runs in the worker, which already owns DB access.
    """
    from app.core.database import TaskSessionLocal as SessionLocal

    async with SessionLocal() as db:
        scheduled = await all_scheduled(db)
    for defn in scheduled:
        await ensure_schedule(client, defn)
    logger.info("Reconciled %d struct-output schedule(s)", len(scheduled))


async def trigger_batch(client: Client, name: str, overwrite: bool = False):
    """Start a one-off batch now (Run now / Refresh)."""
    handle = await client.start_workflow(
        StructOutputBatchWorkflow.run,
        BatchInput(name=name, overwrite=overwrite),
        id=f"struct-output-{name}-manual-{'overwrite' if overwrite else 'populate'}",
        task_queue=settings.temporal_task_queue,
    )
    logger.info("Triggered struct-output batch %s (overwrite=%s)", name, overwrite)
    return handle


async def trigger_entity(client: Client, name: str, entity_id: int):
    """Start a single-entity run now (the unit a webhook starts)."""
    handle = await client.start_workflow(
        StructOutputEntityWorkflow.run,
        args=[name, entity_id, f"manual-entity-{entity_id}"],
        id=f"struct-output-{name}-entity-{entity_id}",
        task_queue=settings.temporal_task_queue,
    )
    logger.info("Triggered struct-output entity %s/%s", name, entity_id)
    return handle


async def _main() -> None:
    """`python -m app.temporal.struct_output.schedule <name> [--overwrite]`."""
    import sys

    from app.core.temporal import get_temporal_client

    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    overwrite = "--overwrite" in sys.argv
    name = args[0] if args else "program_profile"

    client = await get_temporal_client()
    handle = await trigger_batch(client, name, overwrite=overwrite)
    result = await handle.result()
    print(f"struct-output batch {name} result: {result}")


if __name__ == "__main__":
    import asyncio

    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main())
