"""Kick off a one-off CFBD plays run and print the summary.

Replaces the admin "Run" button for this run-only task (which lived on the
Procrastinate registry). The plays pipeline has no schedule — this is the only
trigger. Uses a timestamped id so manual runs never collide.

Run as: python -m app.temporal.cfbd_plays.starter
"""

import asyncio
import json
from datetime import UTC, datetime

from app.core.config import settings
from app.core.temporal import get_temporal_client
from app.temporal.cfbd_plays.workflows import CfbdPlaysWorkflow


async def main() -> None:
    client = await get_temporal_client()
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    summary = await client.execute_workflow(
        CfbdPlaysWorkflow.run,
        id=f"cfbd-plays-manual-{stamp}",
        task_queue=settings.temporal_task_queue,
    )
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
