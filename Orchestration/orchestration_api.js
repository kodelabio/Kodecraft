// src/agent/orchestration_api.js
// n8n-friendly orchestration API for collaborative building
// Exposes worker spawning and coordination as simple REST endpoints

import { spawn } from 'child_process';
import settings from '../../settings.js';

export class OrchestrationAPI {
    constructor(agent) {
        this.agent = agent;
        this.workers = new Map();           // workerName -> { process, port, status, spawnTime }
        this.buildSessions = new Map();     // sessionId -> { buildRequest, workers, status, startTime }
        this.buildLocations = [];           // Track reserved build locations
        this.nextWorkerPort = settings.multibot_base_port + 2;
    }

    /**
     * Spawn a single worker bot process
     * Called by n8n for each worker needed
     */
    async spawnWorker(name, port, sessionId, callbackWebhookUrl) {
        console.log(`🔧 Spawning worker: ${name} on port ${port}`);
        
        try {
            // Build worker initialization arguments
            let args = ['src/process/init_worker.js', name];
            args.push('-n', name);
            args.push('-p', port);
            args.push('-c', sessionId);
            
            // Pass callback URL if provided
            if (callbackWebhookUrl) {
                args.push('-w', callbackWebhookUrl);
            }

            // Spawn the worker process
            const workerProcess = spawn('node', args, {
                stdio: 'inherit',
                stderr: 'inherit',
            });

            // Store worker info
            this.workers.set(name, {
                process: workerProcess,
                port: port,
                status: 'spawning',
                sessionId: sessionId,
                spawnTime: Date.now(),
                lastUpdate: Date.now()
            });

            console.log(`✓ Worker ${name} process spawned (PID: ${workerProcess.pid})`);

            // Handle process exit
            workerProcess.on('exit', (code, signal) => {
                console.log(`⚠️  Worker ${name} exited with code ${code}, signal ${signal}`);
                this.workers.delete(name);
            });

            // Handle process error
            workerProcess.on('error', (err) => {
                console.error(`❌ Worker ${name} error:`, err);
                this.workers.delete(name);
            });

            // Wait a moment for process to start
            await new Promise(resolve => setTimeout(resolve, 1000));

            return {
                success: true,
                workerName: name,
                port: port,
                status: 'spawned',
                pid: workerProcess.pid,
                message: `Worker ${name} spawned successfully`
            };

        } catch (error) {
            console.error(`Failed to spawn worker ${name}:`, error);
            return {
                success: false,
                workerName: name,
                error: error.message
            };
        }
    }

