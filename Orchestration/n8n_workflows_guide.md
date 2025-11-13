# n8n Orchestration Workflows Guide

## Architecture

```
n8n Workflows (Orchestration Logic)
    ↓ HTTP calls
Leader Bot's ExternalAPI (port 4001)
    ├─ /api/orchestration/spawn-worker
    ├─ /api/orchestration/wait-workers
    ├─ /api/orchestration/create-session
    ├─ /api/orchestration/register-workers
    ├─ /api/orchestration/reserve-location
    ├─ /api/orchestration/teleport-workers
    ├─ /api/orchestration/send-task
    ├─ /api/orchestration/status
    └─ /api/orchestration/stop-all
    ↓
Individual Worker Processes (ports 4002, 4003, 4004, ...)
    ↓
Workers call back to n8n webhooks when done
```

---

## Workflow 1: StartCollaborativeBuild (Main Entry Point)

**Trigger**: Webhook or Manual  
**Purpose**: Initiate a collaborative build process

### Workflow Nodes:

```
┌─────────────────────────────────────┐
│ Webhook Trigger                     │
│ POST /webhook/start-build           │
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│ Set Variables                       │
│ - sessionId (unique)                │
│ - buildRequest (from input)         │
│ - workerCount (from input)          │
│ - callbackUrl (n8n webhook)         │
│ - leaderBotUrl                      │
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│ Execute Workflow (Async)            │
│ -> "SpawnWorkers"                   │
│ - Pass: sessionId, workerCount,     │
│         callbackUrl, leaderBotUrl   │
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│ Save to Database                    │
│ - Store session status as "pending" │
│ - Save buildRequest, workerCount    │
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────┐
│ HTTP Response (202 Accepted)        │
│ - Return sessionId                  │
│ - Return status: "build_started"    │
└─────────────────────────────────────┘
```

#### Webhook Trigger Configuration:
```
Authentication: None
HTTP Method: POST
Path: /webhook/start-build
```

#### Input JSON Example:
```json
{
  "buildRequest": "Build a wooden house with a door and windows",
  "workerCount": 3
}
```

#### Set Variables Node:
```javascript
return {
  sessionId: $env.SESSION_ID_PREFIX + "_" + new Date().getTime(),
  buildRequest: $json.buildRequest,
  workerCount: $json.workerCount || 3,
  callbackUrl: $env.N8N_WEBHOOK_WORKER_COMPLETE,
  leaderBotUrl: "http://localhost:4001",
  leaderBotName: "Leader",
  buildDate: new Date().toISOString()
}
```

---

## Workflow 2: SpawnWorkers (Background Async)

**Trigger**: Execute Workflow trigger  
**Purpose**: Spawn multiple worker processes in parallel

### Workflow Nodes:

```
┌─────────────────────────────────────────────────┐
│ Workflow Input (from StartCollaborativeBuild)   │
│ - sessionId, workerCount, callbackUrl, etc.     │
└────────────┬────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────┐
│ Loop (0 to workerCount - 1)                     │
│ For each worker i:                              │
└────────────┬────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ↓                 ↓
┌──────────────┐  ┌──────────────┐
│ Set Variable │  │ Set Variable │
│ workerName = │  │ workerPort = │
│ Worker_i    │  │ 4002 + i     │
└──────┬───────┘  └──────┬───────┘
       │                 │
       └────────┬────────┘
                ↓
        ┌─────────────────────┐
        │ HTTP Request (Async)│
        │ POST               │
        │ /api/orchestration/│
        │ spawn-worker       │
        │                     │
        │ Body: {             │
        │  name: workerName,  │
        │  port: workerPort,  │
        │  sessionId,         │
        │  callbackWebhookUrl │
        │ }                   │
        └────────┬────────────┘
                 │
                 ↓
        ┌─────────────────────┐
        │ Append to Array     │
        │ spawnedWorkers[]    │
        └────────┬────────────┘
                 │
         (loop continues)
```

#### Loop Configuration:
```
From: 0
To: $json.workerCount - 1
```

#### HTTP Request: Spawn Worker
```
Method: POST
URL: {{ $json.leaderBotUrl }}/api/orchestration/spawn-worker
Headers:
  Content-Type: application/json

Body (JSON):
{
  "name": "{{ $json.workerName }}",
  "port": {{ $json.workerPort }},
  "sessionId": "{{ $json.sessionId }}",
  "callbackWebhookUrl": "{{ $json.callbackUrl }}"
}

Response: Expect 202 Accepted
```

#### Set Variables (in loop):
```javascript
// After spawn request
return {
  workerName: "Worker_" + $node['Loop'].json.index,
  workerPort: 4002 + $node['Loop'].json.index
}
```

