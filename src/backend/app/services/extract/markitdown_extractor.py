"""Default extractor: Microsoft MarkItDown → structure-preserving markdown.

MarkItDown's API is synchronous, so we run it in a worker thread
(anyio.to_thread) to avoid blocking the task's event loop. Format detection is
driven by the filename/mime we already hold; MarkItDown handles
PDF/DOCX/PPTX/XLSX/HTML/CSV/MD/TXT and more from a single entry point.
"""
import io
import logging

import anyio
from markitdown import (
    FileConversionException,
    MarkItDown,
    MissingDependencyException,
    UnsupportedFormatException,
)
from markitdown._stream_info import StreamInfo

from app.services.extract.base import ExtractError, Extractor

logger = logging.getLogger(__name__)


class MarkItDownExtractor(Extractor):
    name = "markitdown"

    def __init__(self) -> None:
        self._md = MarkItDown()

    def _convert_sync(self, data: bytes, filename: str, mime: str | None) -> str:
        stream_info = StreamInfo(filename=filename, mimetype=mime or None)
        try:
            result = self._md.convert_stream(io.BytesIO(data), stream_info=stream_info)
        except (UnsupportedFormatException, FileConversionException) as exc:
            # Bad/unsupported content — re-running won't fix it.
            raise ExtractError(f"{type(exc).__name__}: {exc}", retriable=False) from exc
        except MissingDependencyException as exc:
            # Misconfiguration (missing optional dep) — surface, don't churn retries.
            raise ExtractError(f"{type(exc).__name__}: {exc}", retriable=False) from exc
        text = (result.text_content or "").strip()
        if not text:
            raise ExtractError("Extraction produced empty text", retriable=False)
        return text

    async def extract(self, data: bytes, filename: str, mime: str | None) -> str:
        return await anyio.to_thread.run_sync(self._convert_sync, data, filename, mime)


markitdown_extractor = MarkItDownExtractor()
