# Exact Code Changes for external_api.js

## Change 1: Add Import at Top of File

**Location**: Top of `external_api.js` (after other imports)

**Add this line:**
```javascript
import { OrchestrationAPI } from './orchestration_api.js';
```

**Full import section should look like:**
```javascript
import express from 'express';
import { getCommand, executeCommand } from './commands/index.js';
import settings from '../../settings.js';
import { History } from './history.js';
import { Coder } from './coder.js';
import { OrchestrationAPI } from './orchestration_api.js';  // ← NEW LINE
```

---

## Change 2: Update Constructor

**Location**: In `ExternalAPI` constructor (around line 18)

**Find this:**
```javascript
export class ExternalAPI {
    constructor(agent) {
        this.agent = agent;
        this.app = express();
        this.app.use(express.json());
        
        // Initialize multi-bot manager
        this.multiBotManager = new MultiBotManager(agent);  // ← REMOVE THIS LINE
        
        // CORS for n8n
        // ... rest of constructor
```

**Replace with:**
```javascript
export class ExternalAPI {
    constructor(agent) {
        this.agent = agent;
        this.app = express();
        this.app.use(express.json());
        
        // Initialize orchestration API for n8n
        this.orchestration = new OrchestrationAPI(agent);  // ← NEW LINE (replaced old line)
        
        // CORS for n8n
        // ... rest of constructor
```

---

## Change 3: Add Routes to setupRoutes()

**Location**: In `setupRoutes()` method, add these routes after existing routes (around line 122)

**Add this complete section:**
```javascript
        // Orchestration endpoints for n8n
        this.app.post('/api/orchestration/spawn-worker', this.handleOrchestrationSpawnWorker.bind(this));
        this.app.post('/api/orchestration/wait-workers', this.handleOrchestrationWaitWorkers.bind(this));
        this.app.post('/api/orchestration/create-session', this.handleOrchestrationCreateSession.bind(this));
        this.app.post('/api/orchestration/register-workers', this.handleOrchestrationRegisterWorkers.bind(this));
        this.app.post('/api/orchestration/reserve-location', this.handleOrchestrationReserveLocation.bind(this));
        this.app.post('/api/orchestration/teleport-workers', this.handleOrchestrationTeleportWorkers.bind(this));
        this.app.post('/api/orchestration/send-task', this.handleOrchestrationSendTask.bind(this));
        this.app.get('/api/orchestration/status', this.handleOrchestrationStatus.bind(this));
        this.app.post('/api/orchestration/stop-worker', this.handleOrchestrationStopWorker.bind(this));
        this.app.post('/api/orchestration/stop-all', this.handleOrchestrationStopAll.bind(this));
```

**Your setupRoutes() should now look like:**
```javascript
    setupRoutes() {
        // Movement endpoints
        this.app.post('/api/agent/move', this.handleMove.bind(this));
        // ... all existing routes ...
        
        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'ok' });
        });
        
        // Orchestration endpoints for n8n (← NEW SECTION STARTS HERE)
        this.app.post('/api/orchestration/spawn-worker', this.handleOrchestrationSpawnWorker.bind(this));
        this.app.post('/api/orchestration/wait-workers', this.handleOrchestrationWaitWorkers.bind(this));
        this.app.post('/api/orchestration/create-session', this.handleOrchestrationCreateSession.bind(this));
        this.app.post('/api/orchestration/register-workers', this.handleOrchestrationRegisterWorkers.bind(this));
        this.app.post('/api/orchestration/reserve-location', this.handleOrchestrationReserveLocation.bind(this));
        this.app.post('/api/orchestration/teleport-workers', this.handleOrchestrationTeleportWorkers.bind(this));
        this.app.post('/api/orchestration/send-task', this.handleOrchestrationSendTask.bind(this));
        this.app.get('/api/orchestration/status', this.handleOrchestrationStatus.bind(this));
        this.app.post('/api/orchestration/stop-worker', this.handleOrchestrationStopWorker.bind(this));
        this.app.post('/api/orchestration/stop-all', this.handleOrchestrationStopAll.bind(this));
        // (← NEW SECTION ENDS HERE)
    }
```

---

## Change 4: Add Handler Methods to ExternalAPI Class

**Location**: At the END of the `ExternalAPI` class, before the `start()` method

**Add all these methods:**

