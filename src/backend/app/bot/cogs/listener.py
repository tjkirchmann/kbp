"""Inbound message listener: the chat/relay path.

on_message fires for every message the bot can see. We ignore the bot's own
messages, require the bot to be enabled, and only act on allowlisted channels.
This is the two-way path — extend `_handle` to store, relay, or reply.

NOTE: reading message.content requires the privileged Message Content intent
(set in client._build_intents AND toggled in the Developer Portal). Without it,
message.content is empty even though this handler still fires.
"""
import logging

import discord
from discord.ext import commands

from app.core.database import TaskSessionLocal
from app.services.admin_config import get_bot_enabled, get_bot_listen_channels

logger = logging.getLogger("app.bot")


class ListenerCog(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot:
            return  # ignore bots (incl. ourselves) to avoid loops
        async with TaskSessionLocal() as db:
            if not await get_bot_enabled(db):
                return
            allowed = await get_bot_listen_channels(db)
        if str(message.channel.id) not in allowed:
            return
        await self._handle(message)

    async def _handle(self, message: discord.Message) -> None:
        """Act on an allowlisted inbound message. Replies as a baseline; extend
        to store messages or relay them into the app."""
        logger.info("Inbound message in %s from %s: %r",
                    message.channel.id, message.author, message.content)
        try:
            await message.channel.send(f"Received: {message.content}")
        except Exception:
            logger.exception("Failed to reply to inbound message")