    /**
     * Check if a worker is ready by pinging its health endpoint
     */
    async isWorkerReady(port, timeout = 5000) {
        const startTime = Date.now();
        const checkInterval = 500;

        while (Date.now() - startTime < timeout) {
            try {
                const response = await fetch(`http://localhost:${port}/api/health`, {
                    method: 'GET',
                    timeout: 2000
                });

                if (response.ok) {
                    console.log(`✓ Worker on port ${port} is ready`);
                    return true;
                }
            } catch (error) {
                // Not ready yet, continue polling
            }

            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        console.warn(`⚠️  Worker on port ${port} did not respond within ${timeout}ms`);
        return false;
    }

    /**
     * Wait for multiple workers to be ready
     * Called by n8n after spawning workers
     */
    async waitForWorkersReady(workers, timeoutMs = 30000) {
        console.log(`⏳ Waiting for ${workers.length} workers to be ready...`);

        const readinessChecks = workers.map(worker => 
            this.isWorkerReady(worker.port, timeoutMs)
        );

        const results = await Promise.all(readinessChecks);
        const allReady = results.every(ready => ready);

        if (allReady) {
            console.log(`✓ All ${workers.length} workers are ready!`);
            workers.forEach((worker, index) => {
                const workerInfo = this.workers.get(worker.name);
                if (workerInfo) {
                    workerInfo.status = 'ready';
                    workerInfo.lastUpdate = Date.now();
                }
            });
        } else {
            console.warn(`⚠️  Some workers not ready. Proceeding anyway...`);
        }

        return {
            allReady: allReady,
            readyCount: results.filter(r => r).length,
            totalCount: workers.length,
            workers: workers.map((w, i) => ({
                name: w.name,
                port: w.port,
                ready: results[i]
            }))
        };
    }

    /**
     * Create a build session to track collaborative work
     * Called by n8n to initialize a build
     */
    createBuildSession(sessionId, buildRequest, workerCount) {
        console.log(`📋 Creating build session ${sessionId}`);

        const session = {
            sessionId: sessionId,
            buildRequest: buildRequest,
            workerCount: workerCount,
            workers: [],
            tasks: [],
            status: 'created',
            startTime: Date.now(),
            buildLocation: null,
            completedWorkers: 0
        };

        this.buildSessions.set(sessionId, session);

        console.log(`✓ Build session ${sessionId} created`);

        return {
            success: true,
            sessionId: sessionId,
            status: 'created',
            message: `Build session created for: "${buildRequest}"`
        };
    }

    /**
     * Register workers for a build session
     * Called by n8n after workers are ready
     */
    registerWorkersForSession(sessionId, workers) {
        console.log(`📝 Registering ${workers.length} workers for session ${sessionId}`);

        const session = this.buildSessions.get(sessionId);
        if (!session) {
            return {
                success: false,
                error: `Build session ${sessionId} not found`
            };
        }

        session.workers = workers;
        session.status = 'workers_assigned';
        session.lastUpdate = Date.now();

        // Update worker info with session
        workers.forEach(worker => {
            const workerInfo = this.workers.get(worker.name);
            if (workerInfo) {
                workerInfo.status = 'assigned';
                workerInfo.currentSession = sessionId;
            }
        });

        console.log(`✓ ${workers.length} workers registered for session ${sessionId}`);

        return {
            success: true,
            sessionId: sessionId,
            workersRegistered: workers.length,
            workers: workers
        };
    }

    /**
     * Determine and reserve a build location
     * Prevents conflicts between concurrent builds
     */
    reserveBuildLocation(sessionId, preferredLocation, minDistance = 30) {
        console.log(`📍 Reserving build location for session ${sessionId}`);

        let buildLocation = { ...preferredLocation };

        // Check for conflicts with other sessions
        const otherBuilds = this.buildLocations.filter(
            build => build.sessionId !== sessionId
        );

        // Try to find a non-conflicting location
        let attempts = 0;
        while (attempts < 5) {
            const hasConflict = otherBuilds.some(build => {
                const distance = Math.sqrt(
                    Math.pow(buildLocation.x - build.x, 2) +
                    Math.pow(buildLocation.z - build.z, 2)
                );
                return distance < minDistance;
            });

            if (!hasConflict) {
                break;
            }

            // Move to new location if conflict found
            const angle = (attempts * 72) * (Math.PI / 180);
            buildLocation = {
                x: Math.floor(preferredLocation.x + Math.cos(angle) * minDistance),
                y: preferredLocation.y,
                z: Math.floor(preferredLocation.z + Math.sin(angle) * minDistance)
            };
            attempts++;
        }

        // Reserve the location
        this.buildLocations.push({
            x: buildLocation.x,
            y: buildLocation.y,
            z: buildLocation.z,
            sessionId: sessionId,
            buildRequest: this.buildSessions.get(sessionId)?.buildRequest || '',
            timestamp: Date.now()
        });

        // Update session
        const session = this.buildSessions.get(sessionId);
        if (session) {
            session.buildLocation = buildLocation;
        }

        console.log(`✓ Location reserved: x=${buildLocation.x}, y=${buildLocation.y}, z=${buildLocation.z}`);

        return {
            success: true,
            sessionId: sessionId,
            buildLocation: buildLocation,
            message: `Build location reserved`
        };
    }

    /**
     * Teleport all workers to coordinated positions around build site
     * Called by n8n to position workers
     */
    async teleportWorkers(sessionId, buildLocation) {
        console.log(`🚀 Teleporting workers to build location`);

        const session = this.buildSessions.get(sessionId);
        if (!session) {
            return {
                success: false,
                error: `Build session ${sessionId} not found`
            };
        }

        const workers = session.workers;
        const results = [];

        // Teleport each worker to a position around the build site
        for (let i = 0; i < workers.length; i++) {
            const worker = workers[i];
            try {
                // Calculate formation position (tight circle)
                const angle = (i / workers.length) * 2 * Math.PI;
                const radius = Math.min(3, workers.length);

                const targetPos = {
                    x: Math.floor(buildLocation.x + Math.cos(angle) * radius),
                    y: buildLocation.y,
                    z: Math.floor(buildLocation.z + Math.sin(angle) * radius)
                };

                const response = await fetch(`http://localhost:${worker.port}/api/agent/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(targetPos),
                    timeout: 5000
                });

                if (response.ok) {
                    results.push({
                        workerName: worker.name,
                        status: 'teleported',
                        position: targetPos
                    });
                    console.log(`✓ ${worker.name} teleported to ${targetPos.x}, ${targetPos.y}, ${targetPos.z}`);
                } else {
                    results.push({
                        workerName: worker.name,
                        status: 'failed',
                        error: `HTTP ${response.status}`
                    });
                }
            } catch (error) {
                results.push({
                    workerName: worker.name,
                    status: 'error',
                    error: error.message
                });
            }
        }

        return {
            success: true,
            sessionId: sessionId,
            teleportResults: results,
            buildLocation: buildLocation
        };
    }

    /**
     * Send a task to a worker via its API
     * Called by n8n to assign work
     */
    async sendTaskToWorker(workerPort, taskPrompt) {
        console.log(`📤 Sending task to worker on port ${workerPort}`);

        try {
            const response = await fetch(`http://localhost:${workerPort}/api/agent/newAction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: taskPrompt }),
                timeout: 5000
            });

            if (response.ok) {
                const result = await response.json();
                console.log(`✓ Task sent to worker on port ${workerPort}`);
                return {
                    success: true,
                    port: workerPort,
                    result: result
                };
            } else {
                const errorText = await response.text();
                return {
                    success: false,
                    port: workerPort,
                    error: `HTTP ${response.status}: ${errorText}`
                };
            }
        } catch (error) {
            console.error(`Error sending task to port ${workerPort}:`, error);
            return {
                success: false,
                port: workerPort,
                error: error.message
            };
        }
    }

    /**
     * Get current status of all workers and sessions
     * Called by n8n to monitor progress
     */
    getStatus() {
        const workers = Array.from(this.workers.entries()).map(([name, info]) => ({
            name: name,
            port: info.port,
            status: info.status,
            uptime: Date.now() - info.spawnTime,
            currentSession: info.currentSession || null
        }));

        const sessions = Array.from(this.buildSessions.entries()).map(([id, session]) => ({
            sessionId: id,
            buildRequest: session.buildRequest,
            status: session.status,
            workersAssigned: session.workers.length,
            tasksQueued: session.tasks.length,
            buildLocation: session.buildLocation,
            runtime: Date.now() - session.startTime
        }));

        return {
            totalWorkers: this.workers.size,
            readyWorkers: Array.from(this.workers.values()).filter(w => w.status === 'ready').length,
            activeSessions: this.buildSessions.size,
            workers: workers,
            sessions: sessions,
            buildLocations: this.buildLocations
        };
    }

    /**
     * Stop a specific worker
     */
    async stopWorker(workerName) {
        console.log(`🛑 Stopping worker ${workerName}`);

        const worker = this.workers.get(workerName);
        if (!worker) {
            return {
                success: false,
                error: `Worker ${workerName} not found`
            };
        }

        try {
            worker.process.kill('SIGINT');
            console.log(`✓ Stopped worker ${workerName}`);
            return {
                success: true,
                workerName: workerName,
                message: `Worker ${workerName} stopped`
            };
        } catch (error) {
            console.error(`Error stopping worker ${workerName}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stop all workers and clean up sessions
     */
    async stopAllWorkers() {
        console.log(`🛑 Stopping all ${this.workers.size} workers`);

        for (const [name, worker] of this.workers) {
            try {
                worker.process.kill('SIGINT');
                console.log(`✓ Stopped worker ${name}`);
            } catch (error) {
                console.error(`Error stopping worker ${name}:`, error);
            }
        }

        this.workers.clear();
        this.buildSessions.clear();
        this.buildLocations = [];
        this.nextWorkerPort = settings.multibot_base_port + 2;

        return {
            success: true,
            message: 'All workers stopped'
        };
    }

    /**
     * Clean up old sessions and locations
     */
    cleanup() {
        const currentTime = Date.now();
        const maxAge = 3600000; // 1 hour

        // Remove old sessions
        for (const [id, session] of this.buildSessions) {
            if (currentTime - session.startTime > maxAge) {
                console.log(`Cleaning up old session: ${id}`);
                this.buildSessions.delete(id);
            }
        }

        // Remove old location reservations
        this.buildLocations = this.buildLocations.filter(
            loc => currentTime - loc.timestamp < maxAge
        );
    }
}
