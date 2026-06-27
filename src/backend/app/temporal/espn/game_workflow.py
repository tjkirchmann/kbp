"""``EspnGameWorkflow`` — one long-running workflow per live game.

Polls a single game on an interval, fires start/halftime/final notifications (in
the activity, on state transitions), and exits when the game reaches ``post`` (or
a stale pre-game times out). The fixed id ``espn:{espn_game_id}`` makes the run a
durable entity: the seeder re-runs every tick but reusing the same id dedups, so a
game never has two pollers.

Determinism: the loop body is just "call activity → sleep" with no wall-clock or
I/O. To keep workflow history bounded over a multi-hour game, it
**continues-as-new** after ``_MAX_POLLS_PER_RUN`` iterations — the standard entity
pattern for an unbounded loop.

Rate limiting is the queue's job: ``poll_espn_game`` runs on the rate-limited espn
task queue, so per-game cadence here only sets the *desired* polling interval; the
server throttles the aggregate request rate across all game workflows.
"""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from app.temporal.espn.activities import PollResult, poll_espn_game

# Desired cadence per game. A live ("in") game polls fast; a pre-game waiting for
# kickoff polls slowly until it flips to "in".
_LIVE_INTERVAL = timedelta(seconds=20)
_PRE_INTERVAL = timedelta(minutes=2)

# Bound workflow history: continue-as-new after this many polls. ~180 polls at the
# 20s live cadence ≈ one hour of history per run.
_MAX_POLLS_PER_RUN = 180

# retry=0 in the old task meant "swallow transient poll errors". Here the activity
# itself catches fetch errors and returns non-terminal, so a single attempt is
# enough; a genuinely failed activity (e.g. DB down) still gets a couple retries.
_POLL_RETRY = RetryPolicy(maximum_attempts=3)
_POLL_TIMEOUT = timedelta(seconds=30)


def _interval_for(state: str | None) -> timedelta:
    return _LIVE_INTERVAL if state == "in" else _PRE_INTERVAL


@workflow.defn
class EspnGameWorkflow:
    @workflow.run
    async def run(
        self, espn_game_id: int, poll_task_queue: str, polls_so_far: int = 0
    ) -> str:
        """Poll until the game is terminal, then return its final state.

        ``poll_task_queue`` is the rate-limited espn queue the poll activity runs
        on — passed in by the seeder (settings access is I/O, so it can't be read
        inside the deterministic workflow). ``polls_so_far`` carries the running
        count across continue-as-new so the history bound holds over the whole
        game, not just one run segment.
        """
        polls = polls_so_far
        while True:
            result: PollResult = await workflow.execute_activity(
                poll_espn_game,
                espn_game_id,
                task_queue=poll_task_queue,
                start_to_close_timeout=_POLL_TIMEOUT,
                retry_policy=_POLL_RETRY,
            )
            if result.terminal:
                workflow.logger.info(
                    "espn game %s reached %s — exiting", espn_game_id, result.status_state
                )
                return result.status_state or "post"

            # Wait out the polling interval before the next poll (or the next run).
            await workflow.sleep(_interval_for(result.status_state))

            polls += 1
            if polls >= _MAX_POLLS_PER_RUN:
                # Bound history: stop this run and start a fresh one, carrying the
                # poll count forward. continue_as_new raises to end the run, so any
                # code after it would be unreachable — keep it last in the loop.
                workflow.continue_as_new(args=[espn_game_id, poll_task_queue, polls])
