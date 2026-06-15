"""discord_bot notification strategy: deliver via the bot (REST), not a webhook.

A notification_channels row with strategy="discord_bot" routes a task's
notifications through the bot. Config: {"channel_id": "..."}. The bot token comes
from the environment (settings.discord_bot_token), never the channel config, so
the secret stays out of the DB. Notifications run in the worker process (no live
gateway), so delivery is over REST via send_bot_message.

Message formatting is shared with the webhook strategy so both look identical.
"""
from app.core.config import settings
from app.services.discord import send_bot_message
from app.services.notifications.base import NotificationStrategy
from app.services.notifications.discord import _format_message


class DiscordBotStrategy(NotificationStrategy):
    name = "discord_bot"

    async def send(self, *, config: dict, event: str, payload: dict) -> None:
        channel_id = str(config.get("channel_id", "")).strip()
        if not channel_id or not settings.discord_bot_token:
            return
        await send_bot_message(
            settings.discord_bot_token, channel_id, _format_message(event, payload)
        )
