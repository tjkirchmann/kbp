"""Document extraction seam.

One default path (MarkItDown) normalizes any textual format to markdown today; the
Extractor ABC lets a per-format override slot in later without touching callers.
"""
from abc import ABC, abstractmethod


class ExtractError(Exception):
    """Extraction failed.

    `retriable` distinguishes transient I/O (re-run the task) from a genuinely
    unparseable / unsupported document (terminal — re-running won't help).
    """

    def __init__(self, message: str, *, retriable: bool = False):
        super().__init__(message)
        self.retriable = retriable


class Extractor(ABC):
    name: str

    @abstractmethod
    async def extract(self, data: bytes, filename: str, mime: str | None) -> str:
        """Return normalized markdown text for a document's raw bytes.

        Raises ExtractError on failure (retriable flag set appropriately).
        """
