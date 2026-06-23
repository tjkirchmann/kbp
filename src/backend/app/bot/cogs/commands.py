"""Slash command interface (primary inbound surface).

Commands are thin adapters: authorize → call a service / defer a Procrastinate
job → reply. Slash commands need no privileged intent. The job-trigger path
reuses the exact defer mechanism the admin endpoints use
(procrastinate_app.tasks[name].defer_async()), so the existing worker runs them.
"""

import logging

import discord
from discord import app_commands
from discord.ext import commands
from sqlalchemy import text

from app.core.database import TaskSessionLocal
from app.core.procrastinate import procrastinate_app
from app.services.admin_config import get_bot_command_channel, get_bot_enabled

logger = logging.getLogger("app.bot")

# Recent runs across all tasks, newest first (mirrors admin /sync/recent).
_RECENT_SQL = text(
    """
    SELECT j.id, j.task_name, j.status,
           max(e.at) FILTER (WHERE e.type IN ('succeeded','failed','aborted','cancelled')) AS ended_at
    FROM procrastinate_jobs j
    LEFT JOIN procrastinate_events e ON e.job_id = j.id
    GROUP BY j.id, j.task_name, j.status
    ORDER BY j.id DESC
    LIMIT :limit
    """
)


def _registered_tasks() -> dict:
    """App-defined tasks by name (excludes Procrastinate builtins). Mirrors admin."""
    procrastinate_app.perform_import_paths()
    return {
        name: task
        for name, task in procrastinate_app.tasks.items()
        if not name.startswith(("builtin:", "procrastinate."))
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
        name="sync", description="Trigger a background sync task by name."
    )
    @app_commands.describe(task_name="The registered task to run (e.g. cfbd_sync).")
    async def sync(self, interaction: discord.Interaction, task_name: str) -> None:
        if not await self._authorized(interaction):
            return
        from procrastinate.exceptions import AlreadyEnqueued

        task = _registered_tasks().get(task_name)
        if task is None:
            await interaction.response.send_message(
                f"Unknown task `{task_name}`.", ephemeral=True
            )
            return
        try:
            job_id = await task.defer_async()
            await interaction.response.send_message(
                f"▶️ Deferred `{task_name}` (job `{job_id}`)."
            )
        except AlreadyEnqueued:
            await interaction.response.send_message(
                f"`{task_name}` is already queued.", ephemeral=True
            )
        except Exception:
            logger.exception("Failed to defer %s from Discord", task_name)
            await interaction.response.send_message(
                f"Failed to defer `{task_name}`.", ephemeral=True
            )

    @app_commands.command(
        name="status", description="Show the most recent background runs."
    )
    async def status(self, interaction: discord.Interaction) -> None:
        if not await self._authorized(interaction):
            return
        async with TaskSessionLocal() as db:
            rows = (await db.execute(_RECENT_SQL, {"limit": 10})).mappings().all()
        if not rows:
            await interaction.response.send_message("No runs yet.")
            return
        _icon = {"succeeded": "✅", "failed": "❌", "aborted": "⛔", "cancelled": "🚫"}
        lines = [
            f"{_icon.get(r['status'], '⏳')} `{r['task_name']}` — {r['status']}"
            + (f" ({r['ended_at']:%Y-%m-%d %H:%M} UTC)" if r["ended_at"] else "")
            for r in rows
        ]
        await interaction.response.send_message("**Recent runs**\n" + "\n".join(lines))
