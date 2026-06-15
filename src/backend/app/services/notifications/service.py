import logging

from app.services.notifications.base import NotificationStrategy
from app.services.notifications.discord import DiscordStrategy
from app.services.notifications.discord_bot import DiscordBotStrategy

logger = logging.getLogger(__name__)


class NotificationService:
    """Routes a notification to a registered strategy by name.

    Strategies unpack the arbitrary `payload` themselves. The service never
    raises into its caller: an unknown strategy, empty target, or delivery error
    is logged and swallowed, so notifications can't break the work that triggers
    them (critical inside Procrastinate tasks with retry=0).
    """

    def __init__(self, strategies: dict[str, NotificationStrategy] | None = None):
        self._strategies: dict[str, NotificationStrategy] = strategies or {
            DiscordStrategy.name: DiscordStrategy(),
            DiscordBotStrategy.name: DiscordBotStrategy(),
        }

    def register(self, strategy: NotificationStrategy) -> None:
        self._strategies[strategy.name] = strategy

    async def notify(self, *, strategy: str, config: dict, event: str, payload: dict) -> None:
        impl = self._strategies.get(strategy)
        if impl is None:
            logger.warning("Unknown notification strategy %r; skipping", strategy)
            return
        try:
            await impl.send(config=config, event=event, payload=payload)
        except Exception:
            logger.exception("Notification delivery failed (strategy=%s event=%s)", strategy, event)


notification_service = NotificationService()
