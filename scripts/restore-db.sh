#!/bin/sh
# Restore database from a backup file.
#
# Usage:
#   ./scripts/restore-db.sh backups/face_recognition_20260216_120000.sql.gz
#
# This will:
#   1. Ensure the face_recognition database exists
#   2. Drop and recreate all tables
#   3. Restore data from the backup
#
# Requires: docker compose and the db container running.

set -e
cd "$(dirname "$0")/.."

if [ -z "$1" ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -lh backups/face_recognition_*.sql.gz 2>/dev/null || echo "  No backups found in ./backups/"
  echo ""
  echo "Docker volume backups:"
  docker compose exec -T db ls -lh /backups/face_recognition_*.sql.gz 2>/dev/null || echo "  No backups found in Docker volume"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "⚠️  WARNING: This will overwrite all data in face_recognition database!"
echo "Backup file: $BACKUP_FILE"
printf "Continue? [y/N] "
read -r CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "Step 1: Ensuring database exists..."
docker compose exec -T db psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname='face_recognition'" -tA | grep -q 1 \
  || docker compose exec -T db psql -U postgres -c "CREATE DATABASE face_recognition"

echo "Step 2: Dropping existing tables..."
docker compose exec -T db psql -U postgres -d face_recognition -c "DROP TABLE IF EXISTS users CASCADE;"

echo "Step 3: Restoring from backup..."
gunzip -c "$BACKUP_FILE" | docker compose exec -T db psql -U postgres -d face_recognition

echo "Step 4: Restarting API..."
docker compose restart api

echo ""
echo "✓ Database restored successfully from: $BACKUP_FILE"
