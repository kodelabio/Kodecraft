# Realms System Documentation

## Overview

The Realms system divides the Minecraft world into isolated regions, where each leader bot operates within designated boundaries. Leaders and their workers are confined to their assigned realm, preventing resource conflicts and enabling multi-leader gameplay.

## Architecture

### Core Components

```
APIServer (Single Instance)
    ├── worldInfo (fetched from first bot)
    └── globalRealmManager (RealmManager)
            ├── Initialized with worldInfo
            ├── Stores all realm definitions
            └── Used for allocation and admin operations

Leader Bot Instance (Per Leader)
    └── ExternalAPI
        └── OrchestrationAPI
            └── realmManager (RealmManager)
                    └── References same realm definitions
                    └── Validates movements against realm bounds

Worker Bot Instance (Per Worker)
    └── ExternalAPI
        └── OrchestrationAPI
            └── realmManager (RealmManager)
                    └── References same realm definitions
                    └── Validates movements against realm bounds
```

### Initialization Flow

```
APIServer starts
    ↓
RealmManager = null (waiting for world info)
    ↓
First bot spawns via init-bot
    ↓
APIServer.initializeWorldInfo(userId)
    ├─ Fetch world info from bot's /api/agent/{userId}/world-info
    ├─ Create RealmManager(worldInfo)
    ├─ Initialize world bounds based on world type
    └─ Ready for realm allocations
    ↓
Subsequent realm operations use globalRealmManager
```

### RealmManager Class

Located in `src/agent/realm_manager.js`

**Constructor:**
```javascript
constructor(worldInfo = null) {
    this.realms = new Map();
    this.leaderRealms = new Map();
    this.worldInfo = worldInfo;
    
    if (worldInfo) {
        this.initializeWorldBounds();
    }
}
```

**Initialization:**
- Created **only** when world info is available
- Automatically determines world bounds based on world type
- Supports Flat, Default/Normal, Amplified, Large Biomes, and custom worlds

**Core Responsibilities:**
- Define new realms with boundaries
- Register leaders and workers to realms
- Validate positions against realm bounds
- Find available space for new realms
- Calculate realm size based on leader priority
- Detect overlapping realm boundaries
- Initialize world bounds based on Minecraft world type

**Key Methods:**

```javascript
// Initialize world bounds (called in constructor if worldInfo provided)
initializeWorldBounds()

// Define a new realm
defineRealm(realmId, leaderId, bounds)

// Register a leader or worker to a realm
registerLeaderToRealm(leaderId, realmId)
registerWorkerToRealm(workerName, realmId)

// Validate movement
validateMovement(position, realmId)

// Find available space for new realm
findAvailableRealmSpace(realmSize, padding = 50)

// Calculate realm size from priority value
calculateRealmSize(leader_pr_value)

// Check if two realms overlap
boundsOverlap(bounds1, bounds2, padding = 50)
```

## Realm Lifecycle

### 0. World Initialization (First Bot Connection)

**Trigger**: First leader bot is spawned and ready

**Flow:**
```
APIServer.handleInitBot()
    ├─ Spawn first bot via LeaderBotManager
    ├─ Wait for bot to be ready
    ├─ Call APIServer.initializeWorldInfo(userId)
    │   ├─ Fetch world info from bot's /api/agent/{userId}/world-info
    │   ├─ Create RealmManager(worldInfo)
    │   └─ Initialize world bounds based on world type
    └─ Return bot ready + world initialized
```

**World Info Retrieved:**
```json
{
    "dimension": "overworld",
    "minY": -64,
    "maxY": 320,
    "worldType": "flat",
    "difficulty": "peaceful",
    "spawnPoint": { "x": 0, "y": -60, "z": 0 }
}
```

**RealmManager Initialization:**
- **flat world**: Uses default bounds (±10,000)
- **default/normal world**: Uses world border bounds (±29,999,984)
- **custom world**: Uses spawn point as center with ±10,000 buffer

### 1. Realm Allocation (First-Time Login)

**Trigger**: n8n workflow detects new leader without assigned realm

