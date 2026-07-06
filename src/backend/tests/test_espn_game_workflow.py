"""Behavioral tests for EspnGameWorkflow (time-skipping, mocked poll activity).

These exercise the loop/exit/continue-as-new logic that structural validation
(py_compile + sandbox) can't catch — e.g. the continue_as_new ordering bug found
during the migration. No DB or HTTP: the poll activity is replaced by a stub whose
return sequence drives the workflow.
"""

import uuid

from temporalio import activity
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from app.temporal.espn import game_workflow as gw
from app.temporal.espn.activities import PollResult
from app.temporal.espn.game_workflow import EspnGameWorkflow

TASK_QUEUE = "test-espn"


def _make_poll_stub(results: list[PollResult]):
    """An activity named like poll_espn_game that yields `results` in order, then
    repeats the last one. Records how many times it was called."""
    calls = {"n": 0}

    @activity.defn(name="poll_espn_game")
    async def poll_stub(espn_game_id: int) -> PollResult:
        i = min(calls["n"], len(results) - 1)
        calls["n"] += 1
        return results[i]

    return poll_stub, calls


async def _run(poll_stub, **run_kwargs):
    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[EspnGameWorkflow],
            activities=[poll_stub],
        ):
            return await env.client.execute_workflow(
                EspnGameWorkflow.run,
                args=[1, TASK_QUEUE],  # espn_game_id, poll_task_queue
                id=f"espn-game-test-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
                **run_kwargs,
            )


async def test_exits_immediately_when_first_poll_is_terminal():
    """A game already post on first poll exits with 'post' after one poll."""
    poll_stub, calls = _make_poll_stub(
        [PollResult(status_state="post", polled=False, terminal=True)]
    )
    result = await _run(poll_stub)
    assert result == "post"
    assert calls["n"] == 1


async def test_polls_through_states_then_exits_at_post():
    """pre → in → in → post: the workflow keeps polling until terminal, then exits."""
    poll_stub, calls = _make_poll_stub(
        [
            PollResult(status_state="pre", polled=True, terminal=False),
            PollResult(status_state="in", polled=True, terminal=False),
            PollResult(status_state="in", polled=True, terminal=False),
            PollResult(status_state="post", polled=True, terminal=True),
        ]
    )
    result = await _run(poll_stub)
    assert result == "post"
    # 4 polls: the first three non-terminal (each followed by a sleep), then the
    # terminal one that returns. Time-skipping fast-forwards the sleeps.
    assert calls["n"] == 4


async def test_continue_as_new_bounds_history(monkeypatch):
    """After _MAX_POLLS_PER_RUN non-terminal polls the run continues-as-new,
    carrying the poll count forward, and the game still eventually exits at post.

    Lower the bound to 3 so the test is fast; the game goes terminal on the 5th
    poll, which must happen in the *continued* run (proving the count carries)."""
    monkeypatch.setattr(gw, "_MAX_POLLS_PER_RUN", 3)
    poll_stub, calls = _make_poll_stub(
        [
            PollResult(status_state="in", polled=True, terminal=False),  # 1
            PollResult(status_state="in", polled=True, terminal=False),  # 2
            PollResult(status_state="in", polled=True, terminal=False),  # 3 → CAN
            PollResult(status_state="in", polled=True, terminal=False),  # 4 (new run)
            PollResult(status_state="post", polled=True, terminal=True),  # 5 → exit
        ]
    )
    result = await _run(poll_stub)
    assert result == "post"
    assert calls["n"] == 5
