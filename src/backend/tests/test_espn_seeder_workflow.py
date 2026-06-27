"""Behavioral tests for EspnSeederWorkflow (mocked activities + real child workflow).

Verifies the seeder spawns one EspnGameWorkflow per live game with the fixed id
``espn:{id}``, and that a second tick over the same still-running game dedups
(WorkflowAlreadyStartedError → counted as already_running, not duplicated).
"""
import uuid

from temporalio import activity
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from app.temporal.espn.activities import PollResult
from app.temporal.espn.game_workflow import EspnGameWorkflow
from app.temporal.espn.seeder_workflow import EspnSeederWorkflow

TASK_QUEUE = "test-espn-seeder"


def _seeder_activities(live_ids: list[int]):
    """Stubs for the seeder's four activities, named to match the real ones."""

    @activity.defn(name="seed_missing_games")
    async def seed_missing_games() -> int:
        return 0

    @activity.defn(name="get_espn_poll_task_queue")
    async def get_espn_poll_task_queue() -> str:
        return TASK_QUEUE

    @activity.defn(name="find_live_game_ids")
    async def find_live_game_ids() -> list[int]:
        return live_ids

    @activity.defn(name="prune_event_log")
    async def prune_event_log() -> None:
        return None

    return [seed_missing_games, get_espn_poll_task_queue, find_live_game_ids, prune_event_log]


@activity.defn(name="poll_espn_game")
async def _poll_never_terminal(espn_game_id: int) -> PollResult:
    """Game stays live forever, so the child workflow keeps running — which is what
    lets the second seeder tick observe it as already-running."""
    return PollResult(status_state="in", polled=True, terminal=False)


async def test_seeder_starts_one_child_per_live_game_and_dedups():
    async with await WorkflowEnvironment.start_time_skipping() as env:
        activities = _seeder_activities([10, 20])
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[EspnSeederWorkflow, EspnGameWorkflow],
            activities=[*activities, _poll_never_terminal],
        ):
            # First tick: both games are new → 2 started, 0 already-running.
            first = await env.client.execute_workflow(
                EspnSeederWorkflow.run,
                id=f"seeder-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )
            assert first["live_games"] == 2
            assert first["started"] == 2
            assert first["already_running"] == 0

            # The two game workflows are now running under fixed ids espn:10 / espn:20.
            for gid in (10, 20):
                handle = env.client.get_workflow_handle(f"espn:{gid}")
                desc = await handle.describe()
                assert desc.status.name == "RUNNING"

            # Second tick over the same still-running games: both dedup.
            second = await env.client.execute_workflow(
                EspnSeederWorkflow.run,
                id=f"seeder-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )
            assert second["live_games"] == 2
            assert second["started"] == 0
            assert second["already_running"] == 2


async def test_seeder_no_live_games_starts_nothing():
    async with await WorkflowEnvironment.start_time_skipping() as env:
        activities = _seeder_activities([])
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[EspnSeederWorkflow, EspnGameWorkflow],
            activities=[*activities, _poll_never_terminal],
        ):
            result = await env.client.execute_workflow(
                EspnSeederWorkflow.run,
                id=f"seeder-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )
            assert result == {"live_games": 0, "started": 0, "already_running": 0}
