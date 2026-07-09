"""Temporal worker entrypoint.

Polls the configured task queues and runs our workflows + activities. This is the
sole background-work entrypoint.

Run as: python -m app.temporal.worker

Registering new work: add the workflow class to `workflows=` and the activity
function to `activities=` below.
"""

import asyncio
import logging
from datetime import timedelta

from temporalio.client import Client
from temporalio.worker import Worker

from app.core.config import settings
from app.core.temporal import get_temporal_client
from app.temporal.cfbd_dims.activities import sync_coaches, sync_flat_dim
from app.temporal.cfbd_dims.schedule import ensure_schedule
from app.temporal.cfbd_dims.workflow import CfbdDimsWorkflow
from app.temporal.cfbd_facts.activities import (
    get_facts_config,
    load_fact_coverage,
    sync_fact_season,
)
from app.temporal.cfbd_facts.schedule import ensure_cfbd_facts_schedule
from app.temporal.cfbd_facts.workflows import (
    CfbdEndpointWorkflow,
    CfbdFactsWorkflow,
)
from app.temporal.cfbd_games.activities import sync_games_season
from app.temporal.cfbd_games.schedule import ensure_cfbd_games_schedule
from app.temporal.cfbd_games.workflow import CfbdGamesWorkflow
from app.temporal.cfbd_plays.activities import (
    get_plays_config,
    load_plays_coverage,
    sync_plays_season,
)
from app.temporal.cfbd_plays.workflows import (
    CfbdPlaysEndpointWorkflow,
    CfbdPlaysWorkflow,
)
from app.temporal.espn.activities import (
    find_live_game_ids,
    get_espn_poll_task_queue,
    poll_espn_game,
    prune_event_log,
    seed_missing_games,
)
from app.temporal.espn.game_workflow import EspnGameWorkflow
from app.temporal.espn.schedule import ensure_espn_seeder_schedule
from app.temporal.espn.seeder_workflow import EspnSeederWorkflow
from app.temporal.pipeline.activities import (
    finalize_run,
    prepare_run,
    run_node,
)
from app.temporal.pipeline.workflow import PipelineRunWorkflow
from app.temporal.struct_output.activities import (
    generate_and_upsert,
    resolve_targets,
)
from app.temporal.struct_output.schedule import (
    reconcile_schedules as reconcile_struct_output_schedules,
)
from app.temporal.struct_output.workflow import (
    StructOutputBatchWorkflow,
    StructOutputEntityWorkflow,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.temporal.worker")

# auto-setup applies the Temporal schema on first boot, so the server may not
# accept connections immediately. Retry rather than crash-loop the container.
CONNECT_RETRY_SECONDS = 3


async def _connect_with_retry() -> Client:
    while True:
        try:
            return await get_temporal_client()
        except Exception:
            logger.warning(
                "Temporal not reachable at %s; retrying in %ss",
                settings.temporal_address,
                CONNECT_RETRY_SECONDS,
            )
            await asyncio.sleep(CONNECT_RETRY_SECONDS)


async def main() -> None:
    client = await _connect_with_retry()
    logger.info(
        "Worker connected to %s (namespace=%s); polling task queue %r",
        settings.temporal_address,
        settings.temporal_namespace,
        settings.temporal_task_queue,
    )

    # Reconcile the nightly CFBD-dims schedule on boot (mirrors how the
    # Schedules are self-reconciling on boot).
    await ensure_schedule(client)

    # Declare the daily CFBD facts schedule in code (idempotent create-or-update),
    # so it's self-registering on boot.
    await ensure_cfbd_facts_schedule(client)

    # Declare the frequent CFBD games schedule in code (idempotent), replacing the
    # cfbd_games schedule.
    await ensure_cfbd_games_schedule(client)

    # Declare the ESPN seeder schedule (coarse tick that spawns per-game pollers),
    # espn seeder schedule.
    await ensure_espn_seeder_schedule(client)

    # Reconcile struct-output Temporal Schedules on worker boot only when
    # explicitly enabled (prod). In dev, this stays off to avoid firing LLM
    # calls (via OpenRouter) on every container start.
    if settings.temporal_reconcile_struct_output:
        await reconcile_struct_output_schedules(client)
    else:
        logger.info(
            "Struct-output schedule reconciliation disabled "
            "(TEMPORAL_RECONCILE_STRUCT_OUTPUT is false)"
        )

    # Default-queue worker: every workflow plus the cheap (non-rate-limited)
    # activities. The ESPN game/seeder workflows live here too — they only sleep
    # and dispatch; the rate-limited poll runs on the dedicated espn queue below.
    default_worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[
            CfbdDimsWorkflow,
            CfbdFactsWorkflow,
            CfbdEndpointWorkflow,
            CfbdGamesWorkflow,
            CfbdPlaysWorkflow,
            CfbdPlaysEndpointWorkflow,
            EspnSeederWorkflow,
            EspnGameWorkflow,
            StructOutputBatchWorkflow,
            StructOutputEntityWorkflow,
            PipelineRunWorkflow,
        ],
        activities=[
            sync_flat_dim,
            sync_coaches,
            get_facts_config,
            load_fact_coverage,
            sync_fact_season,
            sync_games_season,
            get_plays_config,
            load_plays_coverage,
            sync_plays_season,
            get_espn_poll_task_queue,
            seed_missing_games,
            find_live_game_ids,
            prune_event_log,
            resolve_targets,
            generate_and_upsert,
            prepare_run,
            finalize_run,
        ],
    )

    # Dedicated media worker: only the CPU-heavy per-node pipeline activity
    # (ffmpeg), capped so concurrent transcodes can't peg the container while
    # the default queue keeps its activity slots free. Heartbeat throttling is
    # tightened because cancellation rides the heartbeat RPC — the default
    # throttle would leave a canceled ffmpeg running for tens of seconds.
    media_worker = Worker(
        client,
        task_queue=settings.temporal_media_task_queue,
        activities=[run_node],
        max_concurrent_activities=settings.pipeline_media_concurrency,
        default_heartbeat_throttle_interval=timedelta(seconds=5),
        max_heartbeat_throttle_interval=timedelta(seconds=5),
    )

    # Dedicated ESPN worker: only the single rate-limited poll activity. Temporal
    # enforces the global ESPN request budget here via the task-queue activity
    # rate limit (requests/min ÷ 60), across all workers on this queue — this is
    # what replaced the old DB token bucket (app/core/rate_limiter.py).
    espn_worker = Worker(
        client,
        task_queue=settings.temporal_espn_task_queue,
        activities=[poll_espn_game],
        max_task_queue_activities_per_second=settings.espn_rate_limit_per_minute / 60,
    )

    logger.info(
        "ESPN poll queue %r rate-limited to %.3f activities/sec (%d req/min)",
        settings.temporal_espn_task_queue,
        settings.espn_rate_limit_per_minute / 60,
        settings.espn_rate_limit_per_minute,
    )

    await asyncio.gather(default_worker.run(), espn_worker.run(), media_worker.run())


if __name__ == "__main__":
    asyncio.run(main())
