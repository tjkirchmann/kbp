"""``EspnSeederWorkflow`` — the coarse tick that spawns per-game pollers.

Driven by a Temporal Schedule (every ~1 min). Each run:
  1. seeds stub espn_games rows for new pool games,
  2. finds the games that should be polling now (the old ``_run_poll`` selection),
  3. starts an ``EspnGameWorkflow`` per game as an **abandoned child** with the
     fixed id ``espn:{id}`` — already-running games are skipped (the duplicate
     start raises ``WorkflowAlreadyStartedError``, which we swallow), so the seeder
     is safe to re-run every tick,
  4. prunes the event log.

The seeder is cheap and short-lived; the per-game workflows do the actual fast
polling and outlive any single seeder run (``ParentClosePolicy.ABANDON``).
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import WorkflowAlreadyStartedError

with workflow.unsafe.imports_passed_through():
    from app.temporal.espn.activities import (
        find_live_game_ids,
        get_espn_poll_task_queue,
        prune_event_log,
        seed_missing_games,
    )
    from app.temporal.espn.game_workflow import EspnGameWorkflow

_QUICK_TIMEOUT = timedelta(seconds=30)
_QUICK_RETRY = RetryPolicy(maximum_attempts=3)


def _game_workflow_id(espn_game_id: int) -> str:
    return f"espn:{espn_game_id}"


@workflow.defn
class EspnSeederWorkflow:
    @workflow.run
    async def run(self) -> dict:
        await workflow.execute_activity(
            seed_missing_games,
            start_to_close_timeout=_QUICK_TIMEOUT,
            retry_policy=_QUICK_RETRY,
        )
        poll_queue = await workflow.execute_activity(
            get_espn_poll_task_queue,
            start_to_close_timeout=_QUICK_TIMEOUT,
            retry_policy=_QUICK_RETRY,
        )
        live_ids = await workflow.execute_activity(
            find_live_game_ids,
            start_to_close_timeout=_QUICK_TIMEOUT,
            retry_policy=_QUICK_RETRY,
        )

        started, already_running = 0, 0
        for espn_game_id in live_ids:
            try:
                await workflow.start_child_workflow(
                    EspnGameWorkflow.run,
                    args=[espn_game_id, poll_queue],
                    id=_game_workflow_id(espn_game_id),
                    parent_close_policy=workflow.ParentClosePolicy.ABANDON,
                )
                started += 1
            except WorkflowAlreadyStartedError:
                # This game already has a live poller — leave it running.
                already_running += 1

        await workflow.execute_activity(
            prune_event_log,
            start_to_close_timeout=_QUICK_TIMEOUT,
            retry_policy=_QUICK_RETRY,
        )

        summary = {
            "live_games": len(live_ids),
            "started": started,
            "already_running": already_running,
        }
        workflow.logger.info("espn seeder tick: %s", summary)
        return summary
