"""
Shared MCP tool implementations.

All tool functions follow the same pattern:
1. Accept typed parameters (MCP serializes/deserializes JSON)
2. Use shared.db.get_db() for read-only DB access
3. Return JSON-serializable results (list of dicts, or a summary dict)

Tools:
  search_teams       — find teams by name, school, conference, or abbreviation
  search_conferences — find conferences by name or abbreviation
  search_venues      — find venues by name, city, or state
  list_seasons       — available seasons for a given table
  list_stat_names    — distinct stat names/categories for an EAV table
  list_tables        — describe all available CFBD tables with columns
  query_cfbd         — parameterized query builder
  execute_sql        — raw SELECT (private-only, cfbd_* only, 60s timeout)
"""

from __future__ import annotations

from typing import Any

from shared.db import get_db
from shared.models import get_table, get_user_tables, TableInfo
from shared.query_builder import build_query, QueryBuilderError
from shared.security import validate_sql, execute_with_timeout, SqlSecurityError

# ═══════════════════════════════════════════════════════════════════════════
# Lookup tools
# ═══════════════════════════════════════════════════════════════════════════


async def search_teams(
    query: str = "",
    conference: str = "",
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Search for CFBD teams by name, school, mascot, abbreviation, or conference.

    Args:
        query: Search text (matches school, mascot, abbreviation). Case-insensitive.
        conference: Filter by conference name (e.g. "SEC"). Case-insensitive.
        limit: Max results (default 50).
    """
    limit = min(limit, 100)
    conditions = []
    params: list[Any] = []
    p_idx = 0

    if query:
        p_idx += 1
        conditions.append(
            f"(school ILIKE ${p_idx} OR mascot ILIKE ${p_idx} OR abbreviation ILIKE ${p_idx})"
        )
        params.append(f"%{query}%")

    if conference:
        p_idx += 1
        conditions.append(f"conference ILIKE ${p_idx}")
        params.append(f"%{conference}%")

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    p_idx += 1
    sql = (
        f"SELECT id, school, mascot, abbreviation, conference, division, classification "
        f"FROM cfbd_teams {where} ORDER BY school LIMIT ${p_idx}"
    )
    params.append(limit)

    async with get_db() as conn:
        rows = await conn.fetch(sql, *params)
    return [_serialize_row(r) for r in rows]


async def search_conferences(
    query: str = "",
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Search for conferences by name, short_name, or abbreviation.

    Args:
        query: Search text. Case-insensitive.
        limit: Max results (default 50).
    """
    limit = min(limit, 100)
    params: list[Any] = []
    if query:
        sql = (
            "SELECT id, name, short_name, abbreviation, classification "
            "FROM cfbd_conferences "
            "WHERE name ILIKE $1 OR short_name ILIKE $1 OR abbreviation ILIKE $1 "
            "ORDER BY name LIMIT $2"
        )
        params = [f"%{query}%", limit]
    else:
        sql = (
            "SELECT id, name, short_name, abbreviation, classification "
            "FROM cfbd_conferences ORDER BY name LIMIT $1"
        )
        params = [limit]

    async with get_db() as conn:
        rows = await conn.fetch(sql, *params)
    return [_serialize_row(r) for r in rows]


async def search_venues(
    query: str = "",
    city: str = "",
    state: str = "",
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Search for venues by name, city, or state.

    Args:
        query: Search text (matches venue name). Case-insensitive.
        city: Filter by city name. Case-insensitive.
        state: Filter by state abbreviation (e.g. "TX").
        limit: Max results (default 50).
    """
    limit = min(limit, 100)
    conditions = []
    params: list[Any] = []
    p_idx = 0

    if query:
        p_idx += 1
        conditions.append(f"name ILIKE ${p_idx}")
        params.append(f"%{query}%")
    if city:
        p_idx += 1
        conditions.append(f"city ILIKE ${p_idx}")
        params.append(f"%{city}%")
    if state:
        p_idx += 1
        conditions.append(f"state ILIKE ${p_idx}")
        params.append(f"%{state}%")

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    p_idx += 1
    sql = (
        f"SELECT id, name, city, state, capacity, grass, dome "
        f"FROM cfbd_venues {where} ORDER BY name LIMIT ${p_idx}"
    )
    params.append(limit)

    async with get_db() as conn:
        rows = await conn.fetch(sql, *params)
    return [_serialize_row(r) for r in rows]


async def list_seasons(table_name: str) -> dict[str, Any]:
    """List distinct season values for a given CFBD table.

    Args:
        table_name: CFBD table name (e.g. "cfbd_sp_ratings").
    """
    table = get_table(table_name)
    if table is None:
        raise ValueError(f"Unknown table: {table_name}")

    if not table.season_columns:
        return {
            "table": table_name,
            "seasons": [],
            "note": f"Table '{table_name}' has no season/year column.",
        }

    # Use the first season column — include row counts per season
    col = table.season_columns[0]
    sql = f"SELECT {col} AS season, COUNT(*) AS row_count FROM {table.name} GROUP BY {col} ORDER BY {col}"
    async with get_db() as conn:
        rows = await conn.fetch(sql)
    seasons = [{"season": r["season"], "row_count": r["row_count"]} for r in rows]
    return {"table": table_name, "season_column": col, "seasons": seasons}


async def list_stat_names(table_name: str, query: str = "") -> dict[str, Any]:
    """List distinct stat names/categories for an EAV table.

    Args:
        table_name: EAV table name (e.g. "cfbd_team_season_stats").
        query: Optional search filter for stat names. Case-insensitive.
    """
    table = get_table(table_name)
    if table is None:
        raise ValueError(f"Unknown table: {table_name}")
    if not table.eav:
        raise ValueError(f"Table '{table_name}' is not an EAV table.")

    # Determine which column holds the stat name
    stat_col = _eav_stat_column(table)
    if stat_col is None:
        return {"table": table_name, "stats": [], "note": "Could not determine stat column."}

    params: list[Any] = []
    if query:
        sql = (
            f"SELECT DISTINCT {stat_col} AS stat_name "
            f"FROM {table.name} WHERE {stat_col} ILIKE $1 "
            f"ORDER BY {stat_col} LIMIT 200"
        )
        params = [f"%{query}%"]
    else:
        sql = (
            f"SELECT DISTINCT {stat_col} AS stat_name "
            f"FROM {table.name} ORDER BY {stat_col} LIMIT 200"
        )

    async with get_db() as conn:
        rows = await conn.fetch(sql, *params)
    stats = [r["stat_name"] for r in rows]
    return {"table": table_name, "stat_column": stat_col, "stats": stats}


def _eav_stat_column(table: TableInfo) -> str | None:
    """Determine the stat-name column for an EAV table."""
    candidates = {
        "cfbd_game_team_stats": "category",
        "cfbd_team_season_stats": "stat_name",
        "cfbd_team_season_adv_stats": "stat",
        "cfbd_player_season_stats": "category",
        "cfbd_game_player_stats": "category",
        "cfbd_play_stats": "stat_type",
    }
    return candidates.get(table.name)


async def list_tables() -> dict[str, Any]:
    """List all available CFBD tables with descriptions and columns."""
    user_tables = get_user_tables()
    result = []
    for t in user_tables:
        result.append({
            "name": t.name,
            "description": t.description,
            "dimension": t.dimension,
            "eav": t.eav,
            "columns": [
                {"name": c.name, "type": c.type, "primary_key": c.primary_key}
                for c in t.columns
            ],
            "season_columns": t.season_columns,
        })
    return {"tables": result, "count": len(result)}


# ═══════════════════════════════════════════════════════════════════════════
# Query builder tool
# ═══════════════════════════════════════════════════════════════════════════


async def query_cfbd(
    table: str,
    select: list[str] | None = None,
    filters: list[dict[str, Any]] | None = None,
    group_by: list[str] | None = None,
    order_by: list[str] | None = None,
    joins: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Execute a parameterized query against CFBD tables with optional INNER JOINs.

    Builds a safe, parameterized SELECT query using filter operators,
    aggregation functions, grouping, ordering, and INNER JOINs.
    No row limit — returns all matching rows.

    Single-table (backward compatible):
        {"table": "cfbd_sp_ratings", "select": ["team", "rating"],
         "filters": [{"column": "year", "op": "gte", "value": 2020}]}

    Multi-table with joins (requires "table.column" notation):
        {"table": "cfbd_games",
         "joins": [{"table": "cfbd_teams", "on": "cfbd_games.home_team = cfbd_teams.school"}],
         "select": ["cfbd_games.id", "cfbd_teams.mascot"],
         "filters": [{"column": "cfbd_games.season_year", "op": "gte", "value": 2024}]}

    Args:
        table: Primary CFBD table name (required).
        joins: Optional INNER JOINs. ON clause uses "table.column = table.column".
               When joins present, ALL column refs must use "table.column" notation.
        select: Columns/aggregations. Use "table.column" when joins present.
        filters: List of {"column", "op", "value"} dicts. 11 filter ops available.
        group_by: Columns to group by.
        order_by: Columns to order by. Prefix with '-' for descending.

    Returns:
        Dict with keys: tables, sql, params, rows, row_count.
    """
    # Validate primary table
    table_info = get_table(table)
    if table_info is None:
        raise ValueError(
            f"Unknown table: {table}. Use list_tables to see available tables."
        )

    # Build query
    try:
        sql, params = build_query(
            table=table_info,
            select=select,
            filters=filters,
            group_by=group_by,
            order_by=order_by,
            joins=joins,
        )
    except QueryBuilderError as e:
        raise ValueError(str(e)) from e

    # Execute
    async with get_db() as conn:
        rows = await conn.fetch(sql, *params)

    # Collect table names in query
    tables = [table]
    if joins:
        for j in joins:
            tables.append(j["table"])

    return {
        "tables": tables,
        "sql": sql,
        "params": [_safe_param(p) for p in params],
        "rows": [_serialize_row(r) for r in rows],
        "row_count": len(rows),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Relationship explorer
# ═══════════════════════════════════════════════════════════════════════════


async def explore_relationships(table_name: str) -> dict[str, Any]:
    """Show valid join paths for a CFBD table.

    Returns joins_from (this table's columns that join TO other tables)
    and joins_to (other tables that join TO this table). Use this to
    discover valid joins before constructing a query_cfbd with joins.

    Args:
        table_name: CFBD table name (e.g. "cfbd_games", "cfbd_plays").
    """
    if get_table(table_name) is None:
        raise ValueError(
            f"Unknown table: {table_name}. Use list_tables to see available tables."
        )
    return get_relationships(table_name)


# ═══════════════════════════════════════════════════════════════════════════
# Private-only: raw SQL execution
# ═══════════════════════════════════════════════════════════════════════════


async def execute_sql(
    sql: str,
    file_path: str | None = None,
) -> dict[str, Any]:
    """Execute a raw SELECT query against CFBD tables.

    PRIVATE SERVER ONLY. Validates that the query is SELECT-only and
    references only cfbd_* tables. Results can optionally be written to
    a CSV file on the server.

    Args:
        sql: Raw SQL SELECT query.
        file_path: Optional filename (without path) to write CSV results.
                   File is written to the server's results/ directory.

    Returns:
        Dict with keys: sql, rows, row_count, file_path (if written).
    """
    # Security validation
    try:
        validate_sql(sql)
    except SqlSecurityError as e:
        raise ValueError(str(e)) from e

    # Execute with timeout
    try:
        async with get_db() as conn:
            rows = await execute_with_timeout(conn, sql)
    except Exception as e:
        raise ValueError(f"Query execution failed: {e}") from e

    result: dict[str, Any] = {
        "sql": sql,
        "rows": [_serialize_row(r) for r in rows],
        "row_count": len(rows),
    }

    # Optional CSV export
    if file_path and rows:
        written = await _write_csv(file_path, rows)
        result["file_path"] = written

    return result


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════


def _serialize_row(row: Any) -> dict[str, Any]:
    """Convert an asyncpg Record to a plain dict with JSON-safe values."""
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


def _safe_param(p: Any) -> str:
    """Represent a bind parameter safely for display."""
    if isinstance(p, list):
        return f"[{len(p)} items]"
    return str(p)


def _results_dir() -> str:
    """Get the results output directory from env or default."""
    import os
    return os.environ.get(
        "MCP_RESULTS_DIR",
        os.path.join(os.path.dirname(__file__), "..", "private_server", "results"),
    )


async def _write_csv(filename: str, rows: list[dict[str, Any]]) -> str:
    """Write rows to a CSV file in the results/ directory."""
    import csv
    import os
    from io import StringIO

    # Security: only allow simple filenames, no path traversal
    safe_name = os.path.basename(filename)
    if safe_name != filename or not safe_name:
        raise ValueError(f"Invalid filename: {filename}. Use a simple name like 'output.csv'.")

    results_dir = _results_dir()
    os.makedirs(results_dir, exist_ok=True)
    filepath = os.path.join(results_dir, safe_name)

    if not rows:
        return filepath

    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

    with open(filepath, "w", newline="") as f:
        f.write(output.getvalue())

    return filepath
