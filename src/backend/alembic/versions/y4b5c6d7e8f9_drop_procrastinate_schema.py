"""drop the procrastinate schema and the espn_rate_tokens table

All background work moved to Temporal (app/temporal/*), so the Procrastinate
job-queue schema and the old DB rate-limiter table are now dead. This migration
removes them.

Procrastinate created 4 tables, 3 enum types, and ~18 functions (all prefixed
``procrastinate_``). Rather than hardcode every function signature, the functions
and types are swept by name from the catalog in a DO block, and the tables are
dropped with CASCADE (which clears their triggers/constraints). Everything uses
IF EXISTS so the migration is safe on a DB where the schema was already absent.

The downgrade is intentionally a no-op: re-creating Procrastinate's schema is the
job of its own ``schema --apply`` CLI, not this migration. Procrastinate has been
removed from the project, so there is nothing to downgrade to.

Revision ID: y4b5c6d7e8f9
Revises: 6138e8c55fa3
Create Date: 2026-06-26 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "y4b5c6d7e8f9"
down_revision: str | None = "6138e8c55fa3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The 4 tables Procrastinate 3.8.1 creates, plus the retired rate-limiter table.
_TABLES = (
    "procrastinate_events",
    "procrastinate_jobs",
    "procrastinate_periodic_defers",
    "procrastinate_workers",
    "espn_rate_tokens",
)


def upgrade() -> None:
    # Tables first — CASCADE removes their triggers, FKs, and the sequences/indexes
    # that hang off them.
    for table in _TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

    # Then sweep every remaining procrastinate_* function and type by name, so we
    # don't have to spell out all ~18 function signatures. Tables are already gone,
    # so nothing depends on these anymore.
    op.execute(
        """
        DO $$
        DECLARE
            obj record;
        BEGIN
            FOR obj IN
                SELECT 'DROP FUNCTION IF EXISTS '
                       || quote_ident(n.nspname) || '.' || quote_ident(p.proname)
                       || '(' || pg_get_function_identity_arguments(p.oid) || ') CASCADE' AS stmt
                FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE p.proname LIKE 'procrastinate_%'
            LOOP
                EXECUTE obj.stmt;
            END LOOP;

            FOR obj IN
                SELECT 'DROP TYPE IF EXISTS '
                       || quote_ident(n.nspname) || '.' || quote_ident(t.typname)
                       || ' CASCADE' AS stmt
                FROM pg_type t
                JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE t.typname LIKE 'procrastinate_%'
            LOOP
                EXECUTE obj.stmt;
            END LOOP;
        END $$;
        """
    )


def downgrade() -> None:
    # No-op: Procrastinate is removed from the project; its schema is recreated by
    # its own CLI, not here. The espn_rate_tokens table is likewise obsolete.
    pass
