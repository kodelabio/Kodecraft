#!/bin/bash

docker compose down
docker compose build --no-cache
docker compose up -d
sleep 5
docker logs -f kodecraft-leader