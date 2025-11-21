# Kodecraft Docker Setup Guide

## Overview

This guide walks you through containerizing your Kodecraft application with Docker and Docker Compose.

## Files Provided

1. **Dockerfile** - Container image definition with Xvfb and Node.js
2. **docker-compose.yml** - Orchestration for running services
3. **.dockerignore** - Files to exclude from Docker build
4. **DOCKER_SETUP_GUIDE.md** - This file

---

## Quick Start

### Prerequisites

- Docker installed ([Install Docker](https://docs.docker.com/get-docker/))
- Docker Compose installed ([Install Docker Compose](https://docs.docker.com/compose/install/))
- Your `.env` file in project root

### Basic Setup (5 minutes)

```bash
# 1. Copy files to your project root
cp Dockerfile docker-compose.yml .dockerignore ./

# 2. Ensure your .env file exists in project root
# If you don't have one, create it based on your configuration
ls -la .env

# 3. Build the Docker image
docker build -t kodecraft:latest .

# 4. Run with Docker Compose
docker-compose up
```

That's it! Your application will start with Xvfb virtual display and all necessary services.

---

## Detailed Setup

### Step 1: Prepare Your Project

```bash
# Create .env file if it doesn't exist (example structure)
cat > .env << 'EOF'
# Node Environment
NODE_ENV=production

# Minecraft Server
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565

# Bot Configuration
LEADER_BOT_PORT=4001
WORKER_BOT_START_PORT=4002

# Database (optional)
DB_HOST=postgres
DB_USER=kodecraft
DB_PASSWORD=changeme

# n8n (optional)
N8N_HOST=n8n:5678
EOF
```

### Step 2: Build the Docker Image

```bash
# Build with default tag
docker build -t kodecraft:latest .

# Or with custom tag
docker build -t kodecraft:v1.0.0 .

# View built images
docker images | grep kodecraft
```

### Step 3: Run the Container

#### Option A: Using Docker Compose (Recommended)

```bash
# Start in foreground (see logs)
docker-compose up

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Option B: Using Docker Directly

```bash
# Run a single container
docker run -it \
  --name kodecraft \
  -p 4001:4001 \
  -p 4002:4002 \
  -p 4003:4003 \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  kodecraft:latest

# Run in background
docker run -d \
  --name kodecraft \
  -p 4001:4001 \
  -p 4002-4010:4002-4010 \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  kodecraft:latest
```

---

## Advanced Configuration

### Multi-Worker Setup

If you need to run multiple worker instances, you can scale with Docker Compose:

```bash
# Start leader + multiple worker instances
docker-compose up -d
docker-compose up -d --scale worker=3
```

Or create a separate `docker-compose.worker.yml`:

```yaml
version: '3.8'

services:
  worker:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - DISPLAY=:99
      - NODE_ENV=production
      - WORKER_PORT=${WORKER_PORT:-4002}
    ports:
      - "${WORKER_PORT}:${WORKER_PORT}"
    volumes:
      - ./logs:/app/logs
      - ./.env:/app/.env:ro
    restart: unless-stopped
    networks:
      - kodecraft-network

networks:
  kodecraft-network:
    external: true
```

Then run:

```bash
# Create the network
docker network create kodecraft-network

# Start leader
docker-compose up -d

# Start workers
for i in {1..3}; do
  PORT=$((4001 + i)) docker-compose -f docker-compose.worker.yml up -d
done
```

### Environment Variables

Pass environment variables in several ways:

```bash
# From .env file
docker run --env-file .env kodecraft:latest

# From command line
docker run -e NODE_ENV=production -e DISPLAY=:99 kodecraft:latest

# From .env.production file
docker run --env-file .env.production kodecraft:latest
```

### Volume Mounts

```bash
# Mount logs for persistence
-v $(pwd)/logs:/app/logs

# Mount source code (development)
-v $(pwd)/src:/app/src

# Mount .env securely
-v $(pwd)/.env:/app/.env:ro

# Mount multiple directories
-v $(pwd)/config:/app/config:ro \
-v $(pwd)/logs:/app/logs
```

### Port Mapping

```bash
# Map single port
-p 4001:4001

# Map port range (for workers)
-p 4002-4010:4002-4010

# Map to different host port
-p 5000:4001

# Use docker-compose for automatic mapping
ports:
  - "4001:4001"
  - "4002-4010:4002-4010"
```

---

## Monitoring & Debugging

### View Logs

```bash
# Tail logs in real-time
docker-compose logs -f

# Logs from specific service
docker-compose logs -f leader

# View logs from stopped container
docker logs container-name

# Export logs to file
docker-compose logs > logs/docker-compose.log
```

### Execute Commands in Container

```bash
# Open shell in running container
docker-compose exec leader bash

# Run specific command
docker-compose exec leader npm list

# Check logs inside container
docker-compose exec leader tail -f /app/logs/kodecraft.log
```

### Health Checks

```bash
# Check container status
docker ps

# View health status
docker inspect kodecraft-leader | grep -A 5 "Health"

# Manual health check
curl http://localhost:4001/api/agent/status

# Test from within container
docker-compose exec leader curl http://localhost:4001/api/agent/status
```

### Troubleshooting

```bash
# View container stats
docker stats kodecraft-leader

# Inspect container configuration
docker inspect kodecraft-leader

# View system events
docker events

# Check network connectivity
docker-compose exec leader ping 8.8.8.8

# Test port accessibility
docker-compose exec leader curl localhost:4001
```

---

## Production Deployment

### Docker Buildx for Multiple Architectures

```bash
# Enable buildx
docker buildx create --name multiarch

# Build for multiple architectures
docker buildx build --platform linux/amd64,linux/arm64 \
  -t kodecraft:latest \
  -t kodecraft:v1.0.0 \
  --push .
```

### Optimize Image Size

Edit the Dockerfile to use multi-stage builds:

```dockerfile
# Build stage
FROM node:20-bookworm as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Runtime stage
FROM node:20-slim
RUN apt-get update && apt-get install -y xvfb --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
# ... rest of Dockerfile
```

### Resource Limits

```yaml
# In docker-compose.yml
services:
  leader:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### Restart Policies

```yaml
# In docker-compose.yml
services:
  leader:
    restart: unless-stopped  # Always restart unless manually stopped
    # Other options:
    # - no
    # - always
    # - on-failure
    # - unless-stopped
```

---

## Networking

### Connect to External Services

```bash
# Use host network (Linux only)
docker run --network host kodecraft:latest

# Use bridge network (default)
docker run --network bridge kodecraft:latest

# Create custom network
docker network create kodecraft
docker run --network kodecraft kodecraft:latest
```

### Container Communication

```yaml
# In docker-compose.yml
services:
  leader:
    networks:
      - kodecraft-network
  postgres:
    networks:
      - kodecraft-network

networks:
  kodecraft-network:
    driver: bridge
```

Access services by hostname within the network:
- `leader` → other containers
- `postgres` → database service
- `n8n` → orchestration service

---

## Development Workflow

### Development Mode

```bash
# Mount source code for live updates
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Or use volumes
docker run -v $(pwd)/src:/app/src kodecraft:latest
```

Create `docker-compose.dev.yml`:

```yaml
version: '3.8'

services:
  leader:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ./src:/app/src  # Live code mounting
      - ./logs:/app/logs
    environment:
      - NODE_ENV=development
```

Run with:

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Rebuild After Changes

```bash
# Rebuild image
docker-compose build --no-cache

# Restart services
docker-compose down
docker-compose up
```

---

## Common Issues & Solutions

### Issue: Xvfb not starting

```bash
# Check if Xvfb is installed in container
docker-compose exec leader which Xvfb

# Manual Xvfb start
docker-compose exec leader Xvfb :99 -screen 0 1920x1080x24
```

### Issue: Port already in use

```bash
# Find what's using the port
lsof -i :4001

# Kill process using port
kill -9 <PID>

# Or use different port
docker run -p 5001:4001 kodecraft:latest
```

### Issue: Container exits immediately

```bash
# Check logs
docker logs kodecraft-leader

# Run with interactive terminal to debug
docker run -it kodecraft:latest bash

# Check .env file
docker run --env-file .env kodecraft:latest
```

### Issue: High memory usage

```bash
# Check memory stats
docker stats

# Limit memory
docker run -m 2g kodecraft:latest

# In docker-compose.yml
deploy:
  resources:
    limits:
      memory: 2G
```

### Issue: Network connectivity

```bash
# Check container networking
docker inspect kodecraft-leader | grep -A 10 "NetworkSettings"

# Test DNS resolution
docker-compose exec leader nslookup postgres

# Check ports
docker port kodecraft-leader
```

---

## Cleanup

```bash
# Stop all services
docker-compose down

# Remove container
docker rm kodecraft-leader

# Remove image
docker rmi kodecraft:latest

# Remove all unused resources
docker system prune -a

# Remove specific volume
docker volume rm kodecraft-logs
```

---

## Next Steps

1. **Customize** the Dockerfile for your specific needs
2. **Configure** environment variables in `.env`
3. **Test** locally with `docker-compose up`
4. **Set up** optional services (PostgreSQL, n8n) in docker-compose.yml
5. **Deploy** to your hosting environment

---

## Additional Resources

- [Docker Official Documentation](https://docs.docker.com)
- [Docker Compose Docs](https://docs.docker.com/compose)
- [Node.js Docker Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Xvfb Documentation](http://www.xfree86.org/current/Xvfb.1.html)

---

## Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify .env file exists and has correct values
3. Test individual commands in container: `docker-compose exec leader bash`
4. Review the Dockerfile for your specific needs
5. Check Docker system resources: `docker stats`
