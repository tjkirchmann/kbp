from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

_db_url = settings.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
engine = create_async_engine(_db_url, echo=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# NullPool engine for Celery tasks: each asyncio.run() gets a fresh connection,
# preventing asyncpg state leakage across event loop boundaries.
_task_engine = create_async_engine(_db_url, echo=True, poolclass=NullPool)
TaskSessionLocal = async_sessionmaker(_task_engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
