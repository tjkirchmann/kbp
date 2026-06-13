from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AiCall(Base):
    """A durable LLM structured-output call (the ledger row).

    The `ai_call` task is the only thing that runs these; the row is the source of
    truth, surviving process crashes and driving Procrastinate retries. `request`
    holds the messages + JSON schema; `response` holds the validated data on
    success. Two retry axes are recorded separately: `attempts` (task-level
    transport retries) and `reprompts` (in-task structure-repair turns).
    `document_id` is null for direct-text calls. `job_id` links the run history.
    """

    __tablename__ = "ai_call"
    __table_args__ = (
        Index("ix_ai_call_status", "status"),
        Index("ix_ai_call_created_at", "created_at"),
        Index("ix_ai_call_document_id", "document_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # pending → running → succeeded | failed
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="pending")
    document_id: Mapped[int | None] = mapped_column(
        ForeignKey("document.id", ondelete="SET NULL"), nullable=True
    )
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    request: Mapped[dict] = mapped_column(JSONB, nullable=False)
    response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    # Last raw model text when structure validation ultimately failed (debugging).
    raw_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    reprompts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    job_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )
