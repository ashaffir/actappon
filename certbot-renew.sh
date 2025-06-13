#!/bin/bash
docker run --rm \
  -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/certbot/www:/var/www/certbot" \
  certbot/certbot:v2.10.0 renew \
  --webroot \
  --webroot-path=/var/www/certbot \
  --no-random-sleep-on-renew \
  --verbose

