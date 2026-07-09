"""Friendly-name → Temporal trigger registry.

A single place mapping the sync names a human types (e.g. ``cfbd_games``) to how
that work is kicked off on Temporal. Used by the Discord bot's ``/sync`` command
(and reusable by a future admin endpoint),
``task.defer_async()`` path.

Each entry starts a fresh workflow run with a timestamped id so manual triggers
never collide with scheduled runs. Scheduled jobs (games/dims/facts) and run-only
jobs (plays) are triggered the same way here — start the workflow directly.
"""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from temporalio.client import Client

from app.core.config import settings
from app.temporal.cfbd_dims.workflow import CfbdDimsWorkflow
from app.temporal.cfbd_facts.workflows import CfbdFactsWorkflow
from app.temporal.cfbd_games.workflow import CfbdGamesWorkflow
from app.temporal.cfbd_plays.workflows import CfbdPlaysWorkflow
from app.temporal.espn.seeder_workflow import EspnSeederWorkflow


def _stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def _starter(workflow_run, prefix: str) -> Callable[[Client], Awaitable[str]]:
    """Build a trigger that starts ``workflow_run`` with a unique manual id and
    returns that workflow id."""

    async def _trigger(client: Client) -> str:
        wf_id = f"{prefix}-manual-{_stamp()}"
        await client.start_workflow(
            workflow_run,
            id=wf_id,
            task_queue=settings.temporal_task_queue,
        )
        return wf_id

    return _trigger


# Friendly name → trigger. Keys are the names a user types in /sync.
TRIGGERS: dict[str, Callable[[Client], Awaitable[str]]] = {
    "cfbd_games": _starter(CfbdGamesWorkflow.run, "cfbd-games"),
    "cfbd_dims": _starter(CfbdDimsWorkflow.run, "cfbd-dims"),
    "cfbd_facts": _starter(CfbdFactsWorkflow.run, "cfbd-facts"),
    "cfbd_plays": _starter(CfbdPlaysWorkflow.run, "cfbd-plays"),
    "espn": _starter(EspnSeederWorkflow.run, "espn-seeder"),
}

TRIGGER_NAMES = tuple(TRIGGERS)
