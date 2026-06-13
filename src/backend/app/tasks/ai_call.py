"""Durable LLM structured-output task (the only executor of AI calls).

Each call is a distinct job (no queueing_lock). The ledger row is the source of
truth: a crash mid-run leaves a `running` row that Procrastinate retries (retry=3).
Two retry axes: transport failures re-raise here for a whole-task retry; structure
failures are handled inside run_structured's reprompt loop and arrive here only as
a terminal LLMStructureError (no transport retry — re-running wouldn't help).
"""
import logging
from typing import Any

from procrastinate import JobContext

from app.core.database import TaskSessionLocal as SessionLocal
from app.core.procrastinate import procrastinate_app as app
from app.services.documents import get_document
from app.services.llm.errors import LLMError
from app.services.llm.ledger import create_call, get_call, mark_failed, mark_running, mark_succeeded
from app.services.llm.openrouter import run_structured
from app.tasks.notify_decorator import notify

logger = logging.getLogger(__name__)


def _build_messages(messages_template: list[dict], doc_text: str | None) -> list[dict]:
    """Substitute {document} in each message's content with the extracted text.

    Keeps the call signature simple: callers write a normal messages list using
    a {document} placeholder; we inject the (possibly large) text at run time so it
    isn't duplicated in the deferred-job kwargs.
    """
    if doc_text is None:
        return messages_template
    out = []
    for m in messages_template:
        content = m.get("content", "")
        if isinstance(content, str) and "{document}" in content:
            content = content.replace("{document}", doc_text)
        out.append({**m, "content": content})
    return out


@app.task(name="ai_call", retry=3, pass_context=True)
@notify(task_name="ai_call")
async def run_ai_call(
    context: JobContext,
    *,
    schema: dict,
    schema_name: str,
    messages_template: list[dict],
    document_id: int | None = None,
    model: str | None = None,
    ai_call_id: int | None = None,
    timestamp: int | None = None,
) -> dict[str, Any]:
    job_id = context.job.id
    async with SessionLocal() as db:
        doc_text = None
        if document_id is not None:
            doc = await get_document(db, document_id)
            doc_text = doc.text if doc else None
        messages = _build_messages(messages_template, doc_text)

        # Reuse an existing ledger row on retry; otherwise create one.
        if ai_call_id is not None:
            call = await get_call(db, ai_call_id)
        else:
            call = await create_call(
                db,
                request={
                    "messages_template": messages_template,
                    "schema": schema,
                    "schema_name": schema_name,
                    "model": model,
                    "document_id": document_id,
                },
                document_id=document_id,
                model=model,
            )
            await db.commit()
        call_id = call.id

        await mark_running(db, call_id, job_id=job_id)
        await db.commit()

        try:
            result = await run_structured(
                db, messages=messages, schema=schema, schema_name=schema_name, model=model,
            )
        except LLMError as exc:
            await mark_failed(db, call_id, exc, raw_output=getattr(exc, "raw", None))
            await db.commit()
            if exc.retriable:
                raise  # transport retry via Procrastinate (retry=3)
            return {"ai_call_id": call_id, "status": "failed"}

        await mark_succeeded(db, call_id, result)
        await db.commit()
        return {
            "ai_call_id": call_id,
            "status": "succeeded",
            "reprompts": result.reprompts_used,
            "total_tokens": result.usage.total_tokens,
        }
