# Actappon website

This is a WordPress site running with Docker Compose.

Active services:

- WordPress
- MySQL
- nginx
- File Browser
- Uptime Kuma monitor
- MSOA marketing agent

SSL is handled by Cloudflare, not by nginx/certbot.

## Setup

### Directory structure

```
├── README.md
├── backup.sh
├── restore.sh
├── run.sh
├── backups
├── docker-compose.yml
├── filebrowser
├── marketing_agent
├── monitor
└── nginx
    ├── default.conf
    ├── cloudflare-allow.conf
    ├── cloudflare-real-ip.conf
    └── cloudflare-source-ip.conf
```

### SSL with Cloudflare

SSL is terminated by Cloudflare. The origin nginx container only listens on HTTP
port 80, and Cloudflare proxies HTTPS traffic to the origin over HTTP.

Recommended Cloudflare settings:

- DNS records for `actappon.com`, `filebrowser.actappon.com`, `monitor.actappon.com`, and `msoa.actappon.com` should be proxied.
- The `www.actappon.com` DNS record should also point to the same server if it is used.
- SSL/TLS mode should be `Flexible` for this HTTP-only origin setup.
- Enable "Always Use HTTPS" in Cloudflare if HTTP-to-HTTPS redirects are needed.

The nginx config restricts access to Cloudflare IP ranges and uses
`CF-Connecting-IP` as the real client IP.

Required Cloudflare DNS records:

| Name | Type | Content | Proxy status |
| --- | --- | --- | --- |
| `actappon.com` | `A` | server public IP | Proxied |
| `www.actappon.com` | `A` | server public IP | Proxied |
| `filebrowser.actappon.com` | `A` | server public IP | Proxied |
| `monitor.actappon.com` | `A` | server public IP | Proxied |
| `msoa.actappon.com` | `A` | server public IP | Proxied |

To get the server public IP from the server:

```bash
curl ipinfo.io/ip
```

### Install Docker and Docker Compose

Install Docker and Docker Compose before running the stack.

### Run the stack

From the project directory:

```bash
./run.sh
```

The script:

1. Creates the `static_volume` Docker volume if missing.
2. Creates the external `shared_proxy` Docker network if missing.
3. Ensures the local `backups/` directory exists.
4. Starts WordPress and MySQL first.
5. Starts File Browser and monitor.
6. Starts the MSOA marketing agent stack.
7. Starts the full stack, including nginx.
8. Prints the Cloudflare and WordPress migration checklist.

### MSOA marketing agent

MSOA is exposed through the main nginx container:

- UI: `https://msoa.actappon.com`
- API: `https://msoa.actappon.com/api`

The MSOA `ui-frontend` and `ui-backend` services join the external
`shared_proxy` Docker network so the main nginx container can reach them.

Before expecting the subdomain to work:

1. Configure `marketing_agent/.env`.
2. Make sure the Cloudflare `msoa.actappon.com` A record points to this server public IP.
3. Keep the DNS record proxied / orange-clouded.
4. Keep Cloudflare SSL/TLS mode as `Flexible`.

To check MSOA setup details:

```bash
cd marketing_agent
./run.sh setup
```

### WordPress-only migration

The migration scripts intentionally handle only WordPress:

- WordPress MySQL database: `wordpress`
- WordPress files: `wordpress:/var/www/html/wp-content`

They do not back up or restore nginx, certbot, File Browser, monitor, Docker images, or unrelated Docker volumes.

The domain remains `actappon.com`, so no WordPress search-replace is needed for the domain.

#### Backup on the old host

From the old host project directory:

```bash
cd ~/proj/actappon
mkdir -p backups
BACKUP_ROOT="$(pwd)/backups" ./backup.sh
```

This creates a backup file like:

```text
backups/actappon-wp-backup-YYYYmmddHHMMSS.tar.gz
```

#### Copy the backup to the new host

From the old host:

```bash
scp backups/actappon-wp-backup-YYYYmmddHHMMSS.tar.gz alfreds@20.51.115.86:~/actappon/backups/
```

Replace `20.51.115.86` with the current new server IP if it changes.

#### Restore on the new host

From the new host project directory:

```bash
cd ~/actappon
./restore.sh backups/actappon-wp-backup-YYYYmmddHHMMSS.tar.gz
```

The restore script creates a pre-restore WordPress-only backup before replacing the WordPress database and `wp-content`.

To skip the confirmation prompt:

```bash
YES=1 ./restore.sh backups/actappon-wp-backup-YYYYmmddHHMMSS.tar.gz
```

### Useful checks

```bash
docker ps
docker logs --tail=50 nginx
docker logs --tail=50 wordpress
docker logs --tail=50 mysql
docker logs --tail=50 ui-frontend
docker logs --tail=50 ui-backend
```


### Credentials to the monitor.actappon.com

alfreds
6 hop A+

### Credentials to the filebrowser.actappon.com

admin
6 hop A+
