"""The pipeline run workflow.

Orchestration only — no I/O. ``prepare_run`` validates the frozen graph
snapshot and returns a small deps plan; the workflow then executes the DAG in
level-parallel waves (every node whose upstreams are done runs concurrently),
one ``run_node`` activity per node on the dedicated media queue so ffmpeg
can't starve the default queue's activity slots.

Fail-fast: a failed node fails the run and unstarted nodes are marked skipped.
Cancellation is cooperative — activity heartbeats deliver it, the ffmpeg
process is killed, and a shielded ``finalize_run`` records the canceled state.
"""

import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import CancelledError as TemporalCancelledError
from temporalio.workflow import ActivityCancellationType

with workflow.unsafe.imports_passed_through():
    from app.temporal.pipeline.activities import finalize_run, prepare_run, run_node

# Bad params can't be fixed by retrying; everything else (transient S3/DB
# hiccups) gets one more attempt. A long transcode re-running once is
# acceptable; heartbeats (every ffmpeg progress line) are the liveness guard.
_NODE_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    maximum_attempts=2,
    non_retryable_error_types=["StepParamError"],
)
_NODE_TIMEOUT = timedelta(hours=2)
_NODE_HEARTBEAT = timedelta(seconds=60)
_HOUSEKEEPING_TIMEOUT = timedelta(minutes=2)


def _error_message(exc: BaseException) -> str:
    """Innermost cause message — Temporal wraps failures (ActivityError →
    ApplicationError), and the run row should record the real reason."""
    while getattr(exc, "cause", None) is not None:
        exc = exc.cause  # type: ignore[attr-defined]
    return str(exc)


def _is_cancellation(exc: BaseException | None) -> bool:
    """Cancellation reaches the workflow in two shapes: asyncio.CancelledError
    at an await point, or an ActivityError whose cause chain ends in Temporal's
    CancelledError (a cancelled activity surfacing through asyncio.gather)."""
    while exc is not None:
        if isinstance(exc, asyncio.CancelledError | TemporalCancelledError):
            return True
        exc = getattr(exc, "cause", None)
    return False


@workflow.defn
class PipelineRunWorkflow:
    """One pipeline run: validate → execute DAG → finalize."""

    @workflow.run
    async def run(self, run_id: int) -> None:
        plan = await workflow.execute_activity(
            prepare_run,
            run_id,
            start_to_close_timeout=_HOUSEKEEPING_TIMEOUT,
            retry_policy=RetryPolicy(maximum_attempts=3),
        )
        deps: dict[str, list] = plan["deps"]
        media_queue: str = plan["media_task_queue"]

        try:
            done: set[str] = set()
            pending = dict(deps)
            while pending:
                ready = [
                    node_id
                    for node_id, node_deps in pending.items()
                    if all(up in done for up, _, _ in node_deps)
                ]
                if not ready:  # unreachable post-validation; guard anyway
                    raise RuntimeError("pipeline deadlocked: no runnable nodes")
                await asyncio.gather(
                    *(
                        workflow.execute_activity(
                            run_node,
                            args=[run_id, node_id],
                            task_queue=media_queue,
                            start_to_close_timeout=_NODE_TIMEOUT,
                            heartbeat_timeout=_NODE_HEARTBEAT,
                            retry_policy=_NODE_RETRY,
                            # On cancel, wait for the activity to actually stop
                            # (ffmpeg killed, node_run marked) before finalizing.
                            cancellation_type=ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
                        )
                        for node_id in ready
                    )
                )
                done.update(ready)
                for node_id in ready:
                    del pending[node_id]
        except BaseException as exc:
            canceled = _is_cancellation(exc)
            # Shielded so the cleanup write survives workflow cancellation.
            await asyncio.shield(
                workflow.execute_activity(
                    finalize_run,
                    args=[
                        run_id,
                        "canceled" if canceled else "failed",
                        None if canceled else _error_message(exc),
                    ],
                    start_to_close_timeout=_HOUSEKEEPING_TIMEOUT,
                    retry_policy=RetryPolicy(maximum_attempts=3),
                )
            )
            raise

        await workflow.execute_activity(
            finalize_run,
            args=[run_id, "succeeded", None],
            start_to_close_timeout=_HOUSEKEEPING_TIMEOUT,
            retry_policy=RetryPolicy(maximum_attempts=3),
        )
        workflow.logger.info("pipeline run %s complete", run_id)
