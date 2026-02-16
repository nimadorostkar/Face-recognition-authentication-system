#!/bin/sh
# Ensures the face_recognition database exists and schema is applied.
# Run from project root: ./scripts/ensure-db.sh
# Requires: docker compose and the db container running.

set -e
cd "$(dirname "$0")/.."

echo "Ensuring database face_recognition exists..."
docker compose exec -T db psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname='face_recognition'" -tA | grep -q 1 \
  || docker compose exec -T db psql -U postgres -c "CREATE DATABASE face_recognition"

echo "Applying schema (init.sql)..."
docker compose exec -T db psql -U postgres -d face_recognition < init.sql

echo "Restarting API..."
docker compose restart api

echo "Done. API should start successfully."
