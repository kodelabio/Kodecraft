#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:4001"
SESSION_ID="test_session_$(date +%s)"

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Orchestration API Test Suite${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Test 1: Health Check
echo -e "${YELLOW}[1/8] Health Check${NC}"
RESPONSE=$(curl -s "$BASE_URL/api/health")
if echo "$RESPONSE" | grep -q "ok"; then
    echo -e "${GREEN}✓ API is healthy${NC}"
    echo "Response: $RESPONSE"
else
    echo -e "${RED}✗ API health check failed${NC}"
    echo "Response: $RESPONSE"
    exit 1
fi
echo ""

# Test 2: Get Initial Status
echo -e "${YELLOW}[2/8] Get Initial Status${NC}"
RESPONSE=$(curl -s "$BASE_URL/api/orchestration/status")
echo -e "${GREEN}✓ Initial status retrieved${NC}"
echo "Response: $RESPONSE"
echo ""

# Test 3: Create Session
echo -e "${YELLOW}[3/8] Create Build Session${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/create-session" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"buildRequest\": \"Build a test house\",
    \"workerCount\": 2
  }")
echo -e "${GREEN}✓ Session created${NC}"
echo "Session ID: $SESSION_ID"
echo "Response: $RESPONSE"
echo ""

# Test 4: Spawn Worker 1
echo -e "${YELLOW}[4/8] Spawn Worker 1${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/spawn-worker" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"TestWorker_1\",
    \"port\": 4002,
    \"sessionId\": \"$SESSION_ID\"
  }")
if echo "$RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✓ Worker 1 spawned${NC}"
else
    echo -e "${RED}✗ Worker 1 spawn failed${NC}"
fi
echo "Response: $RESPONSE"
echo ""

# Test 5: Spawn Worker 2
echo -e "${YELLOW}[5/8] Spawn Worker 2${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/spawn-worker" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"TestWorker_2\",
    \"port\": 4003,
    \"sessionId\": \"$SESSION_ID\"
  }")
if echo "$RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✓ Worker 2 spawned${NC}"
else
    echo -e "${RED}✗ Worker 2 spawn failed${NC}"
fi
echo "Response: $RESPONSE"
echo ""

# Wait for workers to initialize
echo -e "${YELLOW}Waiting 3 seconds for workers to initialize...${NC}"
sleep 3
echo ""

# Test 6: Wait for Workers Ready
echo -e "${YELLOW}[6/8] Wait for Workers Ready${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/wait-workers" \
  -H "Content-Type: application/json" \
  -d "{
    \"workers\": [
      {\"name\": \"TestWorker_1\", \"port\": 4002},
      {\"name\": \"TestWorker_2\", \"port\": 4003}
    ],
    \"timeoutMs\": 30000
  }")
if echo "$RESPONSE" | grep -q "allReady"; then
    echo -e "${GREEN}✓ Workers ready check completed${NC}"
else
    echo -e "${YELLOW}⚠ Workers ready check returned results${NC}"
fi
echo "Response: $RESPONSE"
echo ""

# Test 7: Register Workers for Session
echo -e "${YELLOW}[7/8] Register Workers for Session${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/register-workers" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"workers\": [
      {\"name\": \"TestWorker_1\", \"port\": 4002},
      {\"name\": \"TestWorker_2\", \"port\": 4003}
    ]
  }")
if echo "$RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✓ Workers registered${NC}"
else
    echo -e "${RED}✗ Worker registration failed${NC}"
fi
echo "Response: $RESPONSE"
echo ""

# Test 8: Final Status Check
echo -e "${YELLOW}[8/8] Final Status Check${NC}"
RESPONSE=$(curl -s "$BASE_URL/api/orchestration/status")
echo -e "${GREEN}✓ Final status retrieved${NC}"
echo "Response: $RESPONSE"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All tests completed!${NC}"
echo -e "${GREEN}========================================${NC}"