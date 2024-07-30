#!/bin/bash

BACKUP_DIR=/home/alfreds/backup
TIMESTAMP=$(date +%Y%m%d%H%M%S)
VOLUME_NAMES=$(docker volume ls -q)

mkdir -p $BACKUP_DIR

# Backup Docker volumes
for VOLUME in $VOLUME_NAMES; do
  docker run --rm -v $VOLUME:/volume -v $BACKUP_DIR:/backup alpine tar czf /backup/${VOLUME}_backup_$TIMESTAMP.tar.gz -C /volume .
done


# Optional: Remove old backups older than 3 days
find $BACKUP_DIR -type f -name '*.tar.gz' -mtime +2 -exec rm {} \;

# Setup crontab
# crontab -e
# 0 0 * * * /home/alfreds/actappon/backup.sh > /home/alfreds/actappon/backup.log 2>&1

