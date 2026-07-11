#!/bin/bash

VOLUME_NAME="static_volume"
NETWORK_NAME="shared_proxy"
FILEBROWSER_COMPOSE_FILE="filebrowser/docker-compose.yml"
MONITOR_COMPOSE_FILE="monitor/docker-compose.yml"
BACKUPS_DIR="backups"

start_compose() {
  local description="$1"
  shift

  echo "$description..."
  "$@"

  if [ $? -eq 0 ]; then
    echo "$description completed successfully."
  else
    echo "$description failed."
    exit 1
  fi
}

# Check if the volume already exists
if docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1; then
  echo "Volume '$VOLUME_NAME' already exists. Skipping creation."
else
  # Create the volume if it does not exist
  echo "Creating volume '$VOLUME_NAME'..."
  docker volume create --name "$VOLUME_NAME"

  if [ $? -eq 0 ]; then
    echo "Volume '$VOLUME_NAME' created successfully."
  else
    echo "Failed to create volume '$VOLUME_NAME'."
    exit 1
  fi
fi

# docker-compose.yml declares this network as external, so Compose will not
# create it automatically on a fresh machine.
if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  echo "Network '$NETWORK_NAME' already exists. Skipping creation."
else
  echo "Creating network '$NETWORK_NAME'..."
  docker network create "$NETWORK_NAME"

  if [ $? -eq 0 ]; then
    echo "Network '$NETWORK_NAME' created successfully."
  else
    echo "Failed to create network '$NETWORK_NAME'."
    exit 1
  fi
fi

mkdir -p "$BACKUPS_DIR"

# Create the main Compose network before starting services that join it as an
# external network. Do not start nginx yet: it references filebrowser and
# monitor by container name and can fail if those containers do not exist.
start_compose "Starting WordPress and database services" \
  docker-compose up -d db wordpress

# Start services proxied by nginx before starting nginx itself.
start_compose "Starting File Browser service" \
  docker-compose -f "$FILEBROWSER_COMPOSE_FILE" up -d

start_compose "Starting monitor service" \
  docker-compose -f "$MONITOR_COMPOSE_FILE" up -d

# Start the full Docker Compose setup, including nginx.
start_compose "Starting Docker Compose setup" \
  docker-compose up -d

cat <<'EOF'

Setup completed.

Post-run checklist:
1. Cloudflare DNS
   - Make sure these A records point to this server public IP:
     actappon.com
     www.actappon.com
     filebrowser.actappon.com
     monitor.actappon.com
   - Make sure they are Proxied / orange-clouded.

2. Cloudflare SSL/TLS
   - SSL/TLS mode must be Flexible because this origin listens on HTTP port 80.
   - Enable "Always Use HTTPS" in Cloudflare if HTTPS redirects are needed.

3. WordPress-only migration
   - Put WordPress backup archives in ./backups.
   - On the old host, create a WordPress-only backup with:
       BACKUP_ROOT="$(pwd)/backups" ./backup.sh
   - Copy the generated .tar.gz file to this new host under:
       ~/actappon/backups/
   - On this host, restore WordPress only with:
       ./restore.sh backups/<backup-file>.tar.gz

4. Health checks
   - docker ps
   - docker logs --tail=50 nginx
   - docker logs --tail=50 wordpress

EOF