```javascript
    // ===================================================================
    // ORCHESTRATION API HANDLERS (n8n Integration)
    // ===================================================================

    /**
     * Spawn a single worker bot
     * POST /api/orchestration/spawn-worker
     * Body: { name, port, sessionId, callbackWebhookUrl }
     */
    async handleOrchestrationSpawnWorker(req, res) {
        try {
            const { name, port, sessionId, callbackWebhookUrl } = req.body;

            if (!name || !port) {
                return res.status(400).json({
                    error: 'name and port parameters required'
                });
            }

            const result = await this.orchestration.spawnWorker(
                name,
                port,
                sessionId || `session_${Date.now()}`,
                callbackWebhookUrl || settings.n8n_webhook_url
            );

            if (result.success) {
                res.status(202).json(result); // 202 Accepted
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationSpawnWorker');
        }
    }

    /**
     * Wait for workers to be ready
     * POST /api/orchestration/wait-workers
     * Body: { workers: [ { name, port }, ... ], timeoutMs: 30000 }
     */
    async handleOrchestrationWaitWorkers(req, res) {
        try {
            const { workers, timeoutMs = 30000 } = req.body;

            if (!workers || !Array.isArray(workers)) {
                return res.status(400).json({
                    error: 'workers array parameter required'
                });
            }

            const result = await this.orchestration.waitForWorkersReady(workers, timeoutMs);

            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'orchestrationWaitWorkers');
        }
    }

    /**
     * Create a new build session
     * POST /api/orchestration/create-session
     * Body: { sessionId, buildRequest, workerCount }
     */
    async handleOrchestrationCreateSession(req, res) {
        try {
            const { sessionId, buildRequest, workerCount } = req.body;

            if (!sessionId || !buildRequest) {
                return res.status(400).json({
                    error: 'sessionId and buildRequest parameters required'
                });
            }

            const result = this.orchestration.createBuildSession(
                sessionId,
                buildRequest,
                workerCount || 0
            );

            res.status(201).json(result); // 201 Created
        } catch (error) {
            this.handleError(res, error, 'orchestrationCreateSession');
        }
    }

    /**
     * Register workers for a session
     * POST /api/orchestration/register-workers
     * Body: { sessionId, workers: [ { name, port }, ... ] }
     */
    async handleOrchestrationRegisterWorkers(req, res) {
        try {
            const { sessionId, workers } = req.body;

            if (!sessionId || !workers) {
                return res.status(400).json({
                    error: 'sessionId and workers parameters required'
                });
            }

            const result = this.orchestration.registerWorkersForSession(sessionId, workers);

            if (result.success) {
                res.json(result);
            } else {
                res.status(404).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationRegisterWorkers');
        }
    }

    /**
     * Reserve a build location
     * POST /api/orchestration/reserve-location
     * Body: { sessionId, preferredLocation: { x, y, z }, minDistance: 30 }
     */
    async handleOrchestrationReserveLocation(req, res) {
        try {
            const { sessionId, preferredLocation, minDistance = 30 } = req.body;

            if (!sessionId || !preferredLocation) {
                return res.status(400).json({
                    error: 'sessionId and preferredLocation parameters required'
                });
            }

            if (typeof preferredLocation.x !== 'number' || 
                typeof preferredLocation.y !== 'number' || 
                typeof preferredLocation.z !== 'number') {
                return res.status(400).json({
                    error: 'preferredLocation must have x, y, z as numbers'
                });
            }

            const result = this.orchestration.reserveBuildLocation(
                sessionId,
                preferredLocation,
                minDistance
            );

            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'orchestrationReserveLocation');
        }
    }

    /**
     * Teleport workers to build location
     * POST /api/orchestration/teleport-workers
     * Body: { sessionId, buildLocation: { x, y, z } }
     */
    async handleOrchestrationTeleportWorkers(req, res) {
        try {
            const { sessionId, buildLocation } = req.body;

            if (!sessionId || !buildLocation) {
                return res.status(400).json({
                    error: 'sessionId and buildLocation parameters required'
                });
            }

            if (typeof buildLocation.x !== 'number' || 
                typeof buildLocation.y !== 'number' || 
                typeof buildLocation.z !== 'number') {
                return res.status(400).json({
                    error: 'buildLocation must have x, y, z as numbers'
                });
            }

            const result = await this.orchestration.teleportWorkers(sessionId, buildLocation);

            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'orchestrationTeleportWorkers');
        }
    }

    /**
     * Send a task to a worker
     * POST /api/orchestration/send-task
     * Body: { workerPort, taskPrompt }
     */
    async handleOrchestrationSendTask(req, res) {
        try {
            const { workerPort, taskPrompt } = req.body;

            if (!workerPort || !taskPrompt) {
                return res.status(400).json({
                    error: 'workerPort and taskPrompt parameters required'
                });
            }

            const result = await this.orchestration.sendTaskToWorker(workerPort, taskPrompt);

            if (result.success) {
                res.json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationSendTask');
        }
    }

    /**
     * Get orchestration status
     * GET /api/orchestration/status
     */
    async handleOrchestrationStatus(req, res) {
        try {
            const status = this.orchestration.getStatus();
            res.json(status);
        } catch (error) {
            this.handleError(res, error, 'orchestrationStatus');
        }
    }

    /**
     * Stop a specific worker
     * POST /api/orchestration/stop-worker
     * Body: { workerName }
     */
    async handleOrchestrationStopWorker(req, res) {
        try {
            const { workerName } = req.body;

            if (!workerName) {
                return res.status(400).json({
                    error: 'workerName parameter required'
                });
            }

            const result = await this.orchestration.stopWorker(workerName);

            if (result.success) {
                res.json(result);
            } else {
                res.status(404).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationStopWorker');
        }
    }

    /**
     * Stop all workers and clean up
     * POST /api/orchestration/stop-all
     */
    async handleOrchestrationStopAll(req, res) {
        try {
            const result = await this.orchestration.stopAllWorkers();
            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'orchestrationStopAll');
        }
    }
```

---

## Summary of Changes

**Total changes to `external_api.js`:**

1. **Line 1-10** (Imports section):
   - Add: `import { OrchestrationAPI } from './orchestration_api.js';`

2. **Line ~18** (Constructor):
   - Remove: `this.multiBotManager = new MultiBotManager(agent);`
   - Add: `this.orchestration = new OrchestrationAPI(agent);`

3. **Line ~122** (setupRoutes - add 10 new routes):
   - Add orchestration endpoints

4. **End of class** (before `start()` method):
   - Add 10 handler methods

**That's it!** No other changes needed.

---

## File Checklist

After making changes, you should have:

✅ `src/agent/external_api.js` - Updated with 3 sections above
✅ `src/agent/orchestration_api.js` - NEW file (copy from outputs)
✅ Everything else - UNCHANGED

Your project is now ready for n8n orchestration!
