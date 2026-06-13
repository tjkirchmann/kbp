"""Public entry point for durable document analysis.

The ONLY way to start an analysis. Callers never touch the SDK or MarkItDown
directly — those are private to the tasks. ingest_and_analyze stores the document,
pre-creates the AiCall ledger row (so it's pollable immediately), defers the extract
task (which chains to ai_call on success), and optionally awaits a terminal state.

Durable: the worker owns execution, so if the API process dies mid-await the rows
still progress and the result is in the DB for a later poll.
"""
import asyncio
import logging

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_call import AiCall
from app.models.document import Document
from app.services import documents
from app.services.llm.ledger import create_call, get_call
from app.tasks.ai_call import run_ai_call
from app.tasks.extract import run_extract

logger = logging.getLogger(__name__)

_POLL_INTERVAL_SECONDS = 1.0
_TERMINAL = {"succeeded", "failed"}


def _analyze_payload(
    output_model: type[BaseModel], messages_template: list[dict],
    model: str | None, ai_call_id: int, document_id: int | None,
) -> dict:
    return {
        "schema": output_model.model_json_schema(),
        "schema_name": output_model.__name__,
        "messages_template": messages_template,
        "model": model,
        "ai_call_id": ai_call_id,
        "document_id": document_id,
    }


async def _make_call_row(
    db: AsyncSession, output_model, messages_template, model, document_id
) -> AiCall:
    return await create_call(
        db,
        request={
            "messages_template": messages_template,
            "schema": output_model.model_json_schema(),
            "schema_name": output_model.__name__,
            "model": model,
            "document_id": document_id,
        },
        document_id=document_id,
        model=model,
    )


async def ingest_and_analyze(
    db: AsyncSession,
    *,
    filename: str,
    data: bytes,
    mime: str | None,
    output_model: type[BaseModel],
    messages_template: list[dict],
    model: str | None = None,
    await_seconds: float | None = 90,
) -> AiCall:
    """Ingest a document and run structured analysis over it, durably.

    Returns the AiCall row. With await_seconds set, blocks (polling) until the call
    reaches a terminal state or the timeout; with None, returns the pending row
    immediately (fire-and-forget — poll later).
    """
    doc = await documents.ingest(db, filename, data, mime)
    call = await _make_call_row(db, output_model, messages_template, model, doc.id)
    await db.commit()

    analyze = _analyze_payload(output_model, messages_template, model, call.id, doc.id)
    await run_extract.defer_async(document_id=doc.id, analyze=analyze)

    if await_seconds is None:
        return call
    return await _await_call(db, call.id, await_seconds)


async def analyze_existing(
    db: AsyncSession,
    *,
    document_id: int,
    output_model: type[BaseModel],
    messages_template: list[dict],
    model: str | None = None,
    await_seconds: float | None = 90,
) -> AiCall:
    """Re-run analysis on an already-extracted document (no re-extraction)."""
    call = await _make_call_row(db, output_model, messages_template, model, document_id)
    await db.commit()

    await run_ai_call.defer_async(
        **_analyze_payload(output_model, messages_template, model, call.id, document_id)
    )

    if await_seconds is None:
        return call
    return await _await_call(db, call.id, await_seconds)


async def _await_call(db: AsyncSession, call_id: int, timeout: float) -> AiCall:
    """Poll the ledger row until terminal or timeout. Returns the row either way."""
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        await db.commit()  # end the txn so we read the worker's committed updates
        call = await get_call(db, call_id)
        if call is not None and call.status in _TERMINAL:
            return call
        if asyncio.get_event_loop().time() >= deadline:
            return call  # still pending/running — caller polls GET /ai/calls/{id}
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
