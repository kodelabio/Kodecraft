# Multi-User Bot Architecture - Implementation Guide

## Overview

Your system routes Telegram user requests through an API Gateway (port 4001) to individual leader bots (ports 5000+), each with their own worker pools (ports 7000+).

```
n8n Workflows (receives Telegram message via webhook)
    ↓ (looks up player in MongoDB Players table)
    ↓ (calls HTTP endpoint)
API Gateway (port 4001)
    ↓ (routes to appropriate leader bot)
Alice's Leader Bot (port 5000)  │  Bob's Leader Bot (port 5001)  │  Charlie's Leader Bot (port 5002)
    ├─ Workers 7000-7009        │      ├─ Workers 7010-7019       │      └─ Workers 7020-7029
    └─ ExternalAPI              │      └─ ExternalAPI              │
        ↓                       │          ↓                       │
    Minecraft Server            └──────────────────────────────────┘
        ↓                                   ↓
    MongoDB (n8n manages all CRUD)
```

---

## Architecture Components

### 1. **API Gateway** (port 4001)
- Routes requests by userId
- Forwards to correct leader bot
- Admin endpoints for status/control
- **File:** `src/api/api_server.js`
- **Port:** `API_GATEWAY_PORT` from settings

### 2. **Leader Bots** (ports 5000+)
- One bot per Telegram user
- Spawned on-demand via `LeaderBotManager`
- Each runs `init_agent.js` with `AgentProcess`
- Has `ExternalAPI` for REST endpoints
- **Port Range:** `LEADER_BOT_BASE_PORT` to `LEADER_BOT_BASE_PORT + MAX_LEADER_BOTS`
- **Max per server:** `MAX_LEADER_BOTS` (default 50)

### 3. **Worker Bots** (ports 7000+)
- Spawned by each leader bot for builds
- Pre-allocated port range per user
- **Alice (user 0):** workers 7000-7009
- **Bob (user 1):** workers 7010-7019
- **Charlie (user 2):** workers 7020-7029
- **Max per user:** `MAX_WORKERS_PER_USER` (default 10)

### 4. **n8n Workflows**
- Receives Telegram webhook
- Queries MongoDB Players table (no JS code)
- Calls API Gateway endpoints
- Stores/updates builds in MongoDB
- All CRUD operations handled by n8n

### 5. **MongoDB**
- Stores user accounts, build sessions, tasks, history
- Accessed only by n8n workflows
- JS code only handles: connection, password encryption, health checks

---

## File Structure

```
src/
├── api/
│   ├── api_server.js              ← NEW: Gateway router (port 4001)
│   └── user_manager.js            ← MongoDB password encryption only
│
├── agent/
│   ├── leader_bot_manager.js      ← NEW: Spawn/manage leader bots
│   ├── external_api.js            ← EXISTING: Agent & orchestration endpoints
│   ├── orchestration_api.js       ← EXISTING: Worker spawning & coordination
│   └── agent.js                   ← EXISTING
│
└── process/
    ├── init_agent.js              ← EXISTING: Spawned by AgentProcess
    └── agent_process.js           ← EXISTING: Process manager for agents

main.js                             ← UPDATED: Simple startup

.env                                ← Configuration
settings.js                         ← Settings from .env
```

---

## Configuration

### .env Variables

```bash
# API Gateway
API_GATEWAY_PORT=4001

# Leader Bots
LEADER_BOT_BASE_PORT=5000
MAX_LEADER_BOTS=50
LEADER_BOT_IDLE_TIMEOUT=3600000

# Worker Bots
WORKER_BASE_PORT=7000
MAX_WORKERS_PER_USER=10

# MongoDB
MONGODB_URI=mongodb://localhost:27017/minecraft-bots
ENCRYPTION_KEY=your-secure-key-min-32-chars

# Minecraft
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565

# n8n Webhooks (optional, for callbacks)
N8N_WEBHOOK_URL=http://localhost:5678/webhook/worker
```

### Port Allocation by User