**Flow:**
```
n8n Workflow
    ↓
POST /api/admin/realm/allocate
    ↓
APIServer.handleAllocateRealm()
    ├─ Extract userId, leader_pr_value
    ├─ Call realmManager.calculateRealmSize(leader_pr_value)
    ├─ Call realmManager.findAvailableRealmSpace(size)
    ├─ Call realmManager.defineRealm(realmId, userId, bounds)
    └─ Return realmId + bounds
    ↓
n8n stores in database:
    ├─ userId → realmId mapping
    ├─ realmId → bounds (minX, maxX, minZ, maxZ, minY, maxY)
    └─ leader_pr_value
```

**Request:**
```json
POST /api/admin/realm/allocate
{
    "userId": "player_123",
    "leader_pr_value": 100
}
```

**Response:**
```json
{
    "success": true,
    "realmId": "realm_player_123_1704067200000",
    "userId": "player_123",
    "bounds": {
        "minX": 0,
        "maxX": 300,
        "minZ": 0,
        "maxZ": 300,
        "minY": 0,
        "maxY": 320
    },
    "size": 300
}
```

### 2. Leader Initialization (Login)

**Trigger**: User logs in via n8n

**Flow:**
```
n8n Workflow
    ├─ Query database for userId's realmId
    ↓
POST /api/user/init-bot
    ├─ userId
    ├─ botName
    ├─ playerPosition (optional)
    └─ realmId (from database)
    ↓
APIServer.handleInitBot()
    ↓
LeaderBotManager.getOrSpawnLeaderBot(userId, botName, playerPosition, realmId)
    ├─ Check if bot already running
    ├─ If not, call spawnLeaderBot()
    ↓
LeaderBotManager.spawnLeaderBot()
    ├─ Create AgentProcess
    ├─ Start process (init_agent.js)
    ├─ Wait for health check
    ├─ If realmId exists:
    │   └─ POST /api/orchestration/{userId}/init-realm
    ↓
ExternalAPI.handleInitRealm()
    ├─ Register leader to realm
    ├─ Store this.leaderRealmId
    └─ Add realm validation middleware to movement endpoints
```

**Request:**
```json
POST /api/user/init-bot
{
    "userId": "player_123",
    "botName": "MyLeader",
    "playerPosition": { "x": 150, "y": 64, "z": 150 },
    "realmId": "realm_player_123_1704067200000"
}
```

### 3. Realm Assignment to Leader

**Called by**: LeaderBotManager after bot is ready

```
POST /api/orchestration/{userId}/init-realm
{
    "realmId": "realm_player_123_1704067200000"
}
```

**ExternalAPI.handleInitRealm()** does:
1. Validates realm exists in `globalRealmManager`
2. Stores `this.leaderRealmId = realmId`
3. Registers leader via `realmManager.registerLeaderToRealm(userId, realmId)`
4. Returns success

### 4. Worker Spawning Within Realm

**Trigger**: n8n calls orchestration to spawn workers

**Flow:**
```
n8n Workflow
    ↓
POST /api/orchestration/spawn-worker
    ├─ name
    ├─ port
    ├─ sessionId
    └─ realmId (from leader's realm)
    ↓
ExternalAPI.handleOrchestrationSpawnWorker()
    ↓
OrchestrationAPI.spawnWorker(name, port, sessionId, realmId)
    ├─ Register worker to realm
    ├─ Get realm bounds
    ├─ Calculate safe position within realm
    ├─ Spawn worker process
    ├─ Move worker to safe position within realm bounds
    └─ Return success
```

## Realm Validation

### Leader Movement Validation

All movement endpoints are protected by `validateLeaderRealm` middleware:

```
Endpoints protected:
- POST /api/agent/move
- POST /api/agent/goToCoordinates
- POST /api/agent/goToPlayer
- POST /api/agent/moveAway
- POST /api/agent/searchForBlock
- POST /api/agent/searchForEntity
- POST /api/agent/teleport
- POST /api/agent/goToRememberedPlace
```

**How it works:**
1. Middleware extracts target coordinates from request body
2. Calls `realmManager.validateMovement(position, leaderRealmId)`
3. If outside bounds: return 403 with error
4. If inside bounds: proceed to handler

**Response (Trespass Attempt):**
```json
{
    "error": "Trespass detected! Position {\"x\":500,\"y\":64,\"z\":500} outside realm realm_player_123",
    "code": "realm_trespass",
    "realmBounds": {
        "minX": 0,
        "maxX": 300,
        "minZ": 0,
        "maxZ": 300,
        "minY": 0,
        "maxY": 320
    },
    "attemptedPosition": { "x": 500, "y": 64, "z": 500 }
}
```

