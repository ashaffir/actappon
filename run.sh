#!/bin/bash

# Check if the volume already exists
VOLUME_NAME="static_volume"
VOLUME_EXISTS=$(docker volume ls -q -f name=$VOLUME_NAME)

if [ "$VOLUME_EXISTS" == "$VOLUME_NAME" ]; then
  echo "Volume '$VOLUME_NAME' already exists. Skipping creation."
else
  # Create the volume if it does not exist
  echo "Creating volume '$VOLUME_NAME'..."
  docker volume create --name=$VOLUME_NAME

  if [ $? -eq 0 ]; then
    echo "Volume '$VOLUME_NAME' created successfully."
  else
    echo "Failed to create volume '$VOLUME_NAME'."
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

