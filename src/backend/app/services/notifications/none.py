"""none notification strategy: a black hole that drops every payload.

A notification_channels row with strategy="none" accepts the event + payload and
does nothing with them. Point any consumer (a task's channel, the ESPN alerts
channel, ...) at a none channel to silence it cleanly without special-casing the
caller — the channel abstraction stays uniform, the delivery is just a no-op.
"""
from app.services.notifications.base import NotificationStrategy


class NoneStrategy(NotificationStrategy):
    name = "none"

    async def send(self, *, config: dict, event: str, payload: dict) -> None:
        return  # intentionally deliver nothing
