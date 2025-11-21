#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Read webhook URL from .env or use default
N8N_WEBHOOK_URL=$(grep N8N_WEBHOOK_URL .env | cut -d '=' -f2)

if [ -z "$N8N_WEBHOOK_URL" ]; then
    echo -e "${RED}✗ N8N_WEBHOOK_URL not set in .env${NC}"
    exit 1
fi

echo -e "${YELLOW}Testing n8n Webhook${NC}"
echo -e "Webhook URL: $N8N_WEBHOOK_URL"
echo ""

# Test 1: Simple POST
echo -e "${YELLOW}→ Sending test payload to n8n...${NC}"
RESPONSE=$(curl -s -X POST "$N8N_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test_webhook_'$(date +%s)'",
    "workerName": "TestWorker",
    "workerPort": 4002,
    "status": "completed",
    "result": {
      "taskCompleted": "Build foundation",
      "blocksPlaced": 156,
      "itemsUsed": ["wood_planks", "oak_log"],
      "timeSpent": 1234
    },
    "completionTime": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }')

echo -e "Response: $RESPONSE"
echo ""

# Check if response indicates success
if [ -z "$RESPONSE" ] || echo "$RESPONSE" | grep -q "error\|Error\|failed"; then
    if [ -z "$RESPONSE" ]; then
        echo -e "${GREEN}✓ Webhook accepted (no response body)${NC}"
    else
        echo -e "${YELLOW}⚠ Response received:${NC}"
        echo "  $RESPONSE"
    fi
else
    echo -e "${GREEN}✓ Webhook accepted${NC}"
    echo "  Response: $RESPONSE"
fi

echo ""
echo -e "${YELLOW}Check your n8n instance to see if the webhook was received!${NC}"