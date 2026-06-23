"""Temporal worker entrypoint.

Polls the configured task queue and runs our workflows + activities. Mirrors the
Procrastinate worker (app/worker.py) in shape.

Run as: python -m app.temporal.worker

Registering new work: add the workflow class to `workflows=` and the activity
function to `activities=` below.
"""

import asyncio
import logging

from temporalio.client import Client
from temporalio.worker import Worker

from app.core.config import settings
from app.core.temporal import get_temporal_client
from app.temporal.activities import compose_greeting
from app.temporal.cfbd_dims.activities import sync_coaches, sync_flat_dim
from app.temporal.cfbd_dims.schedule import ensure_schedule
from app.temporal.cfbd_dims.workflow import CfbdDimsWorkflow
from app.temporal.workflows import GreetingWorkflow

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
    # Procrastinate worker reconciles DB crons at startup).
    await ensure_schedule(client)

    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[GreetingWorkflow, CfbdDimsWorkflow],
        activities=[compose_greeting, sync_flat_dim, sync_coaches],
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
