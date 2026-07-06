"""Temporal Schedule for the frequent CFBD games run.

A Schedule is the modern replacement for both the deprecated workflow cron field
and Procrastinate's periodic/catch-up machinery. ``ensure_cfbd_games_schedule``
is idempotent (create-or-update) and is invoked on worker boot, so the schedule
is declared in code and self-heals — no manual ``tctl`` step.

Overlap policy is SKIP: if a run is still going when the next fires, the new one
is dropped rather than stacked — the same guarantee Procrastinate's
``queueing_lock`` gave the old task.
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
from app.temporal.cfbd_games.workflow import CfbdGamesWorkflow

logger = logging.getLogger(__name__)

SCHEDULE_ID = "cfbd-games-frequent"
WORKFLOW_ID = "cfbd-games"  # fixed → SKIP overlap dedups concurrent runs


def _build_schedule() -> Schedule:
    return Schedule(
        action=ScheduleActionStartWorkflow(
            CfbdGamesWorkflow.run,
            id=WORKFLOW_ID,
            task_queue=settings.temporal_task_queue,
        ),
        spec=ScheduleSpec(cron_expressions=[settings.temporal_cfbd_games_cron]),
        policy=SchedulePolicy(overlap=ScheduleOverlapPolicy.SKIP),
    )


async def ensure_cfbd_games_schedule(client: Client) -> None:
    """Create the schedule, or update it if it already exists (cron edits apply)."""
    schedule = _build_schedule()
    try:
        await client.create_schedule(SCHEDULE_ID, schedule)
        logger.info(
            "Created Temporal schedule %r (cron=%r)",
            SCHEDULE_ID,
            settings.temporal_cfbd_games_cron,
        )
    except (ScheduleAlreadyRunningError, RPCError) as err:
        # The SDK raises the typed ScheduleAlreadyRunningError when the schedule
        # exists; older/other paths surface a raw RPCError(ALREADY_EXISTS). Treat
        # both as "exists → update" so worker reboots are idempotent. Anything
        # else is a real error and propagates.
        if isinstance(err, RPCError) and err.status != RPCStatusCode.ALREADY_EXISTS:
            raise
        handle = client.get_schedule_handle(SCHEDULE_ID)

        async def _update(_input: ScheduleUpdateInput) -> ScheduleUpdate:
            return ScheduleUpdate(schedule=schedule)

        await handle.update(_update)
        logger.info(
            "Updated Temporal schedule %r (cron=%r)",
            SCHEDULE_ID,
            settings.temporal_cfbd_games_cron,
        )
