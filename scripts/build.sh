docker compose down
docker compose build
docker compose up -d
sleep 5
docker logs -f kodecraft-leader