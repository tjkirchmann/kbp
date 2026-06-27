"""Behavioral test for CfbdGamesWorkflow (single activity, mocked).

The games workflow is the simplest: derive the current year from workflow.now()
and run one sync activity for it. Verifies the year passed to the activity matches
the workflow clock and the activity result is returned verbatim.
"""
import uuid

from temporalio import activity
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from app.temporal.cfbd_games.workflow import CfbdGamesWorkflow

TASK_QUEUE = "test-cfbd-games"


async def test_runs_current_season_and_returns_summary():
    seen_years: list[int] = []

    @activity.defn(name="sync_games_season")
    async def sync_games_season(year: int) -> dict:
        seen_years.append(year)
        return {"processed": 5, "changed": 1, "year": year}

    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[CfbdGamesWorkflow],
            activities=[sync_games_season],
        ):
            # Read the env's clock year so the assertion isn't pinned to a real date.
            now = await env.get_current_time()
            result = await env.client.execute_workflow(
                CfbdGamesWorkflow.run,
                id=f"games-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )

    assert seen_years == [now.year]
    assert result == {"processed": 5, "changed": 1, "year": now.year}
