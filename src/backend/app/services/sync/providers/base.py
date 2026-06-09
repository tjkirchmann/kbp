from abc import ABC, abstractmethod
from typing import Any


class SyncProvider(ABC):
    """Base for an external data source (CFBD, ESPN, etc).

    Concrete providers wrap HTTP clients and expose `fetch(endpoint, **params)`.
    """

    name: str

    @abstractmethod
    async def fetch(self, endpoint: str, **params: Any) -> Any:
        """Fetch a payload from the provider. Implementation-defined endpoint key."""
