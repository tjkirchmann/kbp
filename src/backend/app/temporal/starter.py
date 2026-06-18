"""Kick off the sample workflow and print its result.

Proves the end-to-end path: client → Temporal server → worker → activity → result.
Use this as the template for starting workflows from scripts; from FastAPI routes,
call `get_temporal_client()` and `client.start_workflow(...)` the same way.

Run as: python -m app.temporal.starter [name]
"""
import asyncio
import sys

from app.core.config import settings
from app.core.temporal import get_temporal_client
from app.temporal.workflows import GreetingWorkflow


async def main() -> None:
    name = sys.argv[1] if len(sys.argv) > 1 else "KBP"
    client = await get_temporal_client()

    result = await client.execute_workflow(
        GreetingWorkflow.run,
        name,
        id=f"greeting-{name}",
        task_queue=settings.temporal_task_queue,
    )
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
