"""Temporal activities.

Activities are where side effects live (network calls, DB writes, etc.) — they run
outside the workflow sandbox, so normal imports and I/O are fine here. This sample
just composes a greeting; real activities can import app.services / the DB session.
"""

from temporalio import activity


@activity.defn
async def compose_greeting(name: str) -> str:
    activity.logger.info("composing greeting for %s", name)
    return f"Hello, {name}! 👋 — from Temporal"
