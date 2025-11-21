# n8n Workflows Guide - Complete Implementation

This guide contains detailed specifications for all n8n workflows that orchestrate multi-bot collaborative building in Kodecraft.

---

## Table of Contents

1. [Overview](#overview)
2. [Workflow 1: WorkerComplete](#workflow-1-workercomplete)
3. [Workflow 2: StartCollaborativeBuild](#workflow-2-startcollaborativebuild)
4. [Workflow 3: SpawnWorkers](#workflow-3-spawnworkers)
5. [Workflow 4: WaitAndRegister](#workflow-4-waitandregister)
6. [Workflow 5: CoordinateBuild](#workflow-5-coordinatebuild)
7. [Workflow 6: DistributeTasks](#workflow-6-distributetasks)
8. [Workflow 7: MonitorProgress (Optional)](#workflow-7-monitorprogress-optional)
9. [Testing](#testing)

---

## Overview

The orchestration workflows coordinate multi-bot building through the following sequence:

```
StartCollaborativeBuild (webhook trigger)
  ↓
SpawnWorkers (create 3+ bot processes)
  ↓
WaitAndRegister (wait for workers to be ready)
  ↓
CoordinateBuild (position workers at build location)
  ↓
DistributeTasks (send specific tasks to each worker)
  ↓
Workers execute in parallel
  ↓
WorkerComplete (webhook receives completion callbacks)
```

---

## Workflow 1: WorkerComplete

**Purpose**: Receive task completion callbacks from workers

**Trigger**: Webhook POST `/webhook/worker-complete`

### Nodes

**1. Webhook Trigger**
```
Method: POST
Path: /webhook/worker-complete
Authentication: None (or add if needed)
```

**2. Process Data (Optional Function Node)**
```javascript
// Extract completion data
return {
    sessionId: $json.body.sessionId,
    workerName: $json.body.workerName,
    status: $json.body.status,
    result: $json.body.result,
    completionTime: $json.body.completionTime,
    taskCompleted: $json.body.result?.taskCompleted,
    blocksPlaced: $json.body.result?.blocksPlaced,
    timeSpent: $json.body.result?.timeSpent
}
```

**3. Save to Database (Optional)**
- Create entry in database table: `worker_completions`
- Fields: sessionId, workerName, status, result, completionTime, timestamp

**4. Send Response**
```json
{
    "success": true,
    "message": "Completion received",
    "workerName": "{{ $json.workerName }}"
}
```

### Expected Input

```json
{
    "sessionId": "build_1763061958673",
    "workerName": "Worker1",
    "status": "completed",
    "result": {
        "taskCompleted": "Build first floor",
        "blocksPlaced": 150,
        "timeSpent": 252000
    },
    "completionTime": "2024-11-14T19:45:30.000Z"
}
```

---

## Workflow 2: StartCollaborativeBuild

**Purpose**: Entry point for a build request - initiates entire orchestration

**Trigger**: Webhook POST `/webhook/start-build`

### Input Example

```json
{
    "buildRequest": "Build a test wooden house",
    "workerCount": 3,
    "taskDivision": {
        "Worker1": "Build the foundation and first floor",
        "Worker2": "Build the second floor and roof",
        "Worker3": "Add decorations and landscaping"
    }
}
```

### Nodes

**1. Webhook Trigger**
```
Method: POST
Path: /webhook/start-build
```

**2. Set Variables**
```javascript
return {
    sessionId: "build_" + new Date().getTime(),
    buildRequest: $json.body.buildRequest,
    workerCount: $json.body.workerCount,
    taskDivision: $json.body.taskDivision,
    leaderBotUrl: "http://localhost:4001",
    callbackUrl: "https://your-n8n-instance.com/webhook/kodecraft/worker-complete"
}
```

**3. Save to Database (Optional)**
- Create session record with status: "pending"

**4. Execute Workflow (Async)**
```
Workflow: SpawnWorkers
Execute asynchronously: YES
Pass variables:
{
    "sessionId": $json.sessionId,
    "buildRequest": $json.buildRequest,
    "workerCount": $json.workerCount,
    "taskDivision": $json.taskDivision,
    "leaderBotUrl": $json.leaderBotUrl,
    "callbackUrl": $json.callbackUrl
}
```

**5. Respond to Webhook**
```json
{
    "sessionId": "{{ $json.sessionId }}",
    "status": "build_started",
    "message": "Build orchestration started",
    "workerCount": {{ $json.workerCount }}
}
```

---

## Workflow 3: SpawnWorkers

**Purpose**: Spawn multiple worker bot processes on different ports

**Trigger**: Called from StartCollaborativeBuild

### Input

```json
{
    "sessionId": "build_1763061958673",
    "buildRequest": "Build a test wooden house",
    "workerCount": 3,
    "taskDivision": { ... },
    "leaderBotUrl": "http://localhost:4001",
    "callbackUrl": "https://your-n8n.com/webhook/kodecraft/worker-complete"
}
```

### Nodes

**1. Set Variables (Initialize)**
```javascript
return {
    spawnedWorkers: [],
    basePort: 4002
}
```

**2. Loop** 
- From: 0
- To: `$json.workerCount - 1`

**Inside Loop:**

**2a. Set Variable (Worker Info)**
```javascript
return {
    workerIndex: $node['Loop'].json.index,
    workerName: "Worker_" + ($node['Loop'].json.index + 1),
    workerPort: 4002 + $node['Loop'].json.index
}
```

**2b. HTTP POST: Spawn Worker**
```
Method: POST
URL: {{ $json.leaderBotUrl }}/api/orchestration/spawn-worker
Headers: Content-Type: application/json

Body:
{
    "name": "{{ $json.workerName }}",
    "port": {{ $json.workerPort }},
    "sessionId": "{{ $json.sessionId }}",
    "callbackWebhookUrl": "{{ $json.callbackUrl }}"
}
```

**2c. Append to Array**
```
Array field: spawnedWorkers
Item:
{
    "name": "{{ $json.workerName }}",
    "port": {{ $json.workerPort }},
    "status": "spawning"
}
```

**3. Wait Node**
- Duration: 2000ms (2 seconds for workers to initialize)

**4. Execute Workflow (Async): WaitAndRegister**
```
Pass variables:
{
    "sessionId": $json.sessionId,
    "spawnedWorkers": $json.spawnedWorkers,
    "buildRequest": $json.buildRequest,
    "leaderBotUrl": $json.leaderBotUrl,
    "callbackUrl": $json.callbackUrl,
    "workerCount": $json.workerCount,
    "taskDivision": $json.taskDivision
}
```

---

## Workflow 4: WaitAndRegister

**Purpose**: Wait for workers to be ready and register them for the session

**Trigger**: Called from SpawnWorkers

### Nodes

**1. HTTP POST: Create Session**
```
Method: POST
URL: {{ $json.leaderBotUrl }}/api/orchestration/create-session

Body:
{
    "sessionId": "{{ $json.sessionId }}",
    "buildRequest": "{{ $json.buildRequest }}",
    "workerCount": {{ $json.workerCount }}
}
```

**2. HTTP POST: Wait for Workers Ready**
```
Method: POST
URL: {{ $json.leaderBotUrl }}/api/orchestration/wait-workers

Body:
{
    "workers": {{ JSON.stringify($json.spawnedWorkers) }},
    "timeoutMs": 30000
}
```

**3. IF Node: Check All Ready**
```
Condition: $json.allReady === true

YES branch: Continue
NO branch: Log warning but continue
```

**4. HTTP POST: Register Workers**
```
Method: POST
URL: {{ $json.leaderBotUrl }}/api/orchestration/register-workers

Body:
{
    "sessionId": "{{ $json.sessionId }}",
    "workers": {{ JSON.stringify($json.spawnedWorkers) }}
}
```

**5. Function Node: Prepare Data**
```javascript
return {
    sessionId: $json.sessionId,
    spawnedWorkers: $json.spawnedWorkers,
    buildRequest: $json.buildRequest,
    leaderBotUrl: $json.leaderBotUrl,
    callbackUrl: $json.callbackUrl,
    workerCount: $json.workerCount,
    taskDivision: $json.taskDivision
}
```

**6. Execute Workflow (Async): CoordinateBuild**
```
Pass all variables
```

---

## Workflow 5: CoordinateBuild

**Purpose**: Position workers at the build location and prepare for tasks

**Trigger**: Called from WaitAndRegister

### Nodes

**1. HTTP POST: Get Leader Position**
```
Method: GET
URL: {{ $json.leaderBotUrl }}/api/agent/status
```

**2. Function Node: Extract Position**
```javascript
const status = $json;
return {
    leaderPosition: {
        x: Math.floor(status.position?.x || 0),
        y: Math.floor(status.position?.y || 64),
        z: Math.floor(status.position?.z || 0)
    }
}
```

**3. HTTP POST: Reserve Location**
```
Method: POST
URL: {{ $json.leaderBotUrl }}/api/orchestration/reserve-location

Body:
{
    "sessionId": "{{ $json.sessionId }}",
    "preferredLocation": {
        "x": {{ $json.leaderPosition.x }},
        "y": {{ $json.leaderPosition.y }},
        "z": {{ $json.leaderPosition.z }}
    },
    "minDistance": 30
}
```

**4. HTTP POST: Teleport Workers**
```
Method: POST
URL: {{ $json.leaderBotUrl }}/api/orchestration/teleport-workers

Body:
{
    "sessionId": "{{ $json.sessionId }}",
    "buildLocation": {
        "x": {{ $json.body.buildLocation.x }},
        "y": {{ $json.body.buildLocation.y }},
        "z": {{ $json.body.buildLocation.z }}
    }
}
```

**5. Wait Node**
- Duration: 3000ms (3 seconds for teleportation)

**6. Execute Workflow (Async): DistributeTasks**
```
Pass all variables
```

---

## Workflow 6: DistributeTasks

**Purpose**: Convert task divisions into individual tasks and send to each worker

**Trigger**: Called from CoordinateBuild

### Nodes

**1. Function Node: Convert TaskDivision to Array**
```javascript
const taskDivision = $json.body?.taskDivision || $json.taskDivision;

return Object.entries(taskDivision).map(([key, value]) => ({
    key: key,
    value: value
}));
```

**2. Function Node: Add Coordination to Tasks**
```javascript
const taskDivision = $json.taskDivision;
const buildRequest = $json.buildRequest;

const coordinatedTasks = {};

Object.entries(taskDivision).forEach(([workerName, task]) => {
    coordinatedTasks[workerName] = `Help build: ${buildRequest}

Your specific contribution: ${task}

Work together with nearby workers to create a cohesive structure. Position yourself strategically to connect your work with others.`;
});

return coordinatedTasks;
```

**3. Function Node: Build Worker Task List**
```javascript
const coordinatedTaskDivision = $json.coordinatedTasks;
const workers = $json.spawnedWorkers;

const workerTaskList = workers.map((worker) => {
    return {
        workerName: worker.name,
        port: worker.port,
        task: coordinatedTaskDivision[worker.name],
        status: worker.status
    };
});

return workerTaskList;
```

**4. Loop through workerTaskList**
- Loop through array

**Inside Loop:**

**4a. HTTP POST: Send Task**
```
Method: POST
URL: {{ $json.leaderBotUrl }}/api/orchestration/send-task

Body:
{
    "workerPort": {{ $json.port }},
    "taskPrompt": "{{ $json.task }}"
}
```

**4b. Append Results (Optional)**
```
Array: taskResults
Item: {{ $json }}
```

---

## Workflow 7: MonitorProgress (Optional)

**Purpose**: Monitor ongoing builds and detect timeouts

**Trigger**: Cron (every 30 seconds)

### Nodes

**1. Cron Trigger**
```
Interval: Every 30 seconds
```

**2. HTTP GET: Get Status**
```
URL: {{ $json.leaderBotUrl }}/api/orchestration/status
```

**3. Function Node: Check Timeouts**
```javascript
const sessions = $json.sessions;
const now = Date.now();
const timeout = 1800000; // 30 minutes

const problematic = sessions.filter(s => {
    return (now - s.startTime) > timeout && s.status === 'workers_assigned';
});

return {
    checkTime: new Date().toISOString(),
    totalSessions: sessions.length,
    timedOut: problematic,
    timedOutCount: problematic.length
}
```

**4. IF: Any Timeouts?**
```
Condition: $json.timedOutCount > 0

YES: Send alert (optional - email, Slack, etc)
NO: Continue
```

---

## Testing

### Test Full Flow

```bash
# 1. Trigger the build
curl -X POST http://localhost:5678/webhook/start-build \
  -H "Content-Type: application/json" \
  -d '{
    "buildRequest": "Build a test wooden house",
    "workerCount": 3,
    "taskDivision": {
      "Worker1": "Build the foundation and first floor",
      "Worker2": "Build the second floor and roof",
      "Worker3": "Add decorations and landscaping"
    }
  }'

# 2. Check orchestration status
curl http://localhost:4001/api/orchestration/status

# 3. Watch logs
tail -f main.log
```

### Expected Output

**Build Success Sequence:**
1. Workers spawn → "✓ Worker X process spawned"
2. Workers ready → "✓ All 3 workers are ready!"
3. Build location reserved → "✓ Location reserved"
4. Workers teleported → "✓ undefined teleported to X, Y, Z"
5. Tasks sent → "✓ Task sent successfully to port XXXX"
6. Workers execute → "Executing code..."
7. Tasks complete → "Code finished"
8. Callbacks received → "✓ Task completion reported successfully"
9. WorkerComplete webhook called → "Response status: 200"

---

## Variables Flow

All variables passed through workflows:

```javascript
{
    // Session Info
    sessionId: "build_1763061958673",
    buildRequest: "Build a test wooden house",
    
    // Configuration
    leaderBotUrl: "http://localhost:4001",
    callbackUrl: "https://your-n8n.com/webhook/kodecraft/worker-complete",
    
    // Worker Data
    workerCount: 3,
    spawnedWorkers: [
        { name: "Worker_1", port: 4002 },
        { name: "Worker_2", port: 4003 },
        { name: "Worker_3", port: 4004 }
    ],
    
    // Tasks
    taskDivision: {
        "Worker1": "Build foundation...",
        "Worker2": "Build second floor...",
        "Worker3": "Add decorations..."
    }
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Workers not spawning | Check `ps aux \| grep node`, verify ports 4002-4004 available |
| Tasks not executing | Check worker health: `curl http://localhost:4002/api/health` |
| Callbacks not received | Verify callback URL is correct, check firewall |
| Workers timeout | Increase timeout in WaitAndRegister (default: 30s) |
| Session not created | Ensure sessionId is passed through all workflows |

---

## Key Files

- n8n workflows: Automatically saved in n8n instance
- Leader bot: `src/process/init_leader.js`
- Worker bot: `src/process/init_worker.js`
- Orchestration API: `src/agent/orchestration_api.js`
- External API: `src/agent/external_api.js`
