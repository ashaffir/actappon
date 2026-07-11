#!/bin/bash

VOLUME_NAME="static_volume"
NETWORK_NAME="shared_proxy"

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

# Start the Docker Compose setup
echo "Starting Docker Compose setup..."
docker-compose up -d

if [ $? -eq 0 ]; then
  echo "Docker Compose setup started successfully."
else
  echo "Failed to start Docker Compose setup."
  exit 1
fi
