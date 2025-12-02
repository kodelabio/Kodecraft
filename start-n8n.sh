#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

# Start n8n with the correct environment variables for VS Code Dev Tunnels
export N8N_PROXY_HOPS=1
export WEBHOOK_URL="${WEBHOOK_URL:-https://jzgsxmxd-5678.inc1.devtunnels.ms}"
export N8N_EDITOR_BASE_URL="${N8N_EDITOR_BASE_URL:-https://jzgsxmxd-5678.inc1.devtunnels.ms}"
export WEBHOOK_TUNNEL_URL="${WEBHOOK_TUNNEL_URL:-https://jzgsxmxd-5678.inc1.devtunnels.ms}"

# Optional: Set these to avoid deprecation warnings
export DB_SQLITE_POOL_SIZE="${DB_SQLITE_POOL_SIZE:-3}"
export N8N_RUNNERS_ENABLED="${N8N_RUNNERS_ENABLED:-true}"
export N8N_BLOCK_ENV_ACCESS_IN_NODE="${N8N_BLOCK_ENV_ACCESS_IN_NODE:-false}"
export N8N_GIT_NODE_DISABLE_BARE_REPOS="${N8N_GIT_NODE_DISABLE_BARE_REPOS:-true}"

echo "=========================================="
echo "Starting n8n with Dev Tunnel configuration"
echo "=========================================="
echo "Webhook URL: $WEBHOOK_URL"
echo "Editor Base URL: $N8N_EDITOR_BASE_URL"
echo ""
echo "IMPORTANT: Access n8n ONLY through the Dev Tunnel URL above"
echo "Do NOT use http://localhost:5678 - it will cause origin errors"
echo "=========================================="
echo ""

n8n start
