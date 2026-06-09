#!/bin/sh
set -e

echo "Waiting for database..."
until alembic current > /dev/null 2>&1; do
  echo "DB not ready — retrying in 2s..."
  sleep 2
done

echo "Running migrations..."
alembic upgrade head

# Apply Procrastinate's schema once. `schema --apply` is not idempotent, so skip
# it when healthchecks reports the procrastinate_jobs table already exists.
PROCRASTINATE_APP=app.core.procrastinate.procrastinate_app
echo "Ensuring Procrastinate schema..."
if procrastinate --app=$PROCRASTINATE_APP healthchecks 2>/dev/null | grep -q "procrastinate_jobs table: OK"; then
  echo "Procrastinate schema already present."
else
  procrastinate --app=$PROCRASTINATE_APP schema --apply
fi

echo "Starting services..."
exec supervisord -c supervisord.conf
