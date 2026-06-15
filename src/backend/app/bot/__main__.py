"""Bot process entrypoint: `python -m app.bot`.

Mirrors app/worker.py's shape (single asyncio.run). Opens the Procrastinate pool
so cogs can defer jobs (same API the admin endpoints use), then runs the bot's
gateway connection. Exits cleanly when no token is configured so supervisor /
compose don't crash-loop an unconfigured bot.
"""
import asyncio
import logging

from app.bot.client import build_bot
from app.core.config import settings
from app.core.procrastinate import procrastinate_app

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.bot")


async def main() -> None:
    token = settings.discord_bot_token
    if not token:
        logger.warning("DISCORD_BOT_TOKEN unset — Discord bot disabled; exiting cleanly.")
        return

    # Open the Procrastinate connection pool for the lifetime of the bot so cogs
    # can defer jobs (procrastinate_app.tasks[name].defer_async()).
    async with procrastinate_app.open_async():
        bot = build_bot()
        try:
            await bot.start(token)
        finally:
            if not bot.is_closed():
                await bot.close()


if __name__ == "__main__":
    asyncio.run(main())
