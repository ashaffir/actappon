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
    └── ssl
        ├── fullchain.pem
        └── privkey.pem
```

### Creating the SSL certificate
Run this if the directory does not exists:
mkdir -p /var/www/html/

* Make sure to have a simple index.html file inside.

Run:
sudo certbot certonly --webroot -w /var/www/html -d actappon.com

sudo cp /etc/letsencrypt/live/actappon.com/fullchain.pem ./nginx/ssl/
sudo cp /etc/letsencrypt/live/actappon.com/privkey.pem ./nginx/ssl/

### Install docker and docker-compose 

### Run the docker compose
docker-compose up -d



