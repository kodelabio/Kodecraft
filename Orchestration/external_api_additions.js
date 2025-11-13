// Add these imports to external_api.js
import { OrchestrationAPI } from './orchestration_api.js';

// Add this to ExternalAPI constructor (after line 18)
// Replace:
//     this.multiBotManager = new MultiBotManager(agent);
// With:
//     this.orchestration = new OrchestrationAPI(agent);

// =============================================================================
// ADD THESE NEW ROUTES TO setupRoutes() METHOD IN external_api.js
// =============================================================================

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

// =============================================================================
// ADD THESE HANDLER METHODS TO ExternalAPI CLASS
// =============================================================================

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
