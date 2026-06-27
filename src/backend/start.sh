#!/bin/sh
set -e

echo "Waiting for database..."
until alembic current > /dev/null 2>&1; do
  echo "DB not ready — retrying in 2s..."
  sleep 2
done

echo "Running migrations..."
alembic upgrade head

echo "Starting services..."
exec supervisord -c supervisord.conf
