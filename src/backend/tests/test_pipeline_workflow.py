"""Behavioral tests for PipelineRunWorkflow (activities mocked).

Verifies the level-parallel Kahn orchestration: dependency order across waves,
independent branches sharing a wave, fail-fast finalization, and the terminal
finalize_run status in both outcomes. The real activities are DB/S3-bound and
are exercised end-to-end against the dev stack instead.
"""

import uuid

from temporalio import activity
from temporalio.client import WorkflowFailureError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from app.temporal.pipeline.workflow import PipelineRunWorkflow

TASK_QUEUE = "test-pipeline"

# Diamond: src → (left, right) → join
_DIAMOND = {
    "src": [],
    "left": [["src", "out", "in"]],
    "right": [["src", "out", "in"]],
    "join": [["left", "out", "a"], ["right", "out", "b"]],
}


async def test_diamond_executes_in_dependency_waves():
    wave: list[str] = []

    @activity.defn(name="prepare_run")
    async def prepare_run(run_id: int) -> dict:
        return {"deps": _DIAMOND, "media_task_queue": TASK_QUEUE}

    @activity.defn(name="run_node")
    async def run_node(run_id: int, node_id: str) -> None:
        wave.append(node_id)

    @activity.defn(name="finalize_run")
    async def finalize_run(run_id: int, status: str, error: str | None) -> None:
        pass

    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[PipelineRunWorkflow],
            activities=[prepare_run, run_node, finalize_run],
        ):
            await env.client.execute_workflow(
                PipelineRunWorkflow.run,
                1,
                id=f"pipe-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )

    # Wave boundaries aren't directly observable through a flat list, but
    # dependency order is: src strictly first, join strictly last, and the
    # middle wave holds both branches in either order.
    assert wave[0] == "src"
    assert wave[-1] == "join"
    assert set(wave[1:3]) == {"left", "right"}


async def test_failed_node_fails_run_and_finalizes_failed():
    finalized: list[tuple[str, str | None]] = []

    @activity.defn(name="prepare_run")
    async def prepare_run(run_id: int) -> dict:
        return {"deps": _DIAMOND, "media_task_queue": TASK_QUEUE}

    @activity.defn(name="run_node")
    async def run_node(run_id: int, node_id: str) -> None:
        if node_id == "left":
            raise RuntimeError("left exploded")

    @activity.defn(name="finalize_run")
    async def finalize_run(run_id: int, status: str, error: str | None) -> None:
        finalized.append((status, error))

    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[PipelineRunWorkflow],
            activities=[prepare_run, run_node, finalize_run],
        ):
            try:
                await env.client.execute_workflow(
                    PipelineRunWorkflow.run,
                    1,
                    id=f"pipe-{uuid.uuid4()}",
                    task_queue=TASK_QUEUE,
                )
                raise AssertionError("workflow should have failed")
            except WorkflowFailureError:
                pass

    assert len(finalized) == 1
    status, error = finalized[0]
    assert status == "failed"
    assert "left exploded" in (error or "")


async def test_success_finalizes_succeeded():
    finalized: list[tuple[str, str | None]] = []

    @activity.defn(name="prepare_run")
    async def prepare_run(run_id: int) -> dict:
        return {"deps": {"only": []}, "media_task_queue": TASK_QUEUE}

    @activity.defn(name="run_node")
    async def run_node(run_id: int, node_id: str) -> None:
        pass

    @activity.defn(name="finalize_run")
    async def finalize_run(run_id: int, status: str, error: str | None) -> None:
        finalized.append((status, error))

    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[PipelineRunWorkflow],
            activities=[prepare_run, run_node, finalize_run],
        ):
            await env.client.execute_workflow(
                PipelineRunWorkflow.run,
                1,
                id=f"pipe-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )

    assert finalized == [("succeeded", None)]
