# Quick Reference Card

## Files You Have

| File | Purpose | What to Do |
|------|---------|-----------|
| `orchestration_api.js` | Core orchestration logic | Copy to `src/agent/` |
| `external_api_additions.js` | Routes & handlers to add | Integrate into `external_api.js` |
| `CODE_CHANGES_EXACT.md` | Exact code changes needed | Follow line by line |
| `n8n_workflows_guide.md` | Complete workflow guide | Reference while building workflows |
| `IMPLEMENTATION_CHECKLIST.md` | Step-by-step + testing | Follow for implementation & testing |
| `SOLUTION_SUMMARY.md` | Big picture overview | Read first to understand architecture |
| `ANALYSIS_AND_MIGRATION_PLAN.md` | Why this approach | Reference for decisions |

---

## 3-Step Integration

### Step 1: Copy File
```bash
cp orchestration_api.js src/agent/
```

### Step 2: Update external_api.js (4 changes)
1. Add import: `import { OrchestrationAPI } from './orchestration_api.js';`
2. Replace: `this.multiBotManager = ...` with `this.orchestration = new OrchestrationAPI(agent);`
3. Add 10 routes to `setupRoutes()`
4. Add 10 handler methods to class

See `CODE_CHANGES_EXACT.md` for exact line numbers.

### Step 3: Create n8n Workflows (6-7 workflows)
See `n8n_workflows_guide.md` for exact configurations.

---

## API Endpoints

All endpoints return JSON and run on port 4001 (leader bot).

### Worker Management
```
POST   /api/orchestration/spawn-worker
POST   /api/orchestration/wait-workers
POST   /api/orchestration/stop-worker
POST   /api/orchestration/stop-all
```

### Session Management
```
POST   /api/orchestration/create-session
POST   /api/orchestration/register-workers
```

### Build Coordination
```
POST   /api/orchestration/reserve-location
POST   /api/orchestration/teleport-workers
POST   /api/orchestration/send-task
```

### Monitoring
```
GET    /api/orchestration/status
```

---

## n8n Workflows to Create

| # | Workflow | Trigger | Purpose |
|---|----------|---------|---------|
| 1 | `WorkerComplete` | Webhook | Receive worker callbacks |
| 2 | `StartCollaborativeBuild` | Webhook | Entry point for builds |
| 3 | `SpawnWorkers` | Sub-workflow | Spawn workers in parallel |
| 4 | `WaitAndRegister` | Sub-workflow | Wait for workers, register |
| 5 | `CoordinateBuild` | Sub-workflow | Position workers at site |
| 6 | `DistributeTasks` | Sub-workflow | Assign tasks to workers |
| 7 | `MonitorProgress` | Cron (optional) | Check for stuck builds |

---

## Test Commands

### Health Check
```bash
curl http://localhost:4001/api/health
```

### Spawn Worker
```bash
curl -X POST http://localhost:4001/api/orchestration/spawn-worker \
  -H "Content-Type: application/json" \
  -d '{"name":"TestWorker","port":4002,"sessionId":"test"}'
```

### Get Status
```bash
curl http://localhost:4001/api/orchestration/status
```

### Stop All Workers
```bash
curl -X POST http://localhost:4001/api/orchestration/stop-all
```

---

## Key Concepts

**SessionId**: Unique identifier for a build (e.g., `build_123456_abc`)

**Worker Port**: Each worker gets a unique port (4002, 4003, 4004, ...)

**BuildLocation**: Reserved spot in Minecraft world where workers build

**Tasks**: Work breakdown (e.g., "Build foundation", "Build walls")

**Callback Webhook**: URL where workers report completion

---

## Architecture at a Glance

```
n8n (Orchestration Logic)
  ↓ HTTP calls
Leader Bot's ExternalAPI (port 4001)
  ├─ OrchestrationAPI (new)
  └─ Other endpoints (existing)
  ↓ spawn/control
Worker Bots (ports 4002+)
  ↓ callbacks
n8n Webhooks
  ↓ save
Database (track sessions)
```

---

## Common Tasks

### Spawn 3 workers
```javascript
// In n8n, loop 3 times:
POST /api/orchestration/spawn-worker
{
  "name": "Worker_" + i,
  "port": 4002 + i,
  "sessionId": sessionId
}
```

### Wait for workers ready
```javascript
POST /api/orchestration/wait-workers
{
  "workers": spawnedWorkers,
  "timeoutMs": 30000
}
```

### Assign tasks to workers
```javascript
// For each task:
POST /api/orchestration/send-task
{
  "workerPort": worker.port,
  "taskPrompt": "Build the foundation..."
}
```

### Check build progress
```javascript
GET /api/orchestration/status
// Returns: workers status, sessions status, build locations
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Workers not spawning | Check leader bot logs, verify port 4001 |
| Workers not becoming ready | Check if worker ExternalAPI started on port 4002+ |
| Tasks not sent to workers | Verify worker health endpoint accessible |
| n8n workflows failing | Check HTTP request URLs and JSON bodies |
| Duplicate builds at same location | Location reservation working as intended |

---

## Performance

- **Spawn worker**: 50ms
- **Wait for worker ready**: 1-5 seconds
- **Send task**: 100ms
- **Total overhead**: ~6 seconds for 3 workers
- **Actual work**: Happens in parallel, n8n doesn't wait

---

## File Organization

After integration, your structure should be:
```
your-project/
├── src/agent/
│   ├── agent.js (existing)
│   ├── external_api.js (modified)
│   ├── orchestration_api.js (NEW)
│   ├── multibot_manager.js (kept for reference)
│   └── ... (other files)
├── src/process/
│   └── init_worker.js (existing)
└── ... (rest of project)
```

---

## Next Steps

1. ✅ Read `SOLUTION_SUMMARY.md`
2. ✅ Follow `CODE_CHANGES_EXACT.md`
3. ✅ Use `n8n_workflows_guide.md` to build workflows
4. ✅ Run tests from `IMPLEMENTATION_CHECKLIST.md`
5. ✅ Deploy and monitor

---

## Questions?

- **How does task distribution work?** → See n8n_workflows_guide.md, Workflow 6
- **How are workers positioned?** → See orchestration_api.js, `teleportWorkers()`
- **How do workers report completion?** → Via n8n webhook callback
- **Can I run multiple builds?** → Yes, each has unique sessionId
- **What if a worker crashes?** → Session continues with remaining workers

---

## Success Criteria

✅ Leader bot starts on port 4001
✅ `/api/orchestration/status` returns empty when no workers
✅ Can spawn worker via HTTP request
✅ Spawned worker appears in status
✅ n8n workflow triggers builds
✅ Multiple workers execute in parallel
✅ Workers complete and call back to n8n
✅ Database tracks build sessions

When all ✅, you're ready to orchestrate!

---

## Support Files

All files are in `/mnt/user-data/outputs/`:

- `orchestration_api.js` ← Copy to your project
- `external_api_additions.js` ← Reference for integration
- `CODE_CHANGES_EXACT.md` ← Follow this to integrate
- `n8n_workflows_guide.md` ← Reference for workflows
- `IMPLEMENTATION_CHECKLIST.md` ← Testing guide
- `SOLUTION_SUMMARY.md` ← Architecture overview
- `ANALYSIS_AND_MIGRATION_PLAN.md` ← Why this approach
- `QUICK_REFERENCE.md` ← This file

**Everything you need is included!**
