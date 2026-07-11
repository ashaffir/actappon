#!/bin/bash
set -Eeuo pipefail

# WordPress-only restore for the new host.
# Restores:
#   1. WordPress MySQL database
#   2. wordpress:/var/www/html/wp-content
#
# Does NOT restore nginx, certbot, filebrowser, monitor, or other services.

MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"
WORDPRESS_CONTAINER="${WORDPRESS_CONTAINER:-wordpress}"
DB_NAME="${DB_NAME:-wordpress}"
DB_APP_USER="${DB_APP_USER:-wordpress}"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-rootpassword}"
PRE_RESTORE_BACKUP_ROOT="${PRE_RESTORE_BACKUP_ROOT:-$HOME/actappon-wp-pre-restore-backups}"

usage() {
  echo "Usage: $0 /path/to/actappon-wp-backup-YYYYmmddHHMMSS.tar.gz"
  echo
  echo "Optional environment overrides:"
  echo "  MYSQL_CONTAINER=mysql"
  echo "  WORDPRESS_CONTAINER=wordpress"
  echo "  DB_NAME=wordpress"
  echo "  DB_APP_USER=wordpress"
  echo "  DB_ROOT_PASSWORD=rootpassword"
  echo "  YES=1                    # skip confirmation prompt"
}

if [ "$#" -ne 1 ]; then
  usage
  exit 1
fi

BACKUP_FILE="$1"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d)"

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
require_safe_identifier "DB_APP_USER" "$DB_APP_USER"
require_running_container "$MYSQL_CONTAINER"
require_running_container "$WORDPRESS_CONTAINER"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup archive not found: $BACKUP_FILE"
  exit 1
fi

echo "Inspecting backup archive..."
tar -tzf "$BACKUP_FILE" >/dev/null
tar -C "$WORK_DIR" -xzf "$BACKUP_FILE"

if [ ! -f "$WORK_DIR/wordpress.sql" ] || [ ! -f "$WORK_DIR/wp-content.tar.gz" ]; then
  echo "Invalid backup archive. Expected wordpress.sql and wp-content.tar.gz."
  exit 1
fi

if [ "${YES:-0}" != "1" ]; then
  echo "This will replace ONLY the WordPress database '$DB_NAME' and wp-content."
  echo "It will not touch nginx, certbot, filebrowser, monitor, or other services."
  read -r -p "Type RESTORE to continue: " CONFIRMATION

  if [ "$CONFIRMATION" != "RESTORE" ]; then
    echo "Restore cancelled."
    exit 1
  fi
fi

mkdir -p "$PRE_RESTORE_BACKUP_ROOT"

echo "Creating pre-restore WordPress database backup..."
docker exec -e MYSQL_PWD="$DB_ROOT_PASSWORD" "$MYSQL_CONTAINER" \
  mysqldump \
    --single-transaction \
    --quick \
    --add-drop-table \
    --default-character-set=utf8mb4 \
    -uroot \
    "$DB_NAME" > "$PRE_RESTORE_BACKUP_ROOT/wordpress-before-restore-$TIMESTAMP.sql"

echo "Creating pre-restore wp-content backup..."
docker exec "$WORDPRESS_CONTAINER" \
  tar -C /var/www/html -czf - wp-content > "$PRE_RESTORE_BACKUP_ROOT/wp-content-before-restore-$TIMESTAMP.tar.gz"

echo "Recreating WordPress database '$DB_NAME'..."
docker exec -e MYSQL_PWD="$DB_ROOT_PASSWORD" "$MYSQL_CONTAINER" \
  mysql -uroot -e "
DROP DATABASE IF EXISTS \`$DB_NAME\`;
CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_APP_USER'@'%';
FLUSH PRIVILEGES;
"

echo "Importing WordPress database..."
docker exec -i -e MYSQL_PWD="$DB_ROOT_PASSWORD" "$MYSQL_CONTAINER" \
  mysql -uroot "$DB_NAME" < "$WORK_DIR/wordpress.sql"

echo "Restoring WordPress wp-content..."
docker exec "$WORDPRESS_CONTAINER" rm -rf /var/www/html/wp-content
docker exec -i "$WORDPRESS_CONTAINER" \
  tar -C /var/www/html -xzf - < "$WORK_DIR/wp-content.tar.gz"
docker exec "$WORDPRESS_CONTAINER" chown -R www-data:www-data /var/www/html/wp-content

echo "Restarting WordPress container only..."
docker restart "$WORDPRESS_CONTAINER" >/dev/null

echo "WordPress restore completed."
echo "Pre-restore backups were saved under:"
echo "$PRE_RESTORE_BACKUP_ROOT"
