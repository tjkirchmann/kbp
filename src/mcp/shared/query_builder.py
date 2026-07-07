"""
Parameterized query builder for CFBD tables.

Builds safe, parameterized SQL queries from structured inputs. Every
user-supplied value becomes an asyncpg bind parameter ($1, $2, ...),
never string-interpolated. Table and column names are validated against
the metadata registry.

Supports single-table queries (backward compatible) and multi-table
queries with INNER JOINs.

Single-table (no joins):
    sql, params = build_query(
        table=get_table("cfbd_sp_ratings"),
        select=["team", "rating"],
        filters=[{"column": "year", "op": "gte", "value": 2020}],
        order_by=["-rating"],
    )

Multi-table (with joins — columns MUST use "table.column" notation):
    sql, params = build_query(
        table=get_table("cfbd_games"),
        joins=[{"table": "cfbd_teams", "on": "cfbd_games.home_team = cfbd_teams.school"}],
        select=["cfbd_games.id", "cfbd_games.start_date", "cfbd_teams.mascot"],
        filters=[{"column": "cfbd_games.season_year", "op": "gte", "value": 2024}],
    )
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from shared.models import ColumnInfo, TableInfo, get_table as registry_get_table

# ── Filter operators ────────────────────────────────────────────────────────

FILTER_OPS: dict[str, str] = {
    "eq": "%s = %s",
    "neq": "%s != %s",
    "gt": "%s > %s",
    "gte": "%s >= %s",
    "lt": "%s < %s",
    "lte": "%s <= %s",
    "in": "%s = ANY(%s)",
    "like": "%s ILIKE %s",
    "between": "%s BETWEEN %s AND %s",
    "is_null": "%s IS NULL",
    "is_not_null": "%s IS NOT NULL",
}

AGG_FUNCS: dict[str, str] = {
    "count(*)": "COUNT(*)",
    "sum(": "SUM(",
    "avg(": "AVG(",
    "min(": "MIN(",
    "max(": "MAX(",
}

MANY_VALUE_OPS = {"in", "between"}

MAX_LIMIT = 100_000


class QueryBuilderError(ValueError):
    """Raised when query parameters don't validate against the registry."""


# ── Join spec ───────────────────────────────────────────────────────────────

@dataclass
class JoinSpec:
    """Parsed and validated join specification."""
    table: str          # table to join (from registry)
    on_left_table: str  # left side table
    on_left_col: str    # left side column
    on_right_table: str # right side table
    on_right_col: str   # right side column
    type: str = "inner"

    @property
    def sql(self) -> str:
        table_q = _quote_ident(self.table)
        left_q = f"{_quote_ident(self.on_left_table)}.{_quote_ident(self.on_left_col)}"
        right_q = f"{_quote_ident(self.on_right_table)}.{_quote_ident(self.on_right_col)}"
        return f"INNER JOIN {table_q} ON {left_q} = {right_q}"


def _parse_on_clause(on_clause: str, primary_table: str, join_table: str) -> tuple[str, str, str, str]:
    """Parse an ON clause like 't1.col = t2.col' into four parts.

    Returns (left_table, left_col, right_table, right_col).
    """
    parts = [p.strip() for p in on_clause.split("=")]
    if len(parts) != 2:
        raise QueryBuilderError(f"Invalid ON clause: '{on_clause}'. Expected 'table.column = table.column'.")

    left, right = parts

    # Parse left side
    if "." not in left:
        raise QueryBuilderError(f"ON clause must use 'table.column' notation: '{left}'")
    lt, lc = left.split(".", 1)

    # Parse right side
    if "." not in right:
        raise QueryBuilderError(f"ON clause must use 'table.column' notation: '{right}'")
    rt, rc = right.split(".", 1)

    # Validate tables are in the join set
    valid_tables = {primary_table, join_table}
    if lt not in valid_tables:
        raise QueryBuilderError(f"Unknown table '{lt}' in ON clause. Valid tables in this query: {valid_tables}")
    if rt not in valid_tables:
        raise QueryBuilderError(f"Unknown table '{rt}' in ON clause. Valid tables in this query: {valid_tables}")

    return lt, lc, rt, rc


# ── Column resolution ───────────────────────────────────────────────────────


def _resolve_column(
    table_or_tables: TableInfo | dict[str, TableInfo],
    name: str,
    joins_present: bool,
) -> tuple[str, ColumnInfo]:
    """Resolve a column reference to (quoted_full_name, ColumnInfo).

    When joins are present, name MUST be 'table.column'.
    Without joins, name is a plain column name.

    Returns (quoted_identifier, ColumnInfo).
    """
    # count(*) is always valid, even with joins
    if name.lower() == "count(*)":
        return "COUNT(*)", ColumnInfo(name="*", type="int")

    if not joins_present:
        # Single-table: extract the single TableInfo from the dict
        table = next(iter(table_or_tables.values()))  # type: ignore[union-attr]
        return _resolve_plain_column(table, name)

    # Multi-table: 'table.column'
    tables = table_or_tables  # type: ignore[assignment]
    if "." not in name:
        raise QueryBuilderError(
            f"Joins are present — use 'table.column' notation, "
            f"e.g. 'cfbd_games.id'. Got: '{name}'"
        )
    tbl, col = name.split(".", 1)
    if tbl not in tables:
        raise QueryBuilderError(
            f"Unknown table '{tbl}' in column reference '{name}'. "
            f"Available tables: {sorted(tables.keys())}"
        )
    return _resolve_plain_column(tables[tbl], col, prefix=tbl)


