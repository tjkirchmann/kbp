"""Trigger an immediate ESPN seeder run (the Temporal-native 'Run now').

Ensures the seeder schedule exists, then fires one off-schedule tick. Replaces the
former admin "Run" button / ``make`` defer for ``espn_poll`` + ``espn_seed`` (the
seeder run both seeds stub rows and spawns pollers).

Run as: python -m app.temporal.espn.starter
"""
import asyncio
import json
from datetime import UTC, datetime

from app.core.config import settings
from app.core.temporal import get_temporal_client
from app.temporal.espn.schedule import ensure_espn_seeder_schedule
from app.temporal.espn.seeder_workflow import EspnSeederWorkflow


async def main() -> None:
    client = await get_temporal_client()
    await ensure_espn_seeder_schedule(client)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    summary = await client.execute_workflow(
        EspnSeederWorkflow.run,
        id=f"espn-seeder-manual-{stamp}",
        task_queue=settings.temporal_task_queue,
    )
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
