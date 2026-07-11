# Actappon website 
This is a simple Wordpress website.
Architecture is based on Docker services: Wordpress, MySQL DB and NGINX web server.

## Setup
### Directory structure
```
├── README.md
├── docker-compose.yml
└── nginx
    ├── default.conf
```

### SSL with Cloudflare
SSL is terminated by Cloudflare. The origin nginx container only listens on HTTP
port 80, and Cloudflare proxies HTTPS traffic to the origin over HTTP.

Recommended Cloudflare settings:
- DNS records for `actappon.com`, `filebrowser.actappon.com`, and `monitor.actappon.com` should be proxied.
- SSL/TLS mode should be `Flexible` for this HTTP-only origin setup.
- Enable "Always Use HTTPS" in Cloudflare if HTTP-to-HTTPS redirects are needed.

The nginx config restricts access to Cloudflare IP ranges and uses
`CF-Connecting-IP` as the real client IP.


### Install docker and docker-compose 

### Run the docker compose
./run.sh


### Credentials to the monitor.actappon.com
alfreds
6 hop A+

### Credentials to the filebrowser.actappon.com
admin
6 hop A+

