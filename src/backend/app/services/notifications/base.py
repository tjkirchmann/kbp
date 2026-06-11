from abc import ABC, abstractmethod


class NotificationStrategy(ABC):
    """Delivers a notification for a single backend (Discord, Slack, email, ...).

    A strategy receives a channel's arbitrary `config` JSON (its destination
    settings, e.g. {"webhook_url": ...}) and the event `payload`, and is
    responsible for unpacking both into whatever wire format its backend wants.
    """

    name: str

    @abstractmethod
    async def send(self, *, config: dict, event: str, payload: dict) -> None:
        """Unpack `config` + `payload` for this backend and deliver."""
