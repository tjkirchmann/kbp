import logging

import httpx

logger = logging.getLogger(__name__)

_DISCORD_API = "https://discord.com/api/v10"


async def send_discord_alert(webhook_url: str, message: str) -> None:
    if not webhook_url:
        return
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                webhook_url, json={"content": message}, timeout=10.0
            )
            resp.raise_for_status()
    except Exception:
        logger.exception("Failed to send Discord alert")


async def send_bot_message(token: str, channel_id: str, message: str) -> None:
    """Post a message to a channel via the bot's REST API (Bot token auth).

    Used by the discord_bot notification strategy: notifications run in the
    worker process, which has no live gateway connection, so they post over REST
    rather than through the running bot client.
    """
    if not token or not channel_id:
        return
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_DISCORD_API}/channels/{channel_id}/messages",
                headers={"Authorization": f"Bot {token}"},
                json={"content": message},
                timeout=10.0,
            )
            resp.raise_for_status()
    except Exception:
        logger.exception("Failed to send Discord bot message")
