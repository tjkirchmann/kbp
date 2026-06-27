"""Slash command interface (primary inbound surface).

Commands are thin adapters: authorize → start a Temporal workflow / query Temporal
visibility → reply. Slash commands need no privileged intent. The trigger path
reuses the shared registry in app.temporal.triggers (the same workflows the
schedules drive), replacing the old Procrastinate defer.
"""

import logging

import discord
from discord import app_commands
from discord.ext import commands

from app.core.database import TaskSessionLocal
from app.core.temporal import get_temporal_client
from app.services.admin_config import get_bot_command_channel, get_bot_enabled
from app.temporal.triggers import TRIGGER_NAMES, TRIGGERS

logger = logging.getLogger("app.bot")

# Status icons by Temporal execution status name.
_STATUS_ICON = {
    "COMPLETED": "✅",
    "FAILED": "❌",
    "TERMINATED": "⛔",
    "CANCELED": "🚫",
    "RUNNING": "⏳",
    "CONTINUED_AS_NEW": "🔄",
    "TIMED_OUT": "⌛",
}


class CommandsCog(commands.Cog):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    async def _authorized(self, interaction: discord.Interaction) -> bool:
        """Gate commands: bot must be enabled, and (if a command channel is set)
        the command must be invoked there."""
        async with TaskSessionLocal() as db:
            if not await get_bot_enabled(db):
                await interaction.response.send_message(
                    "Bot is disabled.", ephemeral=True
                )
                return False
            command_channel = await get_bot_command_channel(db)
        if command_channel and str(interaction.channel_id) != command_channel:
            await interaction.response.send_message(
                "Commands aren't allowed in this channel.", ephemeral=True
            )
            return False
        return True

    @app_commands.command(
        name="sync", description="Trigger a background sync workflow by name."
    )
    @app_commands.describe(
        task_name=f"One of: {', '.join(TRIGGER_NAMES)}",
    )
    async def sync(self, interaction: discord.Interaction, task_name: str) -> None:
        if not await self._authorized(interaction):
            return

        trigger = TRIGGERS.get(task_name)
        if trigger is None:
            await interaction.response.send_message(
                f"Unknown task `{task_name}`. Options: {', '.join(TRIGGER_NAMES)}",
                ephemeral=True,
            )
            return
        try:
            client = await get_temporal_client()
            wf_id = await trigger(client)
            await interaction.response.send_message(
                f"▶️ Started `{task_name}` (workflow `{wf_id}`)."
            )
        except Exception:
            logger.exception("Failed to trigger %s from Discord", task_name)
            await interaction.response.send_message(
                f"Failed to start `{task_name}`.", ephemeral=True
            )

    @app_commands.command(
        name="status", description="Show the most recent background runs."
    )
    async def status(self, interaction: discord.Interaction) -> None:
        if not await self._authorized(interaction):
            return
        try:
            client = await get_temporal_client()
            runs = []
            async for wf in client.list_workflows(
                query="ORDER BY StartTime DESC", limit=10
            ):
                runs.append(wf)
        except Exception:
            logger.exception("Failed to list workflows from Discord")
            await interaction.response.send_message(
                "Failed to fetch runs.", ephemeral=True
            )
            return

        if not runs:
            await interaction.response.send_message("No runs yet.")
            return

        lines = []
        for wf in runs:
            status_name = wf.status.name if wf.status else "RUNNING"
            icon = _STATUS_ICON.get(status_name, "⏳")
            when = wf.close_time or wf.start_time
            ts = f" ({when:%Y-%m-%d %H:%M} UTC)" if when else ""
            lines.append(
                f"{icon} `{wf.workflow_type}` — {status_name.lower()}{ts}"
            )
        await interaction.response.send_message("**Recent runs**\n" + "\n".join(lines))