#### Append to Array (in loop):
```
Array: spawnedWorkers (initialize as [])
Item:
{
  "name": $json.workerName,
  "port": $json.workerPort,
  "status": "spawning"
}
```

---

## Workflow 3: WaitAndRegister (Wait for Workers Ready)

**Trigger**: Execute Workflow (from SpawnWorkers when complete)  
**Purpose**: Wait for all workers to be ready, then register them

### Workflow Nodes:

```
┌──────────────────────────────────┐
│ Input: spawnedWorkers[], etc.    │
└────────────┬─────────────────────┘
             │
             ↓
┌──────────────────────────────────┐
│ HTTP Request                     │
│ POST /api/orchestration/         │
│     wait-workers                 │
│                                   │
│ Body: {                          │
│  workers: spawnedWorkers,        │
│  timeoutMs: 30000                │
│ }                                │
└────────────┬─────────────────────┘
             │
             ↓
┌──────────────────────────────────┐
│ IF: All workers ready?           │
│    $json.allReady === true        │
└────────────┬─────────────────────┘
             │
    ┌────────┴────────┐
    │ YES             │ NO
    ↓                 ↓
┌─────────┐      ┌─────────┐
│ Continue│      │ Log Warn│
│         │      │ Continue│
└────┬────┘      └────┬────┘
     │                │
     └────────┬───────┘
              ↓
┌──────────────────────────────────┐
│ HTTP Request                     │
│ POST /api/orchestration/         │
│     register-workers             │
│                                   │
│ Body: {                          │
│  sessionId,                      │
│  workers: spawnedWorkers         │
│ }                                │
└────────────┬─────────────────────┘
             │
             ↓
┌──────────────────────────────────┐
│ Execute Workflow (Async)         │
│ -> "CoordinateBuild"             │
│ Pass: sessionId, workers, etc.   │
└──────────────────────────────────┘
```

#### HTTP Request: Wait Workers
```
Method: POST
URL: {{ $json.leaderBotUrl }}/api/orchestration/wait-workers
Headers:
  Content-Type: application/json

Body:
{
  "workers": {{ JSON.stringify($json.spawnedWorkers) }},
  "timeoutMs": 30000
}
```

#### HTTP Request: Register Workers
```
Method: POST
URL: {{ $json.leaderBotUrl }}/api/orchestration/register-workers
Headers:
  Content-Type: application/json

Body:
{
  "sessionId": "{{ $json.sessionId }}",
  "workers": {{ JSON.stringify($json.spawnedWorkers) }}
}
```

---

## Workflow 4: CoordinateBuild (Position Workers)

**Trigger**: Execute Workflow (from WaitAndRegister)  
**Purpose**: Create session, reserve location, and position workers

### Workflow Nodes:

```
┌────────────────────────────────────┐
│ Input: sessionId, buildRequest     │
└────────────┬───────────────────────┘
             │
             ↓
┌────────────────────────────────────┐
│ HTTP Request                       │
│ POST /api/orchestration/           │
│     create-session                 │
│                                     │
│ Body: {                            │
│  sessionId,                        │
│  buildRequest,                     │
│  workerCount                       │
│ }                                  │
└────────────┬───────────────────────┘
             │
             ↓
┌────────────────────────────────────┐
│ Get Leader Position                │
│ HTTP GET /api/agent/status         │
│ Extract position from response     │
└────────────┬───────────────────────┘
             │
             ↓
┌────────────────────────────────────┐
│ HTTP Request                       │
│ POST /api/orchestration/           │
│     reserve-location               │
│                                     │
│ Body: {                            │
│  sessionId,                        │
│  preferredLocation: {              │
│    x, y, z (from leader position)  │
│  },                                │
│  minDistance: 30                   │
│ }                                  │
└────────────┬───────────────────────┘
             │
             ↓
┌────────────────────────────────────┐
│ HTTP Request                       │
│ POST /api/orchestration/           │
│     teleport-workers               │
│                                     │
│ Body: {                            │
│  sessionId,                        │
│  buildLocation: (from response)    │
│ }                                  │
└────────────┬───────────────────────┘
             │
             ↓
┌────────────────────────────────────┐
│ Wait 3 seconds                     │
│ (workers need time to teleport)    │
└────────────┬───────────────────────┘
             │
             ↓
┌────────────────────────────────────┐
│ Execute Workflow (Async)           │
│ -> "DistributeTasks"               │
│ Pass: sessionId, workers           │
└────────────────────────────────────┘
```

#### Get Leader Position (HTTP GET):
```
URL: http://localhost:4001/api/agent/status

Response will include position object
```

