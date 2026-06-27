#!/bin/sh
set -e

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env not found at $ENV_FILE"
  exit 1
fi

# Load .env
set -a
# shellcheck source=/dev/null
. "$ENV_FILE"
set +a

# Alembic needs a sync driver; strip +asyncpg
export DATABASE_URL="${DATABASE_URL/+asyncpg/}"

# Resolve where the DB currently is so we only preview PENDING migrations.
# A bare `alembic upgrade head --sql` assumes an empty DB and replays the
# entire history every time, which is unreadable. Scope the preview to
# current:head instead.
CURRENT="$(uv run alembic current 2>/dev/null | awk 'NF{print $1}' | tail -1)"

if [ -z "$CURRENT" ]; then
  echo "DB has no alembic_version yet — previewing full history."
  RANGE="head"
else
  RANGE="${CURRENT}:head"
fi

echo "=== Dry run (SQL preview: ${RANGE}) ==="
PREVIEW="$(uv run alembic upgrade "$RANGE" --sql 2>&1)"
if printf '%s\n' "$PREVIEW" | grep -qE 'UPDATE alembic_version|CREATE|ALTER|DROP|INSERT'; then
  printf '%s\n' "$PREVIEW"
else
  echo "(no pending migrations — DB is already at head)"
  echo "============================="
  exit 0
fi
echo "============================="
echo

printf "Apply these migrations to the dev database? [y/N] "
read -r CONFIRM
case "$CONFIRM" in
  y|Y)
    echo "Running migrations..."
    uv run alembic upgrade head
    echo "Done."
    ;;
  *)
    echo "Aborted."
    exit 0
    ;;
esac