### Worker Movement Validation

All worker movement endpoints are protected by `validateWorkerRealm` middleware:

```
Endpoints protected:
- POST /api/agent/teleport-worker
- POST /api/orchestration/teleport-worker
- POST /api/orchestration/teleport-workers
- POST /api/orchestration/teleport-to-player
- POST /api/orchestration/move-worker-to-player
- POST /api/orchestration/move-worker-to
```

**How it works:**
1. Middleware extracts target position from request
2. Gets sessionId to find assigned realm
3. Calls `realmManager.validateMovement(targetPos, sessionRealmId)`
4. If outside bounds: return 403 with error
5. If inside bounds: proceed to handler

## Data Storage

### Database Schema

Realms are stored in your database with the following structure:

```sql
CREATE TABLE realms (
    realm_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE NOT NULL,
    leader_pr_value INT,
    min_x INT NOT NULL,
    max_x INT NOT NULL,
    min_z INT NOT NULL,
    max_z INT NOT NULL,
    min_y INT DEFAULT 0,
    max_y INT DEFAULT 320,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### n8n Workflow Storage

**Step 1: Define Realm** (when allocating)
```
HTTP POST to /api/admin/realm/allocate
    ↓
Store in database:
    - realm_id
    - user_id
    - leader_pr_value
    - bounds (min_x, max_x, min_z, max_z, min_y, max_y)
```

**Step 2: Retrieve Realm** (on login)
```
Query database:
    SELECT realm_id, bounds FROM realms WHERE user_id = ?
    ↓
