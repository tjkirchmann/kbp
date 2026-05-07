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

echo "=== Dry run (SQL preview) ==="
uv run alembic upgrade head --sql
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
