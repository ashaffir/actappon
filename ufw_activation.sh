#!/bin/bash

sudo ufw allow 22022/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5050/tcp

sudo ufw enable

sudo ufw status