| User Index | Leader Bot | Worker Range | Max Workers |
|------------|-----------|--------------|-------------|
| 0 (Alice) | 5000 | 7000-7009 | 10 |
| 1 (Bob) | 5001 | 7010-7019 | 10 |
| 2 (Charlie) | 5002 | 7020-7029 | 10 |
| ... | ... | ... | ... |
| 49 | 5049 | 7490-7499 | 10 |

---

## Usage Flow

### 1. User Sends Telegram Command

```
User sends: "/build house"
    ↓
Telegram webhook → n8n workflow
```

### 2. n8n Workflow

```
1. Receive message webhook
2. Extract user ID from message
3. Query MongoDB Players table → get botName
4. Call: POST http://localhost:4001/api/user/init-bot
   {
     "userId": "123456789",
     "botName": "alice_bot"
   }
5. Response: { port: 5000, status: "ready" }
6. Call: POST http://localhost:4001/api/orchestration/123456789/spawn-worker
   {
     "name": "Worker_1",
     "port": 7000,
     "sessionId": "build_123"
   }
7. Continue with build orchestration...
8. Update MongoDB with build results
```

### 3. API Gateway Routes It

```
POST http://localhost:4001/api/orchestration/123456789/spawn-worker
    ↓ (api_server.js)
    ├─ Extract userId: "123456789"
    ├─ Lookup port: 5000 (Alice's bot)
    ├─ Forward to: POST http://localhost:5000/api/orchestration/spawn-worker
    │   (external_api.js on Alice's bot)
    │
    └─ Response returned to n8n
```

### 4. Leader Bot Spawns Worker

```
Alice's bot (port 5000)
    ↓
LeaderBotManager.spawnWorker()
    ├─ Validate port 7000 is in range 7000-7009 ✓
    ├─ Check max workers not exceeded ✓
    ├─ Spawn: node init_agent.js -n Worker_1 -p 7000 ...
    │   (AgentProcess manages the process)
    │
    └─ Worker_1 ready on port 7000
```

---

## Key Endpoints

### Initialize User Bot

```bash
POST http://localhost:4001/api/user/init-bot
Content-Type: application/json

{
  "userId": "123456789",
  "botName": "alice_bot"
}
```

**Response:**
```json
{
  "success": true,
  "userId": "123456789",
  "port": 5000,
  "status": "ready",
  "botName": "alice_bot"
}
```

### Spawn Worker

```bash
POST http://localhost:4001/api/orchestration/{userId}/spawn-worker
Content-Type: application/json

{
  "name": "Worker_1",
  "port": 7000,
  "sessionId": "build_123"
}
```

### Agent Command

```bash
POST http://localhost:4001/api/agent/{userId}/move
Content-Type: application/json

{
  "direction": "forward"
}
```

### Orchestration Commands

```bash
# Create session
POST http://localhost:4001/api/orchestration/{userId}/create-session
{ "sessionId": "build_123", "buildRequest": "Build a house", "workerCount": 3 }

# Register workers
POST http://localhost:4001/api/orchestration/{userId}/register-workers
{ "sessionId": "build_123", "workers": [{"name": "Worker_1", "port": 7000}, ...] }

# Reserve location
POST http://localhost:4001/api/orchestration/{userId}/reserve-location
{ "sessionId": "build_123", "preferredLocation": {"x": 0, "y": 64, "z": 0} }

# Teleport workers
POST http://localhost:4001/api/orchestration/{userId}/teleport-workers
{ "sessionId": "build_123", "buildLocation": {"x": 0, "y": 65, "z": 0} }

# Send task
POST http://localhost:4001/api/orchestration/{userId}/send-task
{ "workerPort": 7000, "taskPrompt": "Build foundation" }
```

### Admin Endpoints

```bash
# Get status
GET http://localhost:4001/api/admin/status

# Stop specific bot
POST http://localhost:4001/api/admin/stop-bot/123456789

# Stop all bots
POST http://localhost:4001/api/admin/stop-all
```

