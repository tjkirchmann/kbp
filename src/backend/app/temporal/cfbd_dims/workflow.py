"""The CFBD dimension ingestion workflow.

Orchestration only — no I/O. Fans out one activity per dimension entity and runs
them concurrently, each with its own retry policy and timeout, so a transient
CFBD failure on one entity (e.g. coaches) retries in isolation without re-fetching
the others. The workflow re-assembles the per-activity results into the same
aggregate shape the former Procrastinate task returned.

Durability: the workflow remembers which activities have completed, so a worker
crash mid-run resumes only the unfinished ones rather than redoing everything.
"""
import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from app.temporal.cfbd_dims.activities import (
        FLAT_DIM_KEYS,
        sync_coaches,
        sync_flat_dim,
    )

# Per-activity retry replaces the old whole-task retry=3: transient CFBD/DB
# errors back off and retry up to 4 attempts before failing the run.
_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=60),
    maximum_attempts=4,
)

# Flat dims are small + fast; coaches is the largest payload and gets more room.
_FLAT_TIMEOUT = timedelta(minutes=5)
_COACHES_TIMEOUT = timedelta(minutes=15)
_COACHES_HEARTBEAT = timedelta(minutes=2)


@workflow.defn
class CfbdDimsWorkflow:
    """Nightly materialization of all CFBD dimension tables."""

    @workflow.run
    async def run(self) -> dict:
        flat_tasks = [
            workflow.execute_activity(
                sync_flat_dim,
                key,
                start_to_close_timeout=_FLAT_TIMEOUT,
                retry_policy=_RETRY,
            )
            for key in FLAT_DIM_KEYS
        ]
        coaches_task = workflow.execute_activity(
            sync_coaches,
            start_to_close_timeout=_COACHES_TIMEOUT,
            heartbeat_timeout=_COACHES_HEARTBEAT,
            retry_policy=_RETRY,
        )

        *flat_results, coaches_result = await asyncio.gather(*flat_tasks, coaches_task)

        result: dict = {
            r["entity"]: {"processed": r["processed"], "changed": r["changed"]}
            for r in flat_results
        }
        result.update(coaches_result)  # {"coaches": {...}, "coach_seasons": {...}}
        workflow.logger.info("cfbd_dims workflow complete: %s", result)
        return result
