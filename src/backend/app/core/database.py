from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import settings

_db_url = settings.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
engine = create_async_engine(_db_url, echo=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# NullPool engine for background tasks: a fresh connection per use avoids
# asyncpg state leakage and keeps task DB access independent of the API pool.
_task_engine = create_async_engine(_db_url, echo=True, poolclass=NullPool)
TaskSessionLocal = async_sessionmaker(_task_engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
