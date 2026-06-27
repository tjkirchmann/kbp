"""The CFBD games ingestion workflow.

Orchestration only — no I/O. Drives the single ``sync_games_season`` activity for
the current season. The year is derived from ``workflow.now()`` (the deterministic
clock — never ``datetime.now()`` inside workflow code) so replays stay
deterministic.

Durability: a worker crash mid-run resumes the activity rather than losing the
run; the activity is idempotent, so a partial run re-converges on retry.
"""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from app.temporal.cfbd_games.activities import sync_games_season

# Per-activity retry replaces the old whole-task retry=3: transient CFBD/DB
# errors back off and retry up to 4 attempts before failing the run.
_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=60),
    maximum_attempts=4,
)

_TIMEOUT = timedelta(minutes=10)


@workflow.defn
class CfbdGamesWorkflow:
    """Frequent refresh of the current-season CFBD games fact table."""

    @workflow.run
    async def run(self) -> dict:
        year = workflow.now().year
        result = await workflow.execute_activity(
            sync_games_season,
            year,
            start_to_close_timeout=_TIMEOUT,
            retry_policy=_RETRY,
        )
        workflow.logger.info("cfbd_games workflow complete: %s", result)
        return result
