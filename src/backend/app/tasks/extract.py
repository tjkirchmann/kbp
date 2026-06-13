"""Durable document-extraction task.

Stage 1 of the pipeline: load source bytes from object storage, normalize to
markdown (MarkItDown), persist on the Document row. Idempotent by content hash;
transport/I-O failures re-raise for a whole-task retry, unparseable documents fail
terminally. On success, optionally chains to the ai_call task (the `analyze`
payload, including a pre-created ai_call_id so the analysis row is pollable).
"""
import logging
from typing import Any

from procrastinate import JobContext

from app.core import storage
from app.core.database import TaskSessionLocal as SessionLocal
from app.core.event_logger import log_event
from app.core.procrastinate import procrastinate_app as app
from app.services.documents import get_document, mark_extracted, mark_extracting, mark_failed
from app.services.extract import ExtractError, markitdown_extractor
from app.tasks.ai_call import run_ai_call
from app.tasks.notify_decorator import notify

logger = logging.getLogger(__name__)


@app.task(name="extract", retry=3, pass_context=True)
@notify(task_name="extract")
async def run_extract(
    context: JobContext,
    *,
    document_id: int,
    analyze: dict | None = None,
    timestamp: int | None = None,
) -> dict[str, Any]:
    job_id = context.job.id
    async with SessionLocal() as db:
        doc = await get_document(db, document_id)
        if doc is None:
            logger.warning("extract: document %s not found", document_id)
            return {"document_id": document_id, "status": "missing"}

        await mark_extracting(db, document_id, job_id=job_id)
        await db.commit()

        try:
            data = await storage.get(doc.storage_key)
            text = await markitdown_extractor.extract(data, doc.filename, doc.mime)
        except ExtractError as exc:
            await mark_failed(db, document_id, f"{type(exc).__name__}: {exc}")
            await log_event(db, "extract", "failed",
                            {"document_id": document_id, "error": str(exc)})
            await db.commit()
            if exc.retriable:
                raise
            return {"document_id": document_id, "status": "failed"}
        except Exception as exc:
            # Storage/network errors → retriable transport failure.
            await mark_failed(db, document_id, f"{type(exc).__name__}: {exc}")
            await log_event(db, "extract", "error",
                            {"document_id": document_id, "error": str(exc)})
            await db.commit()
            raise

        await mark_extracted(db, document_id, text)
        await log_event(db, "extract", "ok", {"document_id": document_id, "chars": len(text)})
        await db.commit()

    if analyze:
        await run_ai_call.defer_async(document_id=document_id, **analyze)

    return {"document_id": document_id, "status": "extracted", "chars": len(text)}
