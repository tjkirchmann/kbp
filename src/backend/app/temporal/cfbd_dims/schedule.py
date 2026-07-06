"""The nightly Temporal Schedule that drives ``CfbdDimsWorkflow``.

Replaces the former DB-driven cron (admin_notify_config) for this job. The
Schedule is the native Temporal analogue of the old Procrastinate knobs:

  old cron "0 3 * * *"      -> ScheduleSpec(cron_expressions=["0 3 * * *"])
  queueing_lock="cfbd_dims" -> ScheduleOverlapPolicy.SKIP (no overlapping runs)
  run_catchup flag          -> catchup_window (bounded backfill after downtime)

``ensure_schedule`` is idempotent (create, else update) and is called by the
worker at startup, so deploying the worker reconciles the schedule — mirroring
how the Procrastinate worker reconciles crons on boot.
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
from app.temporal.cfbd_dims.workflow import CfbdDimsWorkflow

logger = logging.getLogger(__name__)

SCHEDULE_ID = "cfbd-dims"
WORKFLOW_ID = "cfbd-dims"
CRON = "0 3 * * *"  # nightly 03:00 UTC — the former cfbd_dims cron

# Bound how far back a restarted Temporal server will backfill missed runs; one
# day comfortably covers a daily schedule without replaying ancient slots.
_CATCHUP_WINDOW = timedelta(days=1)


def _desired_schedule() -> Schedule:
    return Schedule(
        action=ScheduleActionStartWorkflow(
            CfbdDimsWorkflow.run,
            id=WORKFLOW_ID,
            task_queue=settings.temporal_task_queue,
        ),
        spec=ScheduleSpec(cron_expressions=[CRON]),
        policy=SchedulePolicy(
            overlap=ScheduleOverlapPolicy.SKIP,
            catchup_window=_CATCHUP_WINDOW,
        ),
    )


async def ensure_schedule(client: Client) -> None:
    """Create the nightly schedule, or update it in place if it already exists."""
    schedule = _desired_schedule()
    try:
        await client.create_schedule(SCHEDULE_ID, schedule)
        logger.info("Created Temporal schedule %s (cron %s)", SCHEDULE_ID, CRON)
    except (ScheduleAlreadyRunningError, RPCError) as err:
        # The SDK raises the typed ScheduleAlreadyRunningError when the schedule
        # exists; older/other paths surface a raw RPCError(ALREADY_EXISTS). Treat
        # both as "exists → update" so worker reboots are idempotent. Anything
        # else is a real error and propagates.
        if isinstance(err, RPCError) and err.status != RPCStatusCode.ALREADY_EXISTS:
            raise

        def _update(_input: ScheduleUpdateInput) -> ScheduleUpdate:
            return ScheduleUpdate(schedule=schedule)

        await client.get_schedule_handle(SCHEDULE_ID).update(_update)
        logger.info(
            "Updated existing Temporal schedule %s (cron %s)", SCHEDULE_ID, CRON
        )


async def trigger_now(client: Client) -> None:
    """Fire an immediate run of the schedule — the Temporal-native 'Run now'."""
    await client.get_schedule_handle(SCHEDULE_ID).trigger(
        overlap=ScheduleOverlapPolicy.ALLOW_ALL
    )
    logger.info("Triggered an immediate run of schedule %s", SCHEDULE_ID)


async def _main() -> None:
    """`python -m app.temporal.cfbd_dims.schedule` → ensure + trigger a run now."""
    from app.core.temporal import get_temporal_client

    client = await get_temporal_client()
    await ensure_schedule(client)
    await trigger_now(client)


if __name__ == "__main__":
    import asyncio

    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main())