def _resolve_plain_column(
    table: TableInfo,
    name: str,
    prefix: str | None = None,
) -> tuple[str, ColumnInfo]:
    """Resolve a plain column name (or aggregation) against a single table."""
    # Handle aggregation expressions
    if name.lower() == "count(*)":
        return "COUNT(*)", ColumnInfo(name="*", type="int")

    for agg_prefix in ("sum(", "avg(", "min(", "max("):
        if name.lower().startswith(agg_prefix) and name.endswith(")"):
            inner = name[len(agg_prefix):-1].strip()
            inner_col = _find_column(table, inner)
            if inner_col is None:
                raise QueryBuilderError(
                    f"Unknown column '{inner}' in aggregation '{name}' "
                    f"for table '{table.name}'"
                )
            sql_func = AGG_FUNCS[agg_prefix]
            quoted = _qualify_col(inner_col.name, prefix) if prefix else _quote_ident(inner_col.name)
            alias = _safe_alias(name)
            return f"{sql_func}({quoted}) AS {alias}", inner_col

    # Plain column
    col = _find_column(table, name)
    if col is None:
        raise QueryBuilderError(
            f"Unknown column '{name}' for table '{table.name}'. "
            f"Available: {sorted(table.column_names)}"
        )
    quoted = _qualify_col(col.name, prefix) if prefix else _quote_ident(col.name)
    return quoted, col


def _qualify_col(col: str, prefix: str) -> str:
    return f"{_quote_ident(prefix)}.{_quote_ident(col)}"


def _find_column(table: TableInfo, name: str) -> ColumnInfo | None:
    """Case-insensitive column lookup."""
    name_lower = name.lower()
    for c in table.columns:
        if c.name.lower() == name_lower:
            return c
    return None


# ── SELECT clause ───────────────────────────────────────────────────────────


def _build_select(
    tables: dict[str, TableInfo],
    select: list[str] | None,
    joins_present: bool,
) -> tuple[str, list[Any]]:
    """Build SELECT clause."""
    if not select:
        return "*", []
    parts: list[str] = []
    for s in select:
        resolved, _ = _resolve_column(tables, s, joins_present)
        parts.append(resolved)
    return ", ".join(parts), []


# ── FROM + JOIN clause ──────────────────────────────────────────────────────


def _build_from(
    primary_table: TableInfo,
    joins: list[JoinSpec] | None,
) -> str:
    """Build FROM + JOIN clauses."""
    clauses = [f"FROM {_quote_ident(primary_table.name)}"]
    if joins:
        for j in joins:
            clauses.append(j.sql)
    return " ".join(clauses)


# ── WHERE clause ────────────────────────────────────────────────────────────


def _build_where(
    tables: dict[str, TableInfo],
    filters: list[dict[str, Any]] | None,
    joins_present: bool,
) -> tuple[str, list[Any]]:
    """Build WHERE clause from filter dicts."""
    if not filters:
        return "", []
    clauses: list[str] = []
    params: list[Any] = []
    for i, f in enumerate(filters):
        col_name = f.get("column")
        op = f.get("op", "eq")
        value = f.get("value")

        if not col_name:
            raise QueryBuilderError(f"Filter #{i}: missing 'column'")
        if op not in FILTER_OPS:
            raise QueryBuilderError(
                f"Filter #{i}: unknown operator '{op}'. Available: {list(FILTER_OPS.keys())}"
            )

        quoted, _ = _resolve_column(tables, col_name, joins_present)
        clause, clause_params = _build_filter_clause(quoted, op, value, params)
        clauses.append(clause)
        params.extend(clause_params)
    return "WHERE " + " AND ".join(clauses), params


def _build_filter_clause(
    quoted_col: str, op: str, value: Any, existing_params: list[Any]
) -> tuple[str, list[Any]]:
    """Build a single filter clause with parameter placeholders."""
    params: list[Any] = []

    if op in ("is_null", "is_not_null"):
        template = FILTER_OPS[op]
        return template % (quoted_col,), []

    if op == "between":
        if not isinstance(value, (list, tuple)) or len(value) != 2:
            raise QueryBuilderError("Filter op 'between' requires a [low, high] list value")
        n = len(existing_params)
        clause = FILTER_OPS[op] % (quoted_col, f"${n + 1}", f"${n + 2}")
        return clause, list(value)

    if op == "in":
        if not isinstance(value, (list, tuple)) or len(value) == 0:
            raise QueryBuilderError("Filter op 'in' requires a non-empty list value")
        params = []
        placeholders = []
        for v in value:
            n = len(existing_params) + len(params)
            placeholders.append(f"${n + 1}")
            params.append(v)
        clause = f"{quoted_col} IN ({', '.join(placeholders)})"
        return clause, params

    # Scalar ops
    n = len(existing_params)
    clause = FILTER_OPS[op] % (quoted_col, f"${n + 1}")
    return clause, [value]


