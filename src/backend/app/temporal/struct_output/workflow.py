"""Structured-output workflows (orchestration only — no I/O).

``StructOutputEntityWorkflow`` — generate + upsert for one entity. Its own durable
history and retry state; also the unit a per-entity webhook starts directly.

``StructOutputBatchWorkflow`` — resolve targets, then fan out one entity child per
target in bounded batches (mirrors ``CfbdFactsWorkflow``). A failed entity is
isolated and recorded; it never aborts the batch. Populate-only vs. overwrite is
decided in ``resolve_targets`` via the ``overwrite`` flag.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from app.temporal.struct_output.activities import (
        ResolveResult,
        generate_and_upsert,
        resolve_targets,
    )

# How many entity children run at once — keeps us polite to the LLM/OpenRouter
# rate limits during a large batch while still running in parallel.
_ENTITY_CONCURRENCY = 5

# One LLM call + upsert per entity; generous timeout for slow models, with
# exponential backoff on transient provider 429/5xx and DB hiccups.
_ENTITY_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=60),
    maximum_attempts=4,
)
_ENTITY_TIMEOUT = timedelta(minutes=5)
_RESOLVE_TIMEOUT = timedelta(minutes=2)


@dataclass
class BatchInput:
    name: str
    overwrite: bool = False


@dataclass
class BatchResult:
    name: str
    total_in_scope: int = 0
    attempted: int = 0
    succeeded: list[int] = field(default_factory=list)
    failed: list[int] = field(default_factory=list)


@workflow.defn
class StructOutputEntityWorkflow:
    """Generate + upsert structured output for a single source entity."""

    @workflow.run
    async def run(self, name: str, entity_id: int, run_id: str) -> dict:
        return await workflow.execute_activity(
            generate_and_upsert,
            args=[name, entity_id, run_id],
            start_to_close_timeout=_ENTITY_TIMEOUT,
            retry_policy=_ENTITY_RETRY,
        )


@workflow.defn
class StructOutputBatchWorkflow:
    """Batch-generate a definition across its source entities."""

    @workflow.run
    async def run(self, inp: BatchInput) -> BatchResult:
        resolved: ResolveResult = await workflow.execute_activity(
            resolve_targets,
            args=[inp.name, inp.overwrite],
            start_to_close_timeout=_RESOLVE_TIMEOUT,
            retry_policy=_ENTITY_RETRY,
        )

        result = BatchResult(
            name=inp.name,
            total_in_scope=resolved.total_in_scope,
            attempted=len(resolved.entity_ids),
        )
        run_id = workflow.info().workflow_id

        ids = resolved.entity_ids
        for start in range(0, len(ids), _ENTITY_CONCURRENCY):
            batch = ids[start : start + _ENTITY_CONCURRENCY]
            results = await asyncio.gather(
                *(
                    workflow.execute_child_workflow(
                        StructOutputEntityWorkflow.run,
                        args=[inp.name, eid, run_id],
                        id=f"{run_id}-{eid}",
                    )
                    for eid in batch
                ),
                return_exceptions=True,
            )
            for eid, res in zip(batch, results, strict=True):
                if isinstance(res, BaseException):
                    workflow.logger.exception(
                        "struct_output %s entity %s failed", inp.name, eid, exc_info=res
                    )
                    result.failed.append(eid)
                else:
                    result.succeeded.append(eid)

        workflow.logger.info(
            "struct_output batch %s done: %d ok, %d failed (of %d in scope)",
            inp.name,
            len(result.succeeded),
            len(result.failed),
            result.total_in_scope,
        )
        return result
