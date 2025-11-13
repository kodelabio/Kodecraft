# Implementation Checklist: n8n Orchestration

## Files to Create/Modify

### ✅ NEW FILE: `src/agent/orchestration_api.js`
- **Status**: Ready to use
- **Location**: `src/agent/orchestration_api.js`
- **What it does**: Handles all worker spawning, coordination, and status tracking
- **No changes needed**: Use as-is from `orchestration_api.js`

### ✅ MODIFY: `src/agent/external_api.js`
- **Status**: Ready to integrate
- **Changes needed**:
  1. Add import: `import { OrchestrationAPI } from './orchestration_api.js';`
  2. In constructor (around line 18), replace:
     ```javascript
     // OLD:
     this.multiBotManager = new MultiBotManager(agent);
     
     // NEW:
     this.orchestration = new OrchestrationAPI(agent);
     ```
  3. In `setupRoutes()` method, add all routes from `external_api_additions.js`
  4. Add all handler methods from `external_api_additions.js` to the ExternalAPI class

### ✅ KEEP AS-IS: Everything Else
- `src/agent/agent.js` - No changes
- `src/agent/multibot_manager.js` - Keep for reference, not used
- Worker initialization - No changes

---

## Step 1: Add OrchestrationAPI to Your Project

```bash
# Copy the new file
cp orchestration_api.js src/agent/

# Now update external_api.js (manually or with script)
```

### Pseudo-code for updating `external_api.js`:

```javascript
// At the top of file, add:
import { OrchestrationAPI } from './orchestration_api.js';

// In ExternalAPI constructor, find this line (~line 18):
// this.multiBotManager = new MultiBotManager(agent);

// Replace it with:
this.orchestration = new OrchestrationAPI(agent);

// In setupRoutes() method, add these route definitions:
// (Copy all routes from external_api_additions.js setupRoutes section)

// At the bottom of ExternalAPI class, add these handler methods:
// (Copy all handlers from external_api_additions.js)
```

---

## Step 2: Verify Settings Configuration

Check your `settings.js` has:

```javascript
{
  // ... other settings ...
  
  // External Brain Mode
  brain_mode: 'external',
  external_api_port: 4001,
  
  // Multi-bot settings
  multibot_base_port: 4002,
  is_worker_bot: false,  // Set to true when running workers
  
  // n8n integration
  n8n_webhook_url: 'https://your-n8n-instance.com/webhook/worker-complete',
  
  // Profile settings
  profile: 'default'
}
```

---

## Step 3: Create n8n Workflows

Create these workflows in n8n (in this order):

### Workflow 1: `WorkerComplete` (Webhook)
- **Trigger**: Webhook
- **Path**: `/webhook/worker-complete`
- **Purpose**: Receive worker completion callbacks
- **Status**: Save to database with completion data

**Quick Implementation**:
```
Webhook (POST)
  ↓
Update Database
  - Find session by sessionId
  - Increment completed_workers
  - Mark worker done
  ↓
IF all workers complete:
  - Update session status = "completed"
  - Optionally call external webhook
```

### Workflow 2: `StartCollaborativeBuild` (Webhook)
- **Trigger**: Webhook
- **Path**: `/webhook/start-build`
- **Purpose**: Entry point for builds
- **Input**: `{ buildRequest, workerCount }`

**Quick Implementation**:
```
Webhook (POST)
  ↓
Set Variables:
  - sessionId = unique ID
  - Save to database with status "pending"
  ↓
Execute Workflow (Async):
  - "SpawnWorkers"
  - Pass: sessionId, workerCount, etc.
  ↓
Response (202 Accepted):
  - Return sessionId
```

### Workflow 3: `SpawnWorkers` (Sub-workflow)
- **Trigger**: Execute Workflow
- **Purpose**: Spawn multiple workers in parallel

**Quick Implementation**:
```
Loop (i = 0 to workerCount):
  - Set worker name/port
  - HTTP POST to /api/orchestration/spawn-worker
  - Append to spawnedWorkers array
  ↓
After loop complete:
  - Execute Workflow (Async): "WaitAndRegister"
```

### Workflow 4: `WaitAndRegister` (Sub-workflow)
- **Trigger**: Execute Workflow
- **Purpose**: Wait for workers ready, register them

**Quick Implementation**:
```
HTTP POST: /api/orchestration/wait-workers
  ↓
HTTP POST: /api/orchestration/register-workers
  ↓
Execute Workflow (Async): "CoordinateBuild"
```

### Workflow 5: `CoordinateBuild` (Sub-workflow)
- **Trigger**: Execute Workflow
- **Purpose**: Position workers at build site

**Quick Implementation**:
```
HTTP POST: /api/orchestration/create-session
  ↓
HTTP GET: /api/agent/status (get leader position)
  ↓
HTTP POST: /api/orchestration/reserve-location
  ↓
HTTP POST: /api/orchestration/teleport-workers
  ↓
Wait 3 seconds
  ↓
Execute Workflow (Async): "DistributeTasks"
```

### Workflow 6: `DistributeTasks` (Sub-workflow)
- **Trigger**: Execute Workflow
- **Purpose**: Assign tasks to workers

**Quick Implementation**:
```
Code Node: Break down buildRequest into tasks
  ↓
Loop (for each task):
  - Assign worker (round-robin)
  - HTTP POST: /api/orchestration/send-task
  - Append to results
  ↓
Return task assignments
```

### Workflow 7: `MonitorProgress` (Optional, Cron)
- **Trigger**: Cron (every 30 seconds)
- **Purpose**: Check for stuck builds

