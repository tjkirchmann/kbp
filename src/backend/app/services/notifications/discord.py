from app.services.discord import send_discord_alert
from app.services.notifications.base import NotificationStrategy

# Emoji prefix per lifecycle event, for a glanceable Discord message.
_EVENT_ICON = {
    "start": "▶️",  # ▶️
    "success": "✅",  # ✅
    "failure": "❌",  # ❌
}


def _format_message(event: str, payload: dict) -> str:
    """Unpack an arbitrary payload into a human Discord message string.

    A ready-made `text` is delivered verbatim, so non-task callers (e.g. ESPN
    game alerts) can route their own pre-formatted message through any channel.
    Otherwise, recognized lifecycle keys are surfaced inline; the rest is ignored
    so callers can pass any extra context without breaking formatting.
    """
    text = payload.get("text")
    if text is not None:
        return str(text)

    icon = _EVENT_ICON.get(event, "ℹ️")  # ℹ️
    task_name = payload.get("task_name", "task")
    header = f"{icon} **{task_name}** — {event}"

    if event == "failure" and payload.get("error"):
        return f"{header}\n```{payload['error']}```"

    result = payload.get("result")
    if event == "success" and isinstance(result, dict) and result:
        details = " ".join(f"{k}={v}" for k, v in result.items())
        return f"{header} ({details})"

    return header


class DiscordStrategy(NotificationStrategy):
    name = "discord"

    async def send(self, *, config: dict, event: str, payload: dict) -> None:
        webhook_url = config.get("webhook_url", "")
        if not webhook_url:
            return
        await send_discord_alert(webhook_url, _format_message(event, payload))
