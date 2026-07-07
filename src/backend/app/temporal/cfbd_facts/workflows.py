"""CFBD fact-ingestion workflows.

Topology (parent → child → activity):

    CfbdFactsWorkflow                 ← scheduled daily; orchestrator only
      ├─ get_facts_config             (activity)  start_year + endpoint list
      ├─ load_fact_coverage           (activity)  completed (endpoint, year) pairs
      └─ CfbdEndpointWorkflow × N      (child, one per endpoint, bounded fan-out)
           └─ sync_fact_season         (activity, per missing season)

Workflow code is deterministic: no I/O, no wall-clock — the "current season" comes
from ``workflow.now()`` (Temporal-replayable time), and all side effects are
pushed into activities. Activity modules are imported through
``workflow.unsafe.imports_passed_through()`` so the sandbox doesn't re-instrument
them. Per-season failures are isolated (one bad season never fails its siblings);
per-endpoint failures are isolated (one bad endpoint never fails the run).
"""

import asyncio
from dataclasses import dataclass, field
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from app.temporal.cfbd_facts.activities import (
        SeasonResult,
        get_facts_config,
        load_fact_coverage,
        sync_fact_season,
    )

# How many endpoint child workflows run at once. CFBD fact data is immutable per
# finished season, so the steady state is one fetch per endpoint per day; the
# bound only matters during the first backfill, where it keeps us from hammering
# the CFBD API with every endpoint × season at once.
_ENDPOINT_CONCURRENCY = 4

# Retry policy for the season ingest activity.
# retry=3 plus hand-rolled HTTP backoff. Transient CFBD 429/5xx and DB hiccups
# back off exponentially; a season that keeps failing is surfaced to the child,
# which records it and moves on (the season stays uncovered and self-heals).
_SEASON_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=60),
    maximum_attempts=4,
)

# Short, cheap config/coverage reads.
_QUICK_TIMEOUT = timedelta(seconds=30)


@dataclass
class EndpointInput:
    endpoint: str
    start_year: int
    current_year: int
    completed_years: list[int] = field(default_factory=list)


@dataclass
class EndpointResult:
    endpoint: str
    synced: list[int] = field(default_factory=list)
    skipped: list[int] = field(default_factory=list)
    errors: list[int] = field(default_factory=list)
    processed: int = 0
    changed: int = 0


@workflow.defn
class CfbdEndpointWorkflow:
    """Backfill one fact endpoint across all of its missing seasons.

    Owns one endpoint as its own durable history: seasons run sequentially (so we
    never fan out unbounded API calls for a single endpoint), already-complete
    seasons are skipped, and a season that exhausts its retries is recorded as an
    error without aborting the rest of the endpoint.
    """

    @workflow.run
    async def run(self, inp: EndpointInput) -> EndpointResult:
        result = EndpointResult(endpoint=inp.endpoint)
        completed = set(inp.completed_years)
        for year in range(inp.start_year, inp.current_year + 1):
            if year in completed:  # finished season already ingested
                result.skipped.append(year)
                continue
            try:
                season: SeasonResult = await workflow.execute_activity(
                    sync_fact_season,
                    args=[inp.endpoint, year, inp.current_year],
                    start_to_close_timeout=timedelta(minutes=15),
                    heartbeat_timeout=timedelta(minutes=2),
                    retry_policy=_SEASON_RETRY,
                )
            except Exception:  # noqa: BLE001 — isolate this season, keep going
                workflow.logger.exception("cfbd_facts %s %s failed", inp.endpoint, year)
                result.errors.append(year)
                continue
            result.synced.append(year)
            result.processed += season.processed
            result.changed += season.changed
        return result


@workflow.defn
class CfbdFactsWorkflow:
    """Daily orchestrator: smart-syncs every CFBD fact endpoint.

    Backfills missing seasons and re-pulls only the in-progress (current) season,
    fanning the endpoints out to child workflows in bounded batches. Returns a
    per-endpoint summary.
    """

    @workflow.run
    async def run(self) -> dict:
        config = await workflow.execute_activity(
            get_facts_config, start_to_close_timeout=_QUICK_TIMEOUT
        )
        completed_pairs = await workflow.execute_activity(
            load_fact_coverage, start_to_close_timeout=_QUICK_TIMEOUT
        )
        current_year = workflow.now().year

        # Group completed years by endpoint for quick per-child lookup.
        completed_by_endpoint: dict[str, list[int]] = {}
        for endpoint, year in completed_pairs:
            completed_by_endpoint.setdefault(endpoint, []).append(year)

        parent_id = workflow.info().workflow_id
        summary: dict[str, dict] = {}

        # Bounded fan-out: dispatch endpoint children in fixed-size batches so the
        # backfill stays polite to the CFBD API while still running in parallel.
        endpoints = config.endpoints
        for start in range(0, len(endpoints), _ENDPOINT_CONCURRENCY):
            batch = endpoints[start : start + _ENDPOINT_CONCURRENCY]
            results = await asyncio.gather(
                *(
                    workflow.execute_child_workflow(
                        CfbdEndpointWorkflow.run,
                        EndpointInput(
                            endpoint=endpoint,
                            start_year=config.start_year,
                            current_year=current_year,
                            completed_years=completed_by_endpoint.get(endpoint, []),
                        ),
                        id=f"{parent_id}-{endpoint}",
                    )
                    for endpoint in batch
                ),
                return_exceptions=True,
            )
            for endpoint, res in zip(batch, results, strict=False):
                if isinstance(res, BaseException):  # whole endpoint failed
                    workflow.logger.exception(
                        "cfbd_facts endpoint %s failed", endpoint, exc_info=res
                    )
                    summary[endpoint] = {"failed": True}
                    continue
                summary[endpoint] = {
                    "synced": res.synced,
                    "skipped": res.skipped,
                    "errors": res.errors,
                    "processed": res.processed,
                    "changed": res.changed,
                }

        workflow.logger.info("cfbd_facts sync: %s", summary)
        return summary