**Quick Implementation**:
```
Cron Trigger (30 seconds)
  ↓
Query Database: Find pending sessions
  ↓
HTTP GET: /api/orchestration/status
  ↓
Check timeouts (> 30 minutes):
  - If timeout → mark session failed
  - Optionally call stop-all endpoint
```

---

## Step 4: Test the Setup

### Test 1: Verify APIs are available

```bash
# Start leader bot
node src/process/init_leader.js

# In another terminal, check API health
curl http://localhost:4001/api/health

# Expected response:
# { "status": "ok" }
```

### Test 2: Check orchestration endpoints

```bash
# Get status (should show 0 workers initially)
curl http://localhost:4001/api/orchestration/status

# Expected response:
{
  "totalWorkers": 0,
  "readyWorkers": 0,
  "activeSessions": 0,
  "workers": [],
  "sessions": [],
  "buildLocations": []
}
```

### Test 3: Manually spawn a worker

```bash
curl -X POST http://localhost:4001/api/orchestration/spawn-worker \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TestWorker",
    "port": 4002,
    "sessionId": "test_session_1",
    "callbackWebhookUrl": "http://your-n8n.com/webhook/test"
  }'

# Expected response (202 Accepted):
{
  "success": true,
  "workerName": "TestWorker",
  "port": 4002,
  "status": "spawned",
  "pid": 12345,
  "message": "Worker TestWorker spawned successfully"
}
```

### Test 4: Check worker readiness

```bash
curl -X POST http://localhost:4001/api/orchestration/wait-workers \
  -H "Content-Type: application/json" \
  -d '{
    "workers": [
      { "name": "TestWorker", "port": 4002 }
    ],
    "timeoutMs": 10000
  }'

# Expected response:
{
  "allReady": true,
  "readyCount": 1,
  "totalCount": 1,
  "workers": [
    {
      "name": "TestWorker",
      "port": 4002,
      "ready": true
    }
  ]
}
```

### Test 5: Full n8n workflow test

1. In n8n, trigger `StartCollaborativeBuild` webhook with:
```json
{
  "buildRequest": "Build a wooden house",
  "workerCount": 2
}
```

2. Monitor:
   - Check leader bot logs
   - Check n8n workflow execution
   - Check database for session tracking

3. Verify workers spawned:
```bash
curl http://localhost:4001/api/orchestration/status
```

---

## Troubleshooting

### Issue: Workers not spawning
**Check**:
- Leader bot is running on port 4001
- Settings has correct `multibot_base_port`
- Node.js path to `init_worker.js` is correct
- Check logs in leader bot console

### Issue: Workers not becoming ready
**Check**:
- Worker processes are actually running (check ports: 4002+)
- Each worker's ExternalAPI started correctly
- Health check endpoint `/api/health` is accessible from leader
- No firewall blocking localhost connections

### Issue: Task not being sent to workers
**Check**:
- Worker is in "ready" status
- Orchestration endpoint response has `success: true`
- Worker's `/api/agent/newAction` endpoint is accessible
- Task prompt is valid JSON

### Issue: Build location conflicts
**Check**:
- `reserveBuildLocation()` is being called
- `buildLocations` array is being populated
- minDistance parameter makes sense for your world

---

## Rollback Plan

If something goes wrong:

1. **Stop all workers**:
```bash
curl -X POST http://localhost:4001/api/orchestration/stop-all
```

2. **Restart leader bot**:
```bash
# Kill process and restart
node src/process/init_leader.js
```

3. **Check database**:
```sql
-- If using DB to track sessions
DELETE FROM build_sessions WHERE status = 'pending';
DELETE FROM build_locations;
```

---

## Performance Considerations

- **Worker count**: Limit to 10-20 per orchestration (adjust based on server)
- **Task complexity**: Breaking down tasks in n8n keeps orchestration responsive
- **Webhook timeouts**: Set to 5000ms for fast fail on unreachable workers
- **Session cleanup**: MonitorProgress workflow runs every 30s, cleans up old sessions

---

## File Sizes

- `orchestration_api.js`: ~8 KB
- Integration to `external_api.js`: +2 KB
- Total additions to your codebase: ~10 KB

---

## Next Steps After Implementation

1. ✅ Copy `orchestration_api.js` to `src/agent/`
2. ✅ Update `external_api.js` with new routes and handlers
3. ✅ Create n8n workflows (6-7 workflows total)
4. ✅ Test with manual curl requests
5. ✅ Test full n8n workflow end-to-end
6. ✅ Monitor production builds

---

## Support & Debugging

### Enable Debug Logging
In `orchestration_api.js`, all methods have `console.log` statements with emojis:
- 🔧 Spawning
- ✓ Success
- ❌ Error
- ⚠️ Warning

Just check your console output.

### Monitor Database
Track sessions in your database:
```sql
SELECT * FROM build_sessions WHERE created_at > NOW() - INTERVAL 1 HOUR;
```

### Check n8n Execution
Each workflow stores execution history - check for errors there.

---

## Final Checklist

- [ ] `orchestration_api.js` copied to `src/agent/`
- [ ] `external_api.js` updated with imports and routes
- [ ] `external_api.js` updated with handler methods
- [ ] `settings.js` configured correctly
- [ ] Leader bot starts without errors
- [ ] Health check endpoint responds
- [ ] Manual spawn test works
- [ ] n8n workflows created (6-7 total)
- [ ] End-to-end workflow test passed
- [ ] Database/storage configured for session tracking
- [ ] Monitoring webhook tested
- [ ] Cleanup/stop-all tested

**You're ready to orchestrate collaborative builds with n8n!**
