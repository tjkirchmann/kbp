"""Temporal Schedule that drives ``EspnSeederWorkflow``.

Replaces the former Procrastinate ``espn_poll`` cron. The seeder is a coarse tick
(every minute) that spawns/refreshes the per-game pollers; the fast polling itself
lives in the per-game ``EspnGameWorkflow``s, so this schedule stays cheap.

``ensure_espn_seeder_schedule`` is idempotent (create-or-update) and is invoked on
worker boot, so the schedule is declared in code and self-heals.

Overlap policy is SKIP: seeder ticks never stack — a slow tick is simply dropped,
and the next minute's tick re-derives live games from scratch anyway.
"""
import logging

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
from app.temporal.espn.seeder_workflow import EspnSeederWorkflow

logger = logging.getLogger(__name__)

SCHEDULE_ID = "espn-seeder"
WORKFLOW_ID = "espn-seeder"  # fixed → SKIP overlap dedups concurrent ticks
CRON = "* * * * *"  # every minute — coarse tick; per-game workflows poll fast


def _build_schedule() -> Schedule:
    return Schedule(
        action=ScheduleActionStartWorkflow(
            EspnSeederWorkflow.run,
            id=WORKFLOW_ID,
            task_queue=settings.temporal_task_queue,
        ),
        spec=ScheduleSpec(cron_expressions=[CRON]),
        policy=SchedulePolicy(overlap=ScheduleOverlapPolicy.SKIP),
    )


async def ensure_espn_seeder_schedule(client: Client) -> None:
    """Create the seeder schedule, or update it if it already exists."""
    schedule = _build_schedule()
    try:
        await client.create_schedule(SCHEDULE_ID, schedule)
        logger.info("Created Temporal schedule %r (cron=%r)", SCHEDULE_ID, CRON)
    except (ScheduleAlreadyRunningError, RPCError) as err:
        if isinstance(err, RPCError) and err.status != RPCStatusCode.ALREADY_EXISTS:
            raise
        handle = client.get_schedule_handle(SCHEDULE_ID)

        async def _update(_input: ScheduleUpdateInput) -> ScheduleUpdate:
            return ScheduleUpdate(schedule=schedule)

        await handle.update(_update)
        logger.info("Updated Temporal schedule %r (cron=%r)", SCHEDULE_ID, CRON)
