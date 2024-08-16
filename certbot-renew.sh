#!/bin/sh

trap exit TERM

while :; do
    sleep 24h & wait $!
    certbot renew --webroot -w /var/www/certbot --post-hook "nginx -s reload"
done

