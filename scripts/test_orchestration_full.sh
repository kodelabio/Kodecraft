#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BASE_URL="http://localhost:4001"
SESSION_ID="test_session_$(date +%s)"

print_header() {
    echo -e "\n${BLUE}================== $1 ==================${NC}"
}

print_test() {
    echo -e "${YELLOW}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_header "ORCHESTRATION API TEST SUITE"

# Test 1: Health Check
print_test "Health Check"
RESPONSE=$(curl -s "$BASE_URL/api/health")
if echo "$RESPONSE" | grep -q "ok"; then
    print_success "API is healthy"
    echo "  Response: $RESPONSE"
else
    print_error "API health check failed"
    echo "  Response: $RESPONSE"
    exit 1
fi

# Test 2: Initial Status
print_test "Get Initial Status"
RESPONSE=$(curl -s "$BASE_URL/api/orchestration/status")
if echo "$RESPONSE" | grep -q "totalWorkers"; then
    print_success "Status retrieved"
    echo "  Response: $RESPONSE" | head -c 200
    echo "..."
else
    print_error "Failed to get status"
fi

# Test 3: Create Session
print_test "Create Build Session"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/create-session" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"buildRequest\": \"Build a test house\",
    \"workerCount\": 2
  }")
if echo "$RESPONSE" | grep -q "success"; then
    print_success "Session created: $SESSION_ID"
    echo "  Response: $RESPONSE" | head -c 200
else
    print_error "Session creation failed"
    echo "  Response: $RESPONSE"
fi

# Test 4: Spawn Worker 1
print_test "Spawn Worker 1"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/spawn-worker" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"TestWorker_1\",
    \"port\": 4002,
    \"sessionId\": \"$SESSION_ID\"
  }")
if echo "$RESPONSE" | grep -q "success"; then
    print_success "Worker 1 spawned on port 4002"
    echo "  Response: $RESPONSE" | head -c 200
else
    print_error "Worker 1 spawn failed"
    echo "  Response: $RESPONSE"
fi

# Test 5: Spawn Worker 2
print_test "Spawn Worker 2"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/spawn-worker" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"TestWorker_2\",
    \"port\": 4003,
    \"sessionId\": \"$SESSION_ID\"
  }")
if echo "$RESPONSE" | grep -q "success"; then
    print_success "Worker 2 spawned on port 4003"
    echo "  Response: $RESPONSE" | head -c 200
else
    print_error "Worker 2 spawn failed"
    echo "  Response: $RESPONSE"
fi

# Wait for initialization
print_test "Waiting 3 seconds for workers to initialize..."
sleep 3

# Test 6: Wait for Workers
print_test "Wait for Workers Ready"
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
    print_success "Workers ready check completed"
    echo "  Response: $RESPONSE" | head -c 200
else
    print_error "Workers ready check failed"
    echo "  Response: $RESPONSE" | head -c 200
fi

# Test 7: Register Workers
print_test "Register Workers for Session"
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
    print_success "Workers registered"
    echo "  Response: $RESPONSE" | head -c 200
else
    print_error "Worker registration failed"
    echo "  Response: $RESPONSE" | head -c 200
fi

# Test 8: Reserve Location
print_test "Reserve Build Location"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/reserve-location" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"preferredLocation\": {\"x\": 0, \"y\": 64, \"z\": 0},
    \"minDistance\": 30
  }")
if echo "$RESPONSE" | grep -q "success"; then
    print_success "Location reserved"
    echo "  Response: $RESPONSE" | head -c 200
else
    print_error "Location reservation failed"
    echo "  Response: $RESPONSE" | head -c 200
fi

# Test 9: Teleport Workers
print_test "Teleport Workers to Build Location"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/teleport-workers" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"buildLocation\": {\"x\": 0, \"y\": 64, \"z\": 0}
  }")
if echo "$RESPONSE" | grep -q "success"; then
    print_success "Workers teleported"
    echo "  Response: $RESPONSE" | head -c 200
else
    print_error "Worker teleportation failed"
    echo "  Response: $RESPONSE" | head -c 200
fi

# Test 10: Send Task
print_test "Send Task to Worker 1"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/send-task" \
  -H "Content-Type: application/json" \
  -d "{
    \"workerPort\": 4002,
    \"taskPrompt\": \"Build the foundation of a house at your current location\"
  }")
if echo "$RESPONSE" | grep -q "success"; then
    print_success "Task sent to worker"
    echo "  Response: $RESPONSE" | head -c 200
else
    print_error "Task sending failed"
    echo "  Response: $RESPONSE" | head -c 200
fi

# Test 11: Final Status
print_test "Final Status Check"
RESPONSE=$(curl -s "$BASE_URL/api/orchestration/status")
if echo "$RESPONSE" | grep -q "totalWorkers"; then
    print_success "Final status retrieved"
    echo "  Response: $RESPONSE" | head -c 200
    echo "..."
else
    print_error "Failed to get final status"
fi

# Test 12: Stop Worker
print_test "Stop Worker 1"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/stop-worker" \
  -H "Content-Type: application/json" \
  -d "{\"workerName\": \"TestWorker_1\"}")
if echo "$RESPONSE" | grep -q "success"; then
    print_success "Worker 1 stopped"
    echo "  Response: $RESPONSE" | head -c 200
else
    print_error "Failed to stop worker 1"
    echo "  Response: $RESPONSE" | head -c 200
fi

# Test 13: Stop All Workers
print_test "Stop All Workers"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestration/stop-all")
if echo "$RESPONSE" | grep -q "success"; then
    print_success "All workers stopped"
    echo "  Response: $RESPONSE"
else
    print_error "Failed to stop all workers"
    echo "  Response: $RESPONSE"
fi

print_header "ALL TESTS COMPLETED ✓"