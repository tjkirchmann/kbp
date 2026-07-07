"""
Database connection for MCP servers.

Provides a read-only asyncpg connection pool (NullPool) using the
mcp_readonly Postgres user. The connection string comes from the
MCP_DATABASE_URL environment variable.

In-transaction read-only is enforced by executing
  SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY
on every new connection.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg

_MCP_DATABASE_URL = os.environ.get(
    "MCP_DATABASE_URL",
    "postgresql+asyncpg://mcp_readonly:mcp_readonly@localhost:5432/app",
)
# asyncpg wants the raw postgresql:// scheme, not postgresql+asyncpg://
_DSN = _MCP_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

_pool: asyncpg.Pool | None = None


async def _init_pool() -> asyncpg.Pool:
    """Create or return the shared connection pool."""
    global _pool
    if _pool is not None:
        return _pool
    _pool = await asyncpg.create_pool(
        _DSN,
        min_size=1,
        max_size=2,
        init=_set_read_only,
    )
    return _pool


async def _set_read_only(conn: asyncpg.Connection) -> None:
    """Enforce read-only transactions on every connection."""
    await conn.execute(
        "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY"
    )


@asynccontextmanager
async def get_db() -> AsyncIterator[asyncpg.Connection]:
    """Async context manager yielding a read-only asyncpg connection."""
    pool = await _init_pool()
    async with pool.acquire() as conn:
        yield conn


async def close_pool() -> None:
    """Close the connection pool (call during server shutdown)."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
