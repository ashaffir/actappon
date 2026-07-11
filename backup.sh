#!/bin/bash
set -Eeuo pipefail

# WordPress-only backup for the old host.
# Backs up:
#   1. WordPress MySQL database
#   2. wordpress:/var/www/html/wp-content
#
# Does NOT back up nginx, certbot, filebrowser, monitor, or other services.

MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"
WORDPRESS_CONTAINER="${WORDPRESS_CONTAINER:-wordpress}"
DB_NAME="${DB_NAME:-wordpress}"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-rootpassword}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/actappon-wp-backups}"

TIMESTAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d)"
BACKUP_FILE="$BACKUP_ROOT/actappon-wp-backup-$TIMESTAMP.tar.gz"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_running_container() {
  local container="$1"

  if ! docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q '^true$'; then
    echo "Required container is not running: $container"
    exit 1
  fi
}

require_safe_identifier() {
  local name="$1"
  local value="$2"

  if [[ ! "$value" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "$name must contain only letters, numbers, and underscores. Got: $value"
    exit 1
  fi
}

require_command docker
require_command tar
require_command mktemp

require_safe_identifier "DB_NAME" "$DB_NAME"
require_running_container "$MYSQL_CONTAINER"
require_running_container "$WORDPRESS_CONTAINER"

mkdir -p "$BACKUP_ROOT"

echo "Backing up WordPress database '$DB_NAME' from container '$MYSQL_CONTAINER'..."
docker exec -e MYSQL_PWD="$DB_ROOT_PASSWORD" "$MYSQL_CONTAINER" \
  mysqldump \
    --single-transaction \
    --quick \
    --add-drop-table \
    --default-character-set=utf8mb4 \
    -uroot \
    "$DB_NAME" > "$WORK_DIR/wordpress.sql"

echo "Backing up WordPress wp-content from container '$WORDPRESS_CONTAINER'..."
docker exec "$WORDPRESS_CONTAINER" \
  tar -C /var/www/html -czf - wp-content > "$WORK_DIR/wp-content.tar.gz"

cat > "$WORK_DIR/manifest.txt" <<EOF
created_at=$TIMESTAMP
scope=wordpress-only
mysql_container=$MYSQL_CONTAINER
wordpress_container=$WORDPRESS_CONTAINER
db_name=$DB_NAME
contents=wordpress.sql,wp-content.tar.gz
EOF

echo "Creating backup archive..."
tar -C "$WORK_DIR" -czf "$BACKUP_FILE" wordpress.sql wp-content.tar.gz manifest.txt

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
fi

echo "WordPress backup created:"
echo "$BACKUP_FILE"
