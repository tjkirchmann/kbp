"""Procrastinate worker entrypoint with DB-driven cron scheduling.

Replaces the stock `procrastinate ... worker` CLI. Periodic schedules live in the
DB (admin_notify_config.cron), not in code. This entrypoint:

  1. Loads crons from the DB into the periodic registry at startup.
  2. Listens on the Postgres `cron_changed` channel for instant re-sync on edits.
  3. Polls every 30s as a durability fallback (covers a missed/dropped NOTIFY).
  4. Runs the Procrastinate worker.

Run as: python -m app.worker
"""
import asyncio
import logging

from app.core.database import TaskSessionLocal as SessionLocal, _task_engine
from app.core.periodic_sync import CRON_CHANNEL, resync
from app.core.procrastinate import procrastinate_app as app

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.worker")

POLL_INTERVAL_SECONDS = 30


async def _resync_now() -> None:
    async with SessionLocal() as db:
        await resync(app, db)


async def _poll_loop() -> None:
    """Durability fallback: reconcile from the DB on a fixed interval."""
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        try:
            await _resync_now()
        except Exception:
            logger.exception("cron poll resync failed")


async def _listen_loop() -> None:
    """Instant apply: re-sync whenever the API fires NOTIFY cron_changed.

    Reconnects on a dropped connection; the poll loop covers any gap.
    """
    while True:
        try:
            async with _task_engine.connect() as conn:
                raw = await conn.get_raw_connection()
                asyncpg_conn = raw.driver_connection
                queue: asyncio.Queue[None] = asyncio.Queue()

                def _on_notify(*_args) -> None:
                    queue.put_nowait(None)

                await asyncpg_conn.add_listener(CRON_CHANNEL, _on_notify)
                logger.info("Listening on %s", CRON_CHANNEL)
                try:
                    while True:
                        await queue.get()
                        # Drain coalesced notifications into a single resync.
                        while not queue.empty():
                            queue.get_nowait()
                        try:
                            await _resync_now()
                            logger.info("Re-synced crons on NOTIFY")
                        except Exception:
                            logger.exception("NOTIFY resync failed")
                finally:
                    await asyncpg_conn.remove_listener(CRON_CHANNEL, _on_notify)
        except Exception:
            logger.exception("LISTEN connection dropped; retrying in 5s")
            await asyncio.sleep(5)


async def main() -> None:
    async with app.open_async():
        await _resync_now()  # initial registration from DB
        poll = asyncio.create_task(_poll_loop(), name="cron-poll")
        listen = asyncio.create_task(_listen_loop(), name="cron-listen")
        try:
            await app.run_worker_async()
        finally:
            for t in (poll, listen):
                t.cancel()


if __name__ == "__main__":
    asyncio.run(main())
