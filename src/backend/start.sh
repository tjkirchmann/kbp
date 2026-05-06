#!/bin/sh
set -e

echo "Waiting for database..."
until alembic current > /dev/null 2>&1; do
  echo "DB not ready — retrying in 2s..."
  sleep 2
done

echo "Running migrations..."
alembic upgrade head

echo "Starting server..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
