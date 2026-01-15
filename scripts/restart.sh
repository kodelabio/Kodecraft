#!/bin/bash

docker compose restart api-gateway
sleep 2
docker logs -f kodecraft-gateway