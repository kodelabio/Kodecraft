#!/bin/bash
set -e

echo "Starting Kodecraft application..."
# Aggressively clean up stale Xvfb
echo "Cleaning up stale Xvfb..."
pkill -9 Xvfb 2>/dev/null || true
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 2>/dev/null || true
sleep 1

# Start Xvfb in background with retry
echo "Starting Xvfb virtual display..."
for i in {1..3}; do
    if Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 &
    then
        XVFB_PID=$!
        echo "✓ Xvfb started (PID: $XVFB_PID)"
        break
    else
        echo "Attempt $i/3: Xvfb start failed, retrying..."
        sleep 2
    fi
done

# Set display variable
export DISPLAY=:99

# Wait for Xvfb to be ready
sleep 5

# Trap exit to clean up processes
trap "kill $XVFB_PID 2>/dev/null || true" EXIT

# Wait for Minecraft server to be ready
echo "Waiting for Minecraft server to be ready (${MINECRAFT_HOST}:${MINECRAFT_PORT})..."
MAX_ATTEMPTS=60
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if nc -z ${MINECRAFT_HOST:-minecraft-server} ${MINECRAFT_PORT:-55916} 2>/dev/null; then
    echo "✓ Minecraft server is ready!"
    break
  fi
  
  ATTEMPT=$((ATTEMPT + 1))
  echo "  Attempt $ATTEMPT/$MAX_ATTEMPTS: Waiting for Minecraft server..."
  sleep 1
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
  echo "✗ Minecraft server did not start in time"
  exit 1
fi

# Start Node application
echo "Starting Node application..."
exec node --env-file=.env main.js