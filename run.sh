#!/bin/bash

VOLUME_NAME="static_volume"
NETWORK_NAME="shared_proxy"
FILEBROWSER_COMPOSE_FILE="filebrowser/docker-compose.yml"
MONITOR_COMPOSE_FILE="monitor/docker-compose.yml"

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

# Start the full Docker Compose setup, including nginx and certbot.
start_compose "Starting Docker Compose setup" \
  docker-compose up -d
