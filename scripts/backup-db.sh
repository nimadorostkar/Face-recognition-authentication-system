#!/bin/sh
# Manual database backup script.
# Creates a timestamped pg_dump backup of the face_recognition database.
#
# Usage:
#   ./scripts/backup-db.sh              # backup to ./backups/
#   ./scripts/backup-db.sh /path/to/dir # backup to custom directory
#
# Requires: docker compose and the db container running.

set -e
cd "$(dirname "$0")/.."

BACKUP_DIR="${1:-./backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/face_recognition_${TIMESTAMP}.sql.gz"

echo "Creating backup of face_recognition database..."
docker compose exec -T db pg_dump -U postgres -d face_recognition | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✓ Backup saved: $BACKUP_FILE ($SIZE)"
echo ""
echo "To restore, run:"
echo "  gunzip -c $BACKUP_FILE | docker compose exec -T db psql -U postgres -d face_recognition"