# ── GROUP BY ────────────────────────────────────────────────────────────────


def _build_group_by(
    tables: dict[str, TableInfo],
    group_by: list[str] | None,
    joins_present: bool,
) -> tuple[str, list[Any]]:
    """Build GROUP BY clause."""
    if not group_by:
        return "", []
    parts: list[str] = []
    for g in group_by:
        quoted, _ = _resolve_column(tables, g, joins_present)
        parts.append(quoted)
    return "GROUP BY " + ", ".join(parts), []


# ── ORDER BY ────────────────────────────────────────────────────────────────


def _build_order_by(
    tables: dict[str, TableInfo],
    order_by: list[str] | None,
    joins_present: bool,
) -> tuple[str, list[Any]]:
    """Build ORDER BY clause. Prefix with '-' for DESC."""
    if not order_by:
        return "", []
    parts: list[str] = []
    for o in order_by:
        desc = False
        name = o
        if o.startswith("-"):
            desc = True
            name = o[1:]
        quoted, _ = _resolve_column(tables, name, joins_present)
        direction = "DESC" if desc else "ASC"
        parts.append(f"{quoted} {direction}")
    return "ORDER BY " + ", ".join(parts), []


MAX_LIMIT = 100_000


# ── Identifier quoting ──────────────────────────────────────────────────────


def _quote_ident(name: str) -> str:
    """Quote a PostgreSQL identifier to prevent injection."""
    if not name.replace("_", "").isalnum():
        raise QueryBuilderError(f"Invalid identifier: {name}")
    return f'"{name}"'


# ── Main entry point ────────────────────────────────────────────────────────


def build_query(
    table: TableInfo,
    select: list[str] | None = None,
    filters: list[dict[str, Any]] | None = None,
    group_by: list[str] | None = None,
    order_by: list[str] | None = None,
    joins: list[dict[str, Any]] | None = None,
) -> tuple[str, list[Any]]:
    """Build a parameterized SELECT query.

    Args:
        table: Primary TableInfo from the metadata registry.
        select: Columns or aggregation expressions. Use 'table.column' when joins present.
        filters: List of {"column", "op", "value"} dicts.
        group_by: Column names to group by.
        order_by: Column names, prefix with '-' for DESC.
        joins: List of {"table", "on", "type"} dicts for INNER JOINs.

    Returns:
        (sql_string, params_list) for asyncpg's conn.fetch(sql, *params).
    """
    all_params: list[Any] = []

    # Build table map for column resolution
    tables: dict[str, TableInfo] = {table.name: table}
    join_specs: list[JoinSpec] = []

    if joins:
        for j in joins:
            join_table_name = j["table"]
            on_clause = j.get("on", "")
            join_type = j.get("type", "inner")

            join_table = registry_get_table(join_table_name)
            if join_table is None:
                raise QueryBuilderError(f"Unknown join table: {join_table_name}")

            lt, lc, rt, rc = _parse_on_clause(on_clause, table.name, join_table_name)

            # Validate columns exist on their tables
            for tbl_name, col_name in [(lt, lc), (rt, rc)]:
                t = tables.get(tbl_name) or registry_get_table(tbl_name)
                if t is None:
                    raise QueryBuilderError(f"Unknown table '{tbl_name}' in ON clause")
                if _find_column(t, col_name) is None:
                    raise QueryBuilderError(
                        f"Unknown column '{col_name}' for table '{tbl_name}' in ON clause"
                    )

            tables[join_table_name] = join_table
            join_specs.append(JoinSpec(
                table=join_table_name,
                on_left_table=lt,
                on_left_col=lc,
                on_right_table=rt,
                on_right_col=rc,
            ))

    joins_present = len(tables) > 1
    clauses: list[str] = []

    # SELECT
    sel_sql, _ = _build_select(tables, select, joins_present)
    clauses.append(f"SELECT {sel_sql}")

    # FROM + JOIN
    from_sql = _build_from(table, join_specs)
    clauses.append(from_sql)

    # WHERE
    where_sql, where_params = _build_where(tables, filters, joins_present)
    if where_sql:
        clauses.append(where_sql)
        all_params.extend(where_params)

    # GROUP BY
    group_sql, _ = _build_group_by(tables, group_by, joins_present)
    if group_sql:
        clauses.append(group_sql)

    # ORDER BY
    order_sql, _ = _build_order_by(tables, order_by, joins_present)
    if order_sql:
        clauses.append(order_sql)

    sql = " ".join(clauses)
    return sql, all_params