#### Set Variables (Extract Position):
```javascript
// After GET /api/agent/status
const status = $json;
return {
  leaderPosition: {
    x: Math.floor(status.position.x),
    y: Math.floor(status.position.y),
    z: Math.floor(status.position.z)
  }
}
```

---

## Workflow 5: DistributeTasks (Assign Work)

**Trigger**: Execute Workflow (from CoordinateBuild)  
**Purpose**: Break down build request into tasks and assign to workers

### Workflow Nodes:

```
┌───────────────────────────────┐
│ Input: buildRequest, workers  │
└────────────┬──────────────────┘
             │
             ↓
┌───────────────────────────────┐
│ Code Node: Break Down Tasks   │
│ Split buildRequest into tasks │
│ Create taskList based on      │
│ worker count                  │
└────────────┬──────────────────┘
             │
             ↓
┌───────────────────────────────┐
│ Loop: For each task           │
│ Assign to worker (round-robin)│
└────────────┬──────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ↓                 ↓
┌──────────────┐  ┌──────────────┐
│ Calc Worker  │  │ Build Task   │
│ index =      │  │ Prompt with  │
│ i % count    │  │ coordination │
└──────┬───────┘  └──────┬───────┘
       │                 │
       └────────┬────────┘
                ↓
        ┌─────────────────────┐
        │ HTTP Request (Async)│
        │ POST               │
        │ /api/orchestration/│
        │ send-task          │
        │                     │
        │ Body: {             │
        │  workerPort,        │
        │  taskPrompt         │
        │ }                   │
        └────────┬────────────┘
                 │
                 ↓
        ┌─────────────────────┐
        │ Append to           │
        │ assignedTasks[]     │
        └────────┬────────────┘
                 │
         (loop continues)
```

#### Code Node: Break Down Tasks
```javascript
const buildRequest = $json.buildRequest;
const workerCount = $json.workers.length;

// Simple task breakdown - can be enhanced with AI
const baseTasks = [
  "Prepare the building site and gather initial materials",
  "Build the foundation and main structure",
  "Complete walls and roof",
  "Add doors, windows, and interior details"
];

// Repeat tasks if fewer than workers
const tasks = [];
for (let i = 0; i < workerCount; i++) {
  tasks.push({
    id: i,
    task: baseTasks[i % baseTasks.length],
    description: `${buildRequest} - Part ${i + 1}/${workerCount}`
  });
}

return { tasks };
```

#### Loop Configuration:
```
From: 0
To: tasks.length - 1
```

#### Calculate Worker Index (Set Variable in loop):
```javascript
return {
  workerIndex: $node['Loop'].json.index % $json.workers.length,
  assignedWorker: $json.workers[$node['Loop'].json.index % $json.workers.length]
}
```

#### Build Task Prompt (Set Variable in loop):
```javascript
const task = $json.tasks[$node['Loop'].json.index];
const worker = $json.assignedWorker;

return {
  taskPrompt: `${task.description}

You are worker ${$node['Loop'].json.index + 1} of ${$json.workers.length}.
Work on: ${task.task}
Coordinate with other workers at your location.
Report back when done.`
}
```

#### HTTP Request: Send Task
```
Method: POST
URL: {{ $json.leaderBotUrl }}/api/orchestration/send-task
Headers:
  Content-Type: application/json

Body:
{
  "workerPort": {{ $json.assignedWorker.port }},
  "taskPrompt": "{{ $json.taskPrompt }}"
}
```

---

## Workflow 6: WorkerComplete (Webhook for Build Completion)

**Trigger**: Webhook  
**Purpose**: Receive and process worker completion callbacks

### Webhook Configuration:
```
Authentication: None
HTTP Method: POST
Path: /webhook/worker-complete
```

### Workflow Nodes:

```
┌────────────────────────────────┐
│ Webhook Trigger                │
│ POST /webhook/worker-complete  │
└────────────┬───────────────────┘
             │
             ↓
┌────────────────────────────────┐
│ Update Database                │
│ - Find session by sessionId    │
│ - Mark worker as completed     │
│ - Increment completedWorkers   │
└────────────┬───────────────────┘
             │
             ↓
┌────────────────────────────────┐
│ IF: All workers done?          │
│    completedWorkers ===        │
│    totalWorkers                │
└────────────┬───────────────────┘
             │
    ┌────────┴────────┐
    │ YES             │ NO
    ↓                 ↓
┌─────────┐      ┌─────────┐
│ POST to │      │ Save    │
│ n8n     │      │ progress│
│ callback│      │         │
│ URL     │      └─────────┘
└────┬────┘
     │
     ↓
┌────────────────────────────────┐
│ Update Database                │
│ Session status = "completed"   │
│ Save results                   │
└────────────────────────────────┘
```

