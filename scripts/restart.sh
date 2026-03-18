#!/bin/bash
docker compose down api-gateway
docker compose up -d api-gateway
sleep 2
docker logs -f --since 2s kodecraft-gateway
