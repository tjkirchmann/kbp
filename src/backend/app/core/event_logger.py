from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event_log import EventLog


async def log_event(db: AsyncSession, source: str, event: str, payload: dict) -> None:
    """Append an operational event. The caller commits."""
    db.add(EventLog(source=source, event=event, payload=payload))