#### Webhook Input:
```json
{
  "sessionId": "build_123456",
  "workerName": "Worker_1",
  "status": "completed",
  "result": {
    "tasksCompleted": 5,
    "blocksPlaced": 124,
    "errors": []
  },
  "completionTime": "2024-01-15T10:30:00Z"
}
```

#### Update Database (SQL/MongoDB):
```
UPDATE build_sessions 
SET 
  completed_workers = completed_workers + 1,
  updated_at = NOW()
WHERE session_id = $json.sessionId
```

#### IF Node Condition:
```
$json.completed_workers === $json.total_workers
```

---

## Workflow 7: MonitorProgress (Optional - Polling)

**Trigger**: Cron (Every 30 seconds)  
**Purpose**: Monitor ongoing builds and check for timeouts

### Nodes:

```
┌──────────────────────┐
│ Cron Trigger         │
│ Every 30 seconds     │
└────────────┬─────────┘
             │
             ↓
┌──────────────────────┐
│ Query Database       │
│ Find sessions with   │
│ status = "pending"   │
└────────────┬─────────┘
             │
             ↓
┌──────────────────────┐
│ Loop: For each       │
│ pending session      │
└────────────┬─────────┘
             │
             ↓
┌──────────────────────┐
│ HTTP GET             │
│ /api/orchestration/  │
│ status               │
└────────────┬─────────┘
             │
             ↓
┌──────────────────────┐
│ Check for timeouts   │
│ > 30 minutes?        │
└────────────┬─────────┘
             │
    ┌────────┴────────┐
    │ YES             │ NO
    ↓                 ↓
┌─────────┐      ┌─────────┐
│ Mark    │      │ Continue│
│ Failed  │      │ monitoring
│         │      │         │
└─────────┘      └─────────┘
```

---

## Implementation Steps

### Step 1: Add Files to Your Project
1. Copy `orchestration_api.js` to `src/agent/`
2. Merge `external_api_additions.js` into your existing `external_api.js`

### Step 2: Update external_api.js
```javascript
// Add import at top
import { OrchestrationAPI } from './orchestration_api.js';

// In ExternalAPI constructor, replace:
//     this.multiBotManager = new MultiBotManager(agent);
// With:
//     this.orchestration = new OrchestrationAPI(agent);

// In setupRoutes(), add the orchestration endpoints from external_api_additions.js

// Add the handler methods from external_api_additions.js
```

### Step 3: Create n8n Workflows
1. Create "StartCollaborativeBuild" workflow
2. Create "SpawnWorkers" sub-workflow
3. Create "WaitAndRegister" sub-workflow
4. Create "CoordinateBuild" sub-workflow
5. Create "DistributeTasks" sub-workflow
6. Create "WorkerComplete" webhook workflow
7. Create "MonitorProgress" cron workflow (optional)

### Step 4: Test
```bash
# Start your leader bot
node src/process/init_leader.js

# Test worker spawn via n8n webhook
curl -X POST http://localhost:3000/webhook/start-build \
  -H "Content-Type: application/json" \
  -d '{
    "buildRequest": "Build a small house",
    "workerCount": 3
  }'
```

---

## Callback Webhook Format

When workers complete tasks, they should call:

```
POST {{ n8nWebhookUrl }}/webhook/worker-complete

{
  "sessionId": "build_123456_abc",
  "workerName": "Worker_1",
  "workerPort": 4003,
  "status": "completed",
  "result": {
    "taskCompleted": "Build foundation",
    "blocksPlaced": 156,
    "itemsUsed": ["wood_planks", "oak_log"],
    "timeSpent": 1234
  },
  "completionTime": "2024-01-15T10:30:00Z"
}
```

---

## Status Monitoring

Check build progress with:

```
GET http://localhost:4001/api/orchestration/status

Response:
{
  "totalWorkers": 3,
  "readyWorkers": 3,
  "activeSessions": 1,
  "workers": [
    {
      "name": "Worker_1",
      "port": 4003,
      "status": "working",
      "uptime": 45000
    },
    ...
  ],
  "sessions": [
    {
      "sessionId": "build_123456",
      "buildRequest": "Build a house",
      "status": "executing",
      "workersAssigned": 3,
      "buildLocation": { "x": 0, "y": 64, "z": 0 },
      "runtime": 23000
    }
  ]
}
```

---

## Cleanup

After builds complete, call:

```
POST http://localhost:4001/api/orchestration/stop-all

Response:
{
  "success": true,
  "message": "All workers stopped"
}
```

Or stop individual workers:

```
POST http://localhost:4001/api/orchestration/stop-worker

Body:
{
  "workerName": "Worker_1"
}
```
