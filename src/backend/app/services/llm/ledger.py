"""AiCall ledger: the durable record of an LLM structured-output call.

The ai_call task drives create_call → mark_running → mark_succeeded/mark_failed,
committing at each transition so a crash leaves an accurate row. `request` stores
the messages + schema; on success `response` holds the validated data.
"""
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_call import AiCall
from app.services.llm.errors import LLMError
from app.services.llm.openrouter import StructuredResult


async def create_call(
    db: AsyncSession, request: dict, document_id: int | None = None, model: str | None = None
) -> AiCall:
    """Insert a pending AiCall and flush to populate its id. Caller commits."""
    call = AiCall(status="pending", request=request, document_id=document_id, model=model)
    db.add(call)
    await db.flush()
    return call


async def get_call(db: AsyncSession, call_id: int) -> AiCall | None:
    return (
        await db.execute(select(AiCall).where(AiCall.id == call_id))
    ).scalar_one_or_none()


async def mark_running(db: AsyncSession, call_id: int, job_id: int | None) -> None:
    await db.execute(
        update(AiCall)
        .where(AiCall.id == call_id)
        .values(status="running", job_id=job_id, attempts=AiCall.attempts + 1)
    )


async def mark_succeeded(db: AsyncSession, call_id: int, result: StructuredResult) -> None:
    await db.execute(
        update(AiCall)
        .where(AiCall.id == call_id)
        .values(
            status="succeeded",
            response=result.data,
            model=result.model,
            reprompts=result.reprompts_used,
            prompt_tokens=result.usage.prompt_tokens,
            completion_tokens=result.usage.completion_tokens,
            total_tokens=result.usage.total_tokens,
            error=None,
        )
    )


async def mark_failed(
    db: AsyncSession, call_id: int, error: LLMError, raw_output: str | None = None
) -> None:
    await db.execute(
        update(AiCall)
        .where(AiCall.id == call_id)
        .values(
            status="failed",
            error=f"{type(error).__name__}: {error}",
            raw_output=raw_output,
        )
    )
