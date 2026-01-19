#!/bin/bash

docker compose down api-gateway
docker compose up -d api-gateway
sleep 5
docker logs -f kodecraft-gateway