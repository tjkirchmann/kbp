"""CFBD play-by-play ingestion workflows (run-only).

Topology mirrors ``cfbd_facts`` (parent → child → activity):

    CfbdPlaysWorkflow                 ← triggered on demand; orchestrator only
      ├─ get_plays_config             (activity)  start_year + endpoint list
      ├─ load_plays_coverage          (activity)  completed (endpoint, year) pairs
      └─ CfbdPlaysEndpointWorkflow × N (child, one per endpoint)
           └─ sync_plays_season        (activity, per missing season)

Workflow code is deterministic: no I/O, no wall-clock — the "current season" comes
from ``workflow.now()`` and all side effects are pushed into activities. Per-season
failures are isolated (one bad season never fails its siblings); per-endpoint
failures are isolated (one bad endpoint never fails the run).
"""

import asyncio
from dataclasses import dataclass, field
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from app.temporal.cfbd_plays.activities import (
        SeasonResult,
        get_plays_config,
        load_plays_coverage,
        sync_plays_season,
    )

# Only two play endpoints, but run them as concurrent children for per-endpoint
# isolation and to match the cfbd_facts topology.
_ENDPOINT_CONCURRENCY = 2

# Transient CFBD 429/5xx and DB hiccups back off exponentially; a season that
# keeps failing is surfaced to the child, which records it and moves on.
_SEASON_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=60),
    maximum_attempts=4,
)

# Short, cheap config/coverage reads.
_QUICK_TIMEOUT = timedelta(seconds=30)

# Play endpoints are the highest-volume CFBD payloads — give the season activity
# a longer ceiling than the facts endpoints.
_SEASON_TIMEOUT = timedelta(minutes=30)
_SEASON_HEARTBEAT = timedelta(minutes=2)


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
class CfbdPlaysEndpointWorkflow:
    """Backfill one play endpoint across all of its missing seasons.

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
                    sync_plays_season,
                    args=[inp.endpoint, year, inp.current_year],
                    start_to_close_timeout=_SEASON_TIMEOUT,
                    heartbeat_timeout=_SEASON_HEARTBEAT,
                    retry_policy=_SEASON_RETRY,
                )
            except Exception:  # noqa: BLE001 — isolate this season, keep going
                workflow.logger.exception("cfbd_plays %s %s failed", inp.endpoint, year)
                result.errors.append(year)
                continue
            result.synced.append(year)
            result.processed += season.processed
            result.changed += season.changed
        return result


@workflow.defn
class CfbdPlaysWorkflow:
    """On-demand orchestrator: smart-syncs every CFBD play endpoint.

    Backfills missing seasons and re-pulls only the in-progress (current) season,
    fanning the endpoints out to child workflows. Returns a per-endpoint summary.
    """

    @workflow.run
    async def run(self) -> dict:
        config = await workflow.execute_activity(
            get_plays_config, start_to_close_timeout=_QUICK_TIMEOUT
        )
        completed_pairs = await workflow.execute_activity(
            load_plays_coverage, start_to_close_timeout=_QUICK_TIMEOUT
        )
        current_year = workflow.now().year

        completed_by_endpoint: dict[str, list[int]] = {}
        for endpoint, year in completed_pairs:
            completed_by_endpoint.setdefault(endpoint, []).append(year)

        parent_id = workflow.info().workflow_id
        summary: dict[str, dict] = {}

        endpoints = config.endpoints
        for start in range(0, len(endpoints), _ENDPOINT_CONCURRENCY):
            batch = endpoints[start : start + _ENDPOINT_CONCURRENCY]
            results = await asyncio.gather(
                *(
                    workflow.execute_child_workflow(
                        CfbdPlaysEndpointWorkflow.run,
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
                        "cfbd_plays endpoint %s failed", endpoint, exc_info=res
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

        workflow.logger.info("cfbd_plays sync: %s", summary)
        return summary
