"""
SQL security guardrails for the private server's execute_sql tool.

Enforces:
- SELECT-only queries including WITH CTEs (no DDL, DML, DCL)
- CFBD tables only (must reference at least one cfbd_* table)
- 60-second query timeout
"""

from __future__ import annotations

import re
from typing import Any

import asyncpg

# All known CFBD table names (populated at import time from models registry)
_CFBD_TABLE_NAMES: set[str] = set()

# SQL keywords that indicate non-SELECT operations
_DISALLOWED_KEYWORDS: set[str] = {
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
    "TRUNCATE", "GRANT", "REVOKE", "COPY", "VACUUM", "ANALYZE",
    "REINDEX", "CLUSTER", "SET", "BEGIN", "COMMIT", "ROLLBACK",
    "SAVEPOINT", "LOCK", "PREPARE", "EXECUTE", "DEALLOCATE",
    "DISCARD", "LISTEN", "NOTIFY", "UNLISTEN", "MOVE", "FETCH",
    "CLOSE", "DECLARE", "EXPLAIN",
}


class SqlSecurityError(ValueError):
    """Raised when SQL fails security validation."""


def _init_cfbd_tables() -> None:
    """Populate the CFBD table name set from the models registry."""
    global _CFBD_TABLE_NAMES
    if _CFBD_TABLE_NAMES:
        return
    from shared.models import TABLES
    _CFBD_TABLE_NAMES = {t.name for t in TABLES}


def validate_sql(sql: str) -> None:
    """Validate that SQL is a SELECT-only query against cfbd_* tables.

    Raises SqlSecurityError if validation fails.
    """
    _init_cfbd_tables()
    stripped = sql.strip()

    # Must start with SELECT or WITH (CTE) — case-insensitive
    if not re.match(r"^\s*(SELECT|WITH)\b", stripped, re.IGNORECASE):
        raise SqlSecurityError(
            "Only SELECT queries (including WITH CTEs) are allowed. "
            f"Query starts with: {stripped[:50]}..."
        )

    # If it starts with WITH, ensure it eventually contains a SELECT
    if re.match(r"^\s*WITH\b", stripped, re.IGNORECASE):
        if not re.search(r"\bSELECT\b", stripped, re.IGNORECASE):
            raise SqlSecurityError(
                "CTE queries (WITH) must contain a SELECT statement."
            )

    # Check for disallowed keywords (simple word-boundary scan)
    upper = stripped.upper()
    for keyword in _DISALLOWED_KEYWORDS:
        if re.search(rf"\b{keyword}\b", upper):
            raise SqlSecurityError(
                f"Disallowed SQL keyword detected: {keyword}"
            )

    # Must reference at least one cfbd_ table
    table_refs = set(re.findall(r'\b(cfbd_[a-z_]+)\b', stripped, re.IGNORECASE))
    allowed = table_refs & _CFBD_TABLE_NAMES
    if not allowed:
        raise SqlSecurityError(
            "Query must reference at least one CFBD table "
            f"(cfbd_*). Valid tables: {sorted(_CFBD_TABLE_NAMES)}"
        )


async def execute_with_timeout(
    conn: asyncpg.Connection,
    sql: str,
    timeout_ms: int = 60_000,
) -> list[dict[str, Any]]:
    """Execute a SQL query with a statement timeout.

    validate_sql() should be called first to ensure the query is safe.

    Args:
        conn: asyncpg connection.
        sql: Validated SELECT query.
        timeout_ms: Statement timeout in milliseconds (default 60s).

    Returns:
        List of row dicts.

    Raises:
        asyncpg.exceptions.QueryCanceledError if timeout is exceeded.
    """
    await conn.execute(f"SET LOCAL statement_timeout = {timeout_ms}")
    records = await conn.fetch(sql)
    return [dict(r) for r in records]