Pass realm_id to POST /api/user/init-bot
```

**Step 3: Create Session** (when spawning workers)
```
Store session with:
    - sessionId
    - realmId (from leader's realm)
    - workerCount
    - buildRequest
```

## Realm Size Calculation

**Formula:**
```
realmSize = floor(baseSize * (leader_pr_value / 100))

Where:
- baseSize = 300 blocks (default)
- leader_pr_value = priority value (1-500+)

Examples:
- leader_pr_value = 50  → realm = 150 blocks
- leader_pr_value = 100 → realm = 300 blocks
- leader_pr_value = 200 → realm = 600 blocks
```

**Implementation:**
```javascript
calculateRealmSize(leader_pr_value) {
    const baseSize = 300;
    const multiplier = leader_pr_value / 100;
    return Math.floor(baseSize * multiplier);
}
```

## Space Allocation Algorithm

When allocating a new realm, the system:

1. **Calculate realm size** from `leader_pr_value`
2. **Scan world grid** starting from worldMinX, worldMinZ
3. **For each potential location:**
   - Check if it overlaps with existing realms (with padding)
   - If no conflict: reserve this space
   - If conflict: move to next grid position
4. **Return bounds** or error if world is full

**World boundaries (default):**
```
minX: -10,000
maxX: 10,000
minZ: -10,000
maxZ: 10,000
```

**Grid spacing:**
- Stride = `realmSize + padding` (default padding = 50)
- Prevents realms from being too close

**Overlap detection:**
```
Two realms overlap if:
NOT (realm1.maxX + padding < realm2.minX OR
     realm1.minX - padding > realm2.maxX OR
     realm1.maxZ + padding < realm2.minZ OR
     realm1.minZ - padding > realm2.maxZ)
```

## Configuration

### World Type Handling

**RealmManager automatically configures world bounds based on world type:**

```javascript
// In RealmManager.initializeWorldBounds()

if (worldInfo.worldType === 'flat') {
    // Flat worlds: limited size
    worldBounds = {
        minX: -10000, maxX: 10000,
        minZ: -10000, maxZ: 10000
    };
}
else if (worldInfo.worldType === 'default' || worldInfo.worldType === 'normal') {
    // Default/Normal: full world border
    worldBounds = {
        minX: -29999984, maxX: 29999984,
        minZ: -29999984, maxZ: 29999984
    };
}
else {
    // Custom: use spawn point as center
    const buffer = 10000;
    worldBounds = {
        minX: spawnPoint.x - buffer, maxX: spawnPoint.x + buffer,
        minZ: spawnPoint.z - buffer, maxZ: spawnPoint.z + buffer
    };
}
```

### Settings (settings.js)

```javascript
"max_leader_bots": parseInt(process.env.MAX_LEADER_BOTS) || 5,
"realm_base_size": 4000,          // Base realm size (modified by leader_pr_value)
"realm_padding": 50,              // Gap between realms to prevent overlap
```

### World Boundaries (Automatic)

World bounds are determined at runtime based on the Minecraft world type, not hardcoded.

## API Reference

### Server Endpoints

**Get World Info** (Called by APIServer on first bot connection)
```
GET /api/agent/{userId}/world-info
Response: { dimension, minY, maxY, worldType, difficulty, spawnPoint }
```

### Admin Endpoints

**Allocate Realm**
```
POST /api/admin/realm/allocate
Body: { userId, leader_pr_value }
Response: { realmId, bounds, size }
```

**Get Realm**
```
GET /api/admin/realm/{realmId}
Response: { realm }
```

**List All Realms**
```
GET /api/admin/realms
Response: { realms: [] }
```

### User Endpoints

**Initialize Bot**
```
POST /api/user/init-bot
Body: { userId, botName, playerPosition?, realmId? }
Response: { port, realmId, status }
```

### Orchestration Endpoints

**Initialize Leader in Realm**
```
POST /api/orchestration/{userId}/init-realm
Body: { realmId }
Response: { success, userId, realmId }
```

**Spawn Worker in Realm**
```
POST /api/orchestration/spawn-worker
Body: { name, port, sessionId, realmId }
Response: { success, workerName, port, status }
```

## Error Handling

### Realm Not Found
```json
{
    "error": "Realm realm_xyz not found",
    "code": "realm_not_found",
    "status": 404
}
```

### Trespass Attempt
```json
{
    "error": "Trespass detected! Position outside realm",
    "code": "realm_trespass",
    "status": 403,
    "realmBounds": { ... }
}
```

### No Available Space
```json
{
    "error": "No available space for realm",
    "code": "no_space",
    "status": 400
}
```

### Realm Already Assigned
```json
{
    "error": "User already has realm assigned",
    "code": "realm_exists",
    "status": 409
}
```

## Example Workflow (n8n)

### Flow: New Player Login

```
1. HTTP Request: GET user realm from database
   ├─ If exists: realmId = ${realm_id}
   ├─ If not exists: realmId = null

2. If no realm:
   └─ HTTP POST /api/admin/realm/allocate
      ├─ userId: ${userId}
      ├─ leader_pr_value: ${user.priority}
      └─ Store response.realmId in database

3. HTTP POST /api/user/init-bot
   ├─ userId: ${userId}
   ├─ botName: ${user.name}
   ├─ playerPosition: ${player.position}
   └─ realmId: ${realmId}

4. Wait for response with port

5. (Optional) If building with workers:
   ├─ HTTP POST /api/orchestration/spawn-worker
   │  └─ realmId: ${realmId}
   └─ Workers spawn within same realm
```

## Monitoring & Debugging

### Check All Realms
```bash
curl http://localhost:3000/api/admin/realms
```

### Check Specific Realm
```bash
curl http://localhost:3000/api/admin/realm/realm_player_123
```

### Check Leader Status
```bash
curl http://localhost:3000/api/agent/player_123/status
```

### View Realm in Bot Logs
```
Look for: "🏰 Leader player_123 initialized in realm realm_xyz"
```

## Troubleshooting

### Leader Spawned Outside Realm
**Problem**: Leader appears in wrong location
**Solution**: Verify `playerPosition` parameter in `init-bot` is within realm bounds

### Worker Trespass on Spawn
**Problem**: Worker spawns in adjacent realm
**Solution**: Increase `padding` in realm allocation to create larger buffer zones

### No Space Available
**Problem**: Cannot allocate new realm
**Solution**: 
- Increase world boundaries
- Reduce `baseSize` for smaller realms
- Clean up old unused realms from database

### Movement Validation False Positive
**Problem**: Valid movement blocked as trespass
**Solution**: Check realm bounds in database match those in memory

## Future Enhancements

1. **Dynamic Realm Resizing**: Allow realms to grow if PR value increases
2. **Realm Trading**: Leaders can trade/transfer realms
3. **Shared Realms**: Multiple leaders in one realm with conflict resolution
4. **Realm Visibility**: Optional PvP-enabled zones across realm borders
5. **Realm Rental**: Leaders can rent temporary expanded realm space
6. **Persistent Realm Data**: Save block changes and structures per realm

---

**Last Updated**: January 28, 2026
**Version**: 1.0
