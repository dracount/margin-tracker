#!/bin/bash
# =============================================================================
# DAILY POCKETBASE BACKUP SCRIPT
# =============================================================================
# Backs up the PocketBase database from the Docker container
# Compresses the backup and removes old backups (default: 7 days retention)
#
# Usage: ./scripts/backup.sh
# Cron:  0 2 * * * /home/david/michael/Margin_Tracker/scripts/backup.sh
# =============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
CONTAINER_NAME="${CONTAINER_NAME:-margin_pocketbase}"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H%M%S)
LOG_FILE="$BACKUP_DIR/backup.log"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting backup..."

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log "ERROR: Container '$CONTAINER_NAME' is not running"
    exit 1
fi

# Create temporary directory for backup
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy PocketBase data from container
log "Copying data from container..."
docker cp "$CONTAINER_NAME:/pocketbase" "$TEMP_DIR/pb_data"

# Compress backup
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.tar.gz"
log "Compressing to $BACKUP_FILE..."
tar -czf "$BACKUP_FILE" -C "$TEMP_DIR" "pb_data"

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Remove old backups
log "Removing backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
log "Deleted $DELETED old backup(s)"

log "Backup completed successfully"
