"""Kick off a one-off CFBD facts run and print the summary.

Replaces the admin "Run now" button for this task (which lived on the
Procrastinate registry). Runs the same workflow the daily schedule does, with a
timestamped id so manual runs don't collide with the scheduled one.

Run as: python -m app.temporal.cfbd_facts.starter
"""

import asyncio
import json
from datetime import UTC, datetime

from app.core.config import settings
from app.core.temporal import get_temporal_client
from app.temporal.cfbd_facts.workflows import CfbdFactsWorkflow


async def main() -> None:
    client = await get_temporal_client()
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    summary = await client.execute_workflow(
        CfbdFactsWorkflow.run,
        id=f"cfbd-facts-manual-{stamp}",
        task_queue=settings.temporal_task_queue,
    )
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
