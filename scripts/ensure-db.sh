#!/bin/sh
# One-time fix when PostgreSQL volume already existed and skipped creating face_recognition DB.
# Run from project root: ./scripts/ensure-db.sh
# Requires: docker compose (or docker-compose) and the db container running.

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