---

## How It Differs From Old System

### Old: KodecraftManager
- Pre-loaded agents from profile files at startup
- Single set of agents for all users
- Manual control panel management
- ❌ Can't scale to multiple concurrent users

### New: Multi-User
- Agents spawned on-demand when users connect
- One agent per Telegram user
- n8n workflows provide the control
- ✅ Scales to 50+ concurrent users
- ✅ Each user has isolated workers
- ✅ Parallel builds (users don't block each other)

---

## MongoDB vs Old Database

### Old: SQLite (if used)
- Single file: `data/users.db`
- JS code did all CRUD operations
- Limited to single-server deployment

### New: MongoDB
- Network-accessible database
- n8n handles all CRUD operations
- JS code only: password encryption + connection
- Better for multi-server/cloud deployments

---

## Performance Characteristics

### Memory Usage
```
API Gateway: ~50MB
Leader Bot (per user): ~150MB
Worker Bots (per user, 10 max): ~100MB × 10 = 1GB
Total per user: ~1.1GB
Total for 50 users: ~55GB
```

### Response Times
```
API Gateway routing: 1-2ms
Leader bot startup: 3-5s
Worker bot startup: 1-2s per worker
```

### Scaling
```
Single 8GB server: 8-10 concurrent users
Single 32GB server: 50+ concurrent users
Multi-server: Unlimited (horizontal scaling)
```

---

## Troubleshooting

### Bot Not Spawning

```bash
# Check if port is available
lsof -i :5000

# Check logs for errors
npm start 2>&1 | grep -i error

# Verify Minecraft server is running
ping localhost:25565
```

### Request Goes to Wrong Bot

```bash
# Verify user ID in URL matches Telegram ID
# Check api_server.js forwards to correct port
curl http://localhost:4001/api/admin/status | jq '.bots'
```

### Workers Won't Spawn

```bash
# Check worker port range isn't blocked
lsof -i :7000-7009

# Verify OrchestrationAPI validates port range
# Port 7000 = ok for user 0 (Alice)
# Port 7015 = error for user 0 (out of range)
```

### MongoDB Connection Error

```bash
# Verify MongoDB is running
mongosh mongodb://localhost:27017

# Check MONGODB_URI in .env
# Check connection string format
```

---

## Testing Checklist

- [ ] API Gateway starts on port 4001
- [ ] Initialize bot: returns port 5000
- [ ] Leader bot health check works: `GET localhost:5000/api/health`
- [ ] Can send agent command to user's bot
- [ ] Can spawn worker on correct port range
- [ ] Admin status shows active bots
- [ ] Multiple users spawn independently (no conflict)
- [ ] Worker ports don't overlap between users
- [ ] n8n can call all endpoints
- [ ] MongoDB stores build data (via n8n)

---

## Next Steps

1. **Start the system:**
   ```bash
   npm start
   ```

2. **Test API Gateway:**
   ```bash
   curl http://localhost:4001/api/health
   ```

3. **Initialize a user bot (via curl or n8n):**
   ```bash
   curl -X POST http://localhost:4001/api/user/init-bot \
     -H "Content-Type: application/json" \
     -d '{"userId": "123456789", "botName": "test_bot"}'
   ```

4. **Test agent command:**
   ```bash
   curl -X POST http://localhost:4001/api/agent/123456789/status
   ```

5. **Create n8n workflow** that calls these endpoints

6. **Monitor with:**
   ```bash
   curl http://localhost:4001/api/admin/status | jq
   ```

---

## Key Files Reference

| File | Purpose | Port |
|------|---------|------|
| `main.js` | Entry point | - |
| `api_server.js` | Gateway router | 4001 |
| `leader_bot_manager.js` | Spawn/manage bots | - |
| `external_api.js` | Agent endpoints | 5000+ |
| `orchestration_api.js` | Worker coordination | - |
| `agent_process.js` | Process management | - |
| `init_agent.js` | Agent startup | - |

All ports read from settings/env.
