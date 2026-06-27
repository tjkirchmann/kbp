"""Bot process entrypoint: `python -m app.bot`.

Mirrors app/worker.py's shape (single asyncio.run). Runs the bot's gateway
connection; cogs talk to Temporal via a per-command client (app.core.temporal),
so there's no long-lived pool to open here. Exits cleanly when no token is
configured so supervisor / compose don't crash-loop an unconfigured bot.
"""

import asyncio
import logging

from app.bot.client import build_bot
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.bot")


async def main() -> None:
    token = settings.discord_bot_token
    if not token:
        logger.warning(
            "DISCORD_BOT_TOKEN unset — Discord bot disabled; exiting cleanly."
        )
        return

    bot = build_bot()
    try:
        await bot.start(token)
    finally:
        if not bot.is_closed():
            await bot.close()


if __name__ == "__main__":
    asyncio.run(main())
