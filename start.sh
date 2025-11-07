#!/bin/bash

# Kill any existing processes
pkill -f "Xvfb :99" 2>/dev/null
pkill -f "node main.js" 2>/dev/null

# Wait a moment for processes to terminate
sleep 1

# Start Xvfb in background
Xvfb :99 -screen 0 1920x1080x24 &

# Set display variable
export DISPLAY=:99

# Start node main.js in background with logs redirected to a file
node main.js >> main.log 2>&1 &

echo "Processes started. Logs being written to main.log"