"""Per-definition data table: create-on-demand, resolve targets, upsert.

Each definition gets its own ``struct_output_{name}`` table with one typed column
per output field plus bookkeeping (entity FK, generated_at, model, run_id). The
table is created from the field spec at runtime (``CREATE TABLE IF NOT EXISTS``)
rather than via Alembic, because definitions are DB-driven.

Identifiers (table name, column names, source table/pk) originate from registry
rows which are admin/seed-authored, not end-user input — but we still validate
them as plain SQL identifiers and quote them, so a malformed definition fails
loudly instead of producing broken/unsafe DDL.
"""

import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.struct_output import StructOutputDefinition

# SQL column type per field-type (mirrors schema.py's vocabulary).
SQL_TYPE: dict[str, str] = {
    "score": "integer",
    "tier": "text",
    "enum": "text",
    "text": "text",
    "str": "text",
    "int": "integer",
    "float": "double precision",
    "bool": "boolean",
}

_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


def _ident(value: str, what: str) -> str:
    """Validate a bare SQL identifier (lowercase snake) and return it quoted."""
    if not _IDENT.match(value or ""):
        raise ValueError(f"invalid {what} identifier: {value!r}")
    return f'"{value}"'


def output_table_name(name: str) -> str:
    """The data table for a definition (unquoted)."""
    _ident(name, "definition name")
    return f"struct_output_{name}"


def _entity_col(defn: StructOutputDefinition) -> str:
    """Column holding the source entity id (e.g. team_id for cfbd_teams)."""
    # Singularize a trailing 's' for readability (cfbd_teams -> cfbd_team_id);
    # purely cosmetic and stable per definition.
    base = (
        defn.source_table[:-1] if defn.source_table.endswith("s") else defn.source_table
    )
    return f"{base}_{defn.source_pk}"


async def ensure_output_table(db: AsyncSession, defn: StructOutputDefinition) -> str:
    """Idempotently create ``struct_output_{name}`` from the field spec.

    Returns the (unquoted) table name. Columns:
      <entity_col>  — PK, FK to source_table.source_pk
      <field>...    — one per output field
      generated_at, model, run_id — bookkeeping
    """
    table = output_table_name(defn.name)
    qtable = _ident(table, "table name")
    entity_col = _entity_col(defn)
    qentity = _ident(entity_col, "entity column")
    qsrc = _ident(defn.source_table, "source table")
    qsrc_pk = _ident(defn.source_pk, "source pk")

    cols = [f"{qentity} integer PRIMARY KEY REFERENCES {qsrc}({qsrc_pk})"]
    for spec in defn.fields:
        sql_type = SQL_TYPE.get(spec["type"])
        if sql_type is None:
            raise ValueError(
                f"field {spec['name']!r}: no SQL type for {spec['type']!r}"
            )
        cols.append(f"{_ident(spec['name'], 'field')} {sql_type}")
    cols += [
        "generated_at timestamp NOT NULL DEFAULT now()",
        "model text",
        "run_id text",
    ]

    await db.execute(
        text(f"CREATE TABLE IF NOT EXISTS {qtable} (\n  " + ",\n  ".join(cols) + "\n)")
    )
    await db.commit()
    return table


async def existing_entity_ids(
    db: AsyncSession, defn: StructOutputDefinition
) -> set[int]:
    """Entity ids already populated in the data table (for populate-only runs)."""
    qtable = _ident(output_table_name(defn.name), "table name")
    qentity = _ident(_entity_col(defn), "entity column")
    rows = await db.execute(text(f"SELECT {qentity} FROM {qtable}"))
    return {r[0] for r in rows.all()}


async def upsert_output(
    db: AsyncSession,
    defn: StructOutputDefinition,
    entity_id: int,
    values: dict,
    *,
    model: str,
    run_id: str,
) -> None:
    """Insert-or-replace one row keyed on the entity id."""
    qtable = _ident(output_table_name(defn.name), "table name")
    entity_col = _entity_col(defn)

    payload = dict(values)
    payload[entity_col] = entity_id
    payload["model"] = model
    payload["run_id"] = run_id
    payload["generated_at"] = None  # let the column default fill it on insert

    # generated_at is column-defaulted; drop the None so DEFAULT applies, but on
    # conflict refresh it explicitly to now().
    insert_cols = [c for c in payload if c != "generated_at" or payload[c] is not None]
    qcols = ", ".join(_ident(c, "column") for c in insert_cols)
    qparams = ", ".join(f":{c}" for c in insert_cols)
    update_cols = [c for c in insert_cols if c != entity_col]
    set_clause = ", ".join(
        f'{_ident(c, "column")} = EXCLUDED.{_ident(c, "column")}' for c in update_cols
    )
    set_clause += ", generated_at = now()"

    stmt = text(
        f"INSERT INTO {qtable} ({qcols}) VALUES ({qparams}) "
        f"ON CONFLICT ({_ident(entity_col, 'entity column')}) DO UPDATE SET {set_clause}"
    )
    await db.execute(stmt, {c: payload[c] for c in insert_cols})
    await db.commit()
