import logging
import httpx

logger = logging.getLogger(__name__)


async def send_discord_alert(webhook_url: str, message: str) -> None:
    if not webhook_url:
        return
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(webhook_url, json={"content": message}, timeout=10.0)
            resp.raise_for_status()
    except Exception:
        logger.exception("Failed to send Discord alert")
