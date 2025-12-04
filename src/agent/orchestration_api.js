// src/agent/orchestration_api.js
// n8n-friendly orchestration API for collaborative building
// Exposes worker spawning and coordination as simple REST endpoints

import { spawn } from 'child_process';
import settings from '../../settings.js';
import net from 'net';

export class OrchestrationAPI {
    constructor(agent) {
        this.agent = agent;
        this.workers = new Map();           // workerName -> { process, port, status, spawnTime }
        this.buildSessions = new Map();     // sessionId -> { buildRequest, workers, status, startTime }
        this.buildLocations = [];           // Track reserved build locations
        this.nextWorkerPort = settings.multibot_base_port + 2;
        this.reservedPorts = new Set(); 
        this.workerCounter = 0;  // ADD THIS
    }

    /**
     * Check if a port is available by attempting to bind
     */
    async isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(false);
                } else {
                    resolve(false);
                }
            });
            
            server.once('listening', () => {
                server.close();
                resolve(true);
            });
            
            server.listen(port, '127.0.0.1');
        });
    }

    /**
     * Reserve a port to prevent race conditions
     */
    reservePort(port) {
        if (this.reservedPorts.has(port)) {
            return false;
        }
        this.reservedPorts.add(port);
        return true;
    }

    /**
     * Release a port reservation on failure
     */
    releasePort(port) {
        if (this.reservedPorts.has(port)) {
            this.reservedPorts.delete(port);
        }
    }

    /**
     * Find next available port starting from startPort
     */
    async findNextAvailablePort(startPort, maxAttempts = 100) {
        console.log(`🔍 Finding available port starting from ${startPort}...`);
        
        for (let i = 0; i < maxAttempts; i++) {
            const port = startPort + i;
            
            // Skip if reserved
            if (this.reservedPorts.has(port)) {
                console.log(`   ⏭️  Port ${port} reserved`);
                continue;
            }
            
            // Skip if worker using it
            if (Array.from(this.workers.values()).some(w => w.port === port)) {
                console.log(`   ⏭️  Port ${port} in use by worker`);
                continue;
            }
            
            // Check actual availability
            const available = await this.isPortAvailable(port);
            console.log(`   📍 Port ${port}: ${available ? 'available' : 'unavailable'}`);
            
            if (available) {
                console.log(`   ✓ Selected port ${port}`);
                return port;
            }
        }
        
        console.log(`❌ No available ports found starting from ${startPort}`);
        return null;
    }
    /**
     * Spawn a single worker bot process
     * Called by n8n for each worker needed
     */
    async spawnWorker(name, port, sessionId, callbackWebhookUrl) {

        // Check if worker already exists
        if (this.workers.has(name)) {
            const existing = this.workers.get(name);
            console.log(`ℹ️  Worker ${name} already exists, reusing`);
            return {
                success: true,
                workerName: name,
                port: existing.port,
                status: 'existing',
                pid: existing.process.pid,
                message: `Worker ${name} already running`
                };
        }

        console.log(`🔧 Spawning worker: ${name} on port ${port}`);

        // Find next available port (auto-increment from requested)
        const availablePort = await this.findNextAvailablePort(port);
        if (!availablePort) {
            return {
                success: false,
                workerName: name,
                requestedPort: port,
                error: `No available ports found starting from ${port}`
            };
        }

        console.log(`Assigned port: ${availablePort}`);
        const actualPort = availablePort;
        // Reserve the port
        if (!this.reservePort(actualPort)) {
            return {
                success: false,
                workerName: name,
                requestedPort: port,
                error: `Failed to reserve port ${actualPort}`
            };
        }
        
        try {
            // Build worker initialization arguments
            let args = ['src/process/init_worker.js', name];
            args.push('-n', name);
            args.push('-p', actualPort);
            args.push('-s', sessionId);

            
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
                port: actualPort,
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

            // Wait for worker API to be ready
            const ready = await this.isWorkerReady(actualPort, 30000);
            if (!ready) {
                throw new Error(`Worker ${name} API not responding after 30 seconds`);
            }

            // Move worker to safe location
            /**
            try {
                const leaderPos = this.agent.bot.entity.position;
                console.log(`📍 Leader position: x=${leaderPos.x.toFixed(2)}, y=${leaderPos.y.toFixed(2)}, z=${leaderPos.z.toFixed(2)}`);
                const safePos = {
                    x: Math.floor(leaderPos.x) + 1,
                    y: Math.floor(leaderPos.y),
                    z: Math.floor(leaderPos.z) + 1
                };
                console.log(`🎯 Moving ${name} to safe location: x=${safePos.x}, y=${safePos.y}, z=${safePos.z}`);


                const response = await fetch(`http://localhost:${port}/api/agent/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(safePos),
                    timeout: 15000
                });

                if (!response.ok) {
                    throw new Error(`Move failed with status ${response.status}`);
                }

                console.log(`✓ Worker ${name} moved to safe location`);

            } catch (error) {
                console.error(`❌ Worker ${name} failed to move to safe location: ${error.message}`);
                // Kill the stuck worker
                workerProcess.kill('SIGTERM');
                this.workers.delete(name);
                
                return {
                    success: false,
                    workerName: name,
                    port: actualPort,
                    status: 'spawned',
                    pid: workerProcess.pid,
                    error: `Failed to move to safe location: ${error.message}`
                };
            }
            */
            return {
                success: true,
                workerName: name,
                port: actualPort,
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
    * Replace the reserveBuildLocation and findGroundLevel methods with these versions.
    * These work correctly for superflat worlds (Y=-60 surface) and handle chunk loading issues.
    */

    /**
    * Reserve a build location for combat or building
    * Uses leader's current Y position as ground truth (works for any world type)
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

        // ✅ SIMPLIFIED: Use leader's current Y position as ground truth
        // This works for ANY world type (normal, superflat, custom)
        const leaderY = this.getLeaderGroundLevel();
        
        if (leaderY !== null) {
            buildLocation.y = leaderY;
            console.log(`✓ Using leader's Y position: ${buildLocation.y} (works for any world type)`);
        } else if (preferredLocation.y !== undefined) {
            // Fallback to preferred location Y if leader position unavailable
            buildLocation.y = preferredLocation.y;
            console.log(`⚠️ Leader position unavailable, using preferred Y: ${buildLocation.y}`);
        } else {
            // Last resort fallback
            buildLocation.y = 64;
            console.warn(`⚠️ No Y reference available, using default Y=64`);
        }

        // Reserve the location
        this.buildLocations.push({
            x: buildLocation.x,
            y: buildLocation.y,
            z: buildLocation.z,
            sessionId: sessionId,
            buildRequest: this.buildSessions.get(sessionId)?.buildRequest || '',
            timestamp: Date.now(),
            groundLevel: buildLocation.y
        });

        // Update session
        const session = this.buildSessions.get(sessionId);
        if (session) {
            session.buildLocation = buildLocation;
            session.groundLevel = buildLocation.y;
        }

        console.log(`✓ Location reserved: x=${buildLocation.x}, y=${buildLocation.y}, z=${buildLocation.z}`);

        return {
            success: true,
            sessionId: sessionId,
            buildLocation: buildLocation,
            groundLevel: buildLocation.y,
            message: `Build location reserved at Y=${buildLocation.y}`
        };
    }

    /**
     * Get the leader bot's current Y position (ground level)
     * This is the most reliable way to determine ground level for any world type
     * @returns {number|null} Y coordinate or null if unavailable
     */
    getLeaderGroundLevel() {
        try {
            const bot = this.agent?.bot;
            if (!bot || !bot.entity || !bot.entity.position) {
                console.warn(`⚠️ Leader bot position not available`);
                return null;
            }

            // Use leader's current Y, floored to block level
            const leaderY = Math.floor(bot.entity.position.y);
            console.log(`📍 Leader is at Y=${leaderY}`);
            return leaderY;

        } catch (error) {
            console.error(`⚠️ Error getting leader position:`, error.message);
            return null;
        }
    }

    /**
     * Find the ground level (top solid block) at given X,Z coordinates
     * NOTE: This method has reliability issues due to chunk loading.
     * Prefer using getLeaderGroundLevel() instead.
     * 
     * @deprecated Use getLeaderGroundLevel() for more reliable results
     */
    findGroundLevel(x, z) {
        try {
            const bot = this.agent?.bot;
            if (!bot || !bot.blockAt) {
                console.warn(`⚠️ Bot not available for ground level detection`);
                return null;
            }

            // First, try using leader's Y as starting point (more efficient)
            const leaderY = this.getLeaderGroundLevel();
            if (leaderY !== null) {
                // Search in a small range around leader's Y
                for (let y = leaderY + 10; y >= leaderY - 10; y--) {
                    try {
                        const block = bot.blockAt(x, y, z);
                        if (block && block.type !== 0) {
                            console.log(`✓ Found solid ground: ${block.name} at y=${y}`);
                            return y;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }

            // Fallback: full column scan (less reliable due to chunk loading)
            for (let y = 320; y >= -64; y--) {
                try {
                    const block = bot.blockAt(x, y, z);
                    if (block && block.type !== 0) {
                        console.log(`✓ Found solid ground: ${block.name} at y=${y}`);
                        return y;
                    }
                } catch (e) {
                    continue;
                }
            }

            // If nothing found, return leader's Y as best guess
            if (leaderY !== null) {
                console.warn(`⚠️ No blocks found at x=${x}, z=${z}, using leader's Y=${leaderY}`);
                return leaderY;
            }

            console.warn(`⚠️ No solid ground found at x=${x}, z=${z}`);
            return null;

        } catch (error) {
            console.error(`⚠️ Error finding ground level:`, error.message);
            return null;
        }
    }

    /**
     * Teleport all workers to coordinated positions around build site
     * Called by n8n to position workers
     */
    async teleportWorkers(sessionId, buildLocation) {
        console.log(`🚀 Teleporting workers to a new location`);

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

    // Add this method to the OrchestrationAPI class in orchestration_api.js

        /**
         * Send a task for a specific stage to a worker
         * Tracks task metadata and correlates callbacks with original request
         * 
         * @param {string} sessionId - Build session ID
         * @param {number} stageNumber - Stage number (1, 2, 3, etc.)
         * @param {string} workerName - Worker name (Worker1, Worker2, etc.)
         * @param {number} port - Worker port
         * @param {string} taskPrompt - Full task prompt for worker
         * @param {string} callbackWebhookUrl - Optional callback webhook URL
         * @returns {object} Task metadata with taskId
         */
    async sendTaskStage(sessionId, stageNumber, workerName, port, taskPrompt, callbackWebhookUrl) {
        console.log(`📤 [Stage Task] Sending stage ${stageNumber} to ${workerName} on port ${port}`);
        
        // Generate unique task ID
        const taskId = `task_${sessionId}_stage${stageNumber}_${workerName}_${Date.now()}`;
        
        // Initialize task tracking if needed
        if (!this.stageTasks) {
            this.stageTasks = new Map();
        }
        
        try {
            // Store task metadata for tracking
            const taskMetadata = {
                taskId: taskId,
                sessionId: sessionId,
                stageNumber: stageNumber,
                workerName: workerName,
                port: port,
                status: 'queued',
                createdAt: Date.now(),
                sentAt: null,
                completedAt: null,
                callbackWebhookUrl: callbackWebhookUrl || null,
                taskPrompt: taskPrompt.substring(0, 200), // Store first 200 chars for reference
                result: null,
                error: null
            };
            
            this.stageTasks.set(taskId, taskMetadata);
            
            console.log(`📋 [Stage Task] Created task ${taskId}`);
            console.log(`   Stage: ${stageNumber}, Worker: ${workerName}, Port: ${port}`);
            
            // Send task to worker
            const result = await this.sendTaskToWorker(port, taskPrompt, callbackWebhookUrl, taskId);
            
            // Update metadata - task was sent
            taskMetadata.status = 'executing';
            taskMetadata.sentAt = Date.now();
            
            if (!result.success) {
            taskMetadata.status = 'failed';
            taskMetadata.error = result.error;
            console.error(`❌ [Stage Task] Failed to send task ${taskId}: ${result.error}`);
            return {
                success: false,
                taskId: taskId,
                sessionId: sessionId,
                stageNumber: stageNumber,
                worker: workerName,
                error: result.error
            };
            }
            
            console.log(`✅ [Stage Task] Task ${taskId} sent successfully`);
            
            return {
                success: true,
                taskId: taskId,
                sessionId: sessionId,
                stageNumber: stageNumber,
                worker: workerName,
                port: port,
                status: 'executing',
                createdAt: taskMetadata.createdAt
            };
            
        } catch (error) {
            console.error(`❌ [Stage Task] Error sending task ${taskId}:`, error.message);
            
            if (this.stageTasks.has(taskId)) {
            const metadata = this.stageTasks.get(taskId);
            metadata.status = 'failed';
            metadata.error = error.message;
            }
            
            return {
            success: false,
            taskId: taskId,
            sessionId: sessionId,
            stageNumber: stageNumber,
            worker: workerName,
            error: error.message
            };
        }
        }

    /**
     * Handle stage task completion
     * Called when worker finishes a stage task and sends callback
     * 
     * @param {string} taskId - Task ID from original sendTaskStage
     * @param {object} result - Result from worker
     * @returns {object} Update status
     */
    async handleTaskStageComplete(taskId, result) {
        console.log(`✅ [Stage Complete] Task ${taskId} completed`);
        
        if (!this.stageTasks || !this.stageTasks.has(taskId)) {
            console.warn(`⚠️  [Stage Complete] Task ${taskId} not found in tracking`);
            return {
            success: false,
            error: `Task ${taskId} not found`
            };
        }
        
        const taskMetadata = this.stageTasks.get(taskId);
        
        // Update metadata
        taskMetadata.status = 'completed';
        taskMetadata.completedAt = Date.now();
        taskMetadata.result = result;
        
        const duration = taskMetadata.completedAt - taskMetadata.sentAt;
        
        console.log(`📊 [Stage Complete] Task ${taskId} stats:`);
        console.log(`   Worker: ${taskMetadata.workerName}`);
        console.log(`   Stage: ${taskMetadata.stageNumber}`);
        console.log(`   Duration: ${duration}ms`);
        console.log(`   Status: ${taskMetadata.status}`);
        
        return {
            success: true,
            taskId: taskId,
            sessionId: taskMetadata.sessionId,
            stageNumber: taskMetadata.stageNumber,
            worker: taskMetadata.workerName,
            duration: duration,
            status: 'completed'
        };
    }

    /**
     * Get task metadata by ID
     * @param {string} taskId - Task ID
     * @returns {object} Task metadata or null
     */
    getTaskMetadata(taskId) {
        if (!this.stageTasks) return null;
        return this.stageTasks.get(taskId) || null;
    }

    /**
     * Get all tasks for a session
     * @param {string} sessionId - Session ID
     * @returns {array} Array of task metadata
     */
    getSessionTasks(sessionId) {
        if (!this.stageTasks) return [];
        const tasks = [];
        this.stageTasks.forEach((metadata) => {
            if (metadata.sessionId === sessionId) {
            tasks.push(metadata);
            }
        });
        return tasks;
    }

    /**
     * Get all tasks for a stage
     * @param {string} sessionId - Session ID
     * @param {number} stageNumber - Stage number
     * @returns {array} Array of task metadata
     */
    getStageTasks(sessionId, stageNumber) {
        if (!this.stageTasks) return [];
        const tasks = [];
        this.stageTasks.forEach((metadata) => {
            if (metadata.sessionId === sessionId && metadata.stageNumber === stageNumber) {
            tasks.push(metadata);
            }
        });
        return tasks;
    }

    /**
     * Clean up old tasks (older than 1 hour)
     */
    cleanupOldTasks() {
        if (!this.stageTasks) return;
        
        const currentTime = Date.now();
        const maxAge = 3600000; // 1 hour
        
        let cleaned = 0;
        this.stageTasks.forEach((metadata, taskId) => {
            if (currentTime - metadata.createdAt > maxAge) {
            this.stageTasks.delete(taskId);
            cleaned++;
            }
        });
        
        if (cleaned > 0) {
            console.log(`🧹 [Cleanup] Removed ${cleaned} old tasks`);
        }
    }

    /**
     * Send a task to a worker via its API
     * Called by n8n to assign work OR by sendTaskStage for stage-aware tracking
     * 
     * @param {number} workerPort - Port of the worker
     * @param {string} taskPrompt - The task prompt/description
     * @param {string} taskId - Optional: Task ID for tracking (stage tasks)
     */
    async sendTaskToWorker(workerPort, taskPrompt, conversationId, callbackWebhookUrl, taskId = null) {
        console.log(`📤 Sending task to worker on port ${workerPort}`);
        console.log(`   Task prompt length: ${taskPrompt?.length || 0} characters`);
        console.log(`   Task preview: ${taskPrompt?.substring(0, 100)}...`);
        if (taskId) {
            console.log(`   Task ID: ${taskId}`);
        }

        try {
            console.log(`   Connecting to: http://localhost:${workerPort}/api/agent/newAction`);
            
            // Build the request body
            const requestBody = {
                prompt: taskPrompt
            };
            
            // Include taskId if this is a stage task (for callback correlation)
            if (taskId) {
                requestBody.taskId = taskId;
            }
            if (callbackWebhookUrl) {
                requestBody.callbackWebhookUrl = callbackWebhookUrl;
            }
            if (conversationId) {
                requestBody.conversationId = conversationId;
            }

            
            const response = await fetch(`http://localhost:${workerPort}/api/agent/newAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            timeout: 900000  // 15 minutes
            });

            console.log(`   Response status: ${response.status}`);

            if (response.ok) {
            const result = await response.json();
            console.log(`✅ Task sent successfully to port ${workerPort}`);
            console.log(`   Result: ${JSON.stringify(result).substring(0, 200)}`);
            return {
                success: true,
                port: workerPort,
                taskId: taskId,
                result: result
            };
            } else {
            const errorText = await response.text();
            console.error(`❌ Failed to send task to port ${workerPort}: HTTP ${response.status}`);
            console.error(`   Error: ${errorText.substring(0, 200)}`);
            return {
                success: false,
                port: workerPort,
                taskId: taskId,
                error: `HTTP ${response.status}: ${errorText}`
            };
            }
        } catch (error) {
            console.error(`❌ Error sending task to port ${workerPort}:`, error.message);
            console.error(`   Error code: ${error.code}`);
            console.error(`   Error details: ${error.toString()}`);
            return {
            success: false,
            port: workerPort,
            taskId: taskId,
            error: error.message
            };
        }
        }

   /**
     * Teleport all workers to coordinated positions around build site
     * Called by n8n to position workers
     */
    async teleportWorkers(sessionId, buildLocation) {
        const session = this.buildSessions.get(sessionId);
        if (!session) {
            return { success: false, error: `Build session ${sessionId} not found` };
        }

        const workers = session.workers;
        const results = [];
        const timeout = 30000;  // 30 seconds max wait
        const checkInterval = 500;

        // Send move commands to all workers
        for (let i = 0; i < workers.length; i++) {
            const worker = workers[i];
            const angle = (i / workers.length) * 2 * Math.PI;
            const radius = Math.min(3, workers.length);

            const targetPos = {
                x: Math.floor(buildLocation.x + Math.cos(angle) * radius),
                y: buildLocation.y,
                z: Math.floor(buildLocation.z + Math.sin(angle) * radius)
            };

            try {
                await fetch(`http://localhost:${worker.port}/api/agent/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(targetPos),
                    timeout: 5000
                });
                results.push({ workerName: worker.name, targetPos: targetPos, arrived: false });
            } catch (error) {
                results.push({ workerName: worker.name, status: 'error', error: error.message });
            }
        }

        // Wait for pathfinding to complete (15 seconds should be plenty)
        await new Promise(resolve => setTimeout(resolve, 15000));

        console.log(`✓ All workers should have arrived at teleport positions`);
        return { success: true, sessionId: sessionId, results: results, buildLocation: buildLocation };
    }

    async moveWorkerToPlayer(workerName, playerName, distance = 3) {
        const worker = this.workers.get(workerName);
        if (!worker) {
            return { success: false, error: `Worker ${workerName} not found` };
        }

        const response = await fetch(`http://localhost:${worker.port}/api/agent/goToPlayer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player: playerName, distance: distance })
        });

        return response.ok ? { success: true, message: `${workerName} moving to ${playerName}` } : 
                            { success: false, error: await response.text() };
    }

    async moveWorkerToCoordinates(workerName, x, y, z) {
        const worker = this.workers.get(workerName);
        if (!worker) {
            return { success: false, error: `Worker ${workerName} not found` };
        }

        const response = await fetch(`http://localhost:${worker.port}/api/agent/goToCoordinates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: x, y: y, z: z })
        });

        return response.ok ? { success: true, message: `${workerName} moving to ${x}, ${y}, ${z}` } : 
                            { success: false, error: await response.text() };
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
