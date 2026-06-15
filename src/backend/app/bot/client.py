"""Bot construction and lifecycle wiring.

build_bot() assembles the discord.py Bot: intents, an explicit cog list, and an
on_ready hook that syncs slash commands (per-guild in dev for instant
propagation; global otherwise). Handlers live in cogs and stay thin — real work
is pushed into services and Procrastinate tasks.
"""
import logging

import discord
from discord.ext import commands

from app.bot.cogs.commands import CommandsCog
from app.bot.cogs.listener import ListenerCog
from app.core.config import settings

logger = logging.getLogger("app.bot")

# Explicit registry (greppable; no folder auto-discovery). Add a feature by
# writing a cog and appending it here.
COGS: list[type[commands.Cog]] = [CommandsCog, ListenerCog]

# Whether the relay listener needs message text. message_content is a privileged
# intent: it also requires the Developer-Portal toggle, else message.content is
# empty. We always request it so the relay path works once the portal toggle is on.
_NEEDS_MESSAGE_CONTENT = True


def _build_intents() -> discord.Intents:
    intents = discord.Intents.default()
    intents.message_content = _NEEDS_MESSAGE_CONTENT
    return intents


def build_bot() -> commands.Bot:
    bot = commands.Bot(command_prefix="!", intents=_build_intents())

    @bot.event
    async def on_ready() -> None:
        logger.info("Bot connected as %s (id=%s)", bot.user, getattr(bot.user, "id", "?"))
        try:
            if settings.discord_guild_id:
                guild = discord.Object(id=int(settings.discord_guild_id))
                bot.tree.copy_global_to(guild=guild)
                synced = await bot.tree.sync(guild=guild)
                logger.info("Synced %d command(s) to guild %s", len(synced), settings.discord_guild_id)
            else:
                synced = await bot.tree.sync()
                logger.info("Synced %d global command(s) (may take ~1h to appear)", len(synced))
        except Exception:
            logger.exception("Slash command sync failed")

    @bot.event
    async def setup_hook() -> None:
        for cog_cls in COGS:
            await bot.add_cog(cog_cls(bot))
        logger.info("Loaded cogs: %s", ", ".join(c.__name__ for c in COGS))

    return bot
