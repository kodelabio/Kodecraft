// src/agent/multibot_manager.js
// Multi-bot coordination system for external brain mode

import { AgentProcess } from '../process/agent_process.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import settings from '../../settings.js';

// Worker process class that runs workers in internal brain mode
class WorkerProcess extends EventEmitter {
    constructor(name, port) {
        super();
        this.name = name;
        this.port = port;
        this.running = false;
    }

    async start(load_memory = false, init_message = null, count_id = 0) {
        this.running = true;
        this.count_id = count_id;

        // Start worker with internal brain mode (no MindServer connection)
        let args = ['src/process/init_worker.js', this.name];
        args.push('-n', this.name);
        args.push('-p', this.port);
        args.push('-c', count_id);
        if (load_memory) {
            args.push('-l', load_memory);
        }
        if (init_message) {
            args.push('-m', init_message);
        }

        const workerProcess = spawn('node', args, {
            stdio: 'inherit',
            stderr: 'inherit',
        });
        
        let last_restart = Date.now();
        workerProcess.on('exit', (code, signal) => {
            console.log(`Worker ${this.name} process exited with code ${code} and signal ${signal}`);
            this.running = false;
            this.emit('exit', this.name);
            
            if (code > 1) {
                console.log(`Ending worker task`);
                return;
            }

            if (code !== 0 && signal !== 'SIGINT') {
                // Worker must run for at least 5 seconds before restarting
                if (Date.now() - last_restart < 5000) {
                    console.error(`Worker process exited too quickly and will not be restarted.`);
                    return;
                }
                console.log(`Restarting worker ${this.name}...`);
                this.start(true, 'Worker process restarted.', this.count_id);
                last_restart = Date.now();
            }
        });
    
        workerProcess.on('error', (err) => {
            console.error(`Worker ${this.name} process error:`, err);
        });

        this.process = workerProcess;
        
        // Give the worker a moment to start
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    stop() {
        if (!this.running) return;
        this.process.kill('SIGINT');
    }
}

export class MultiBotManager {
    constructor(leaderAgent) {
        this.leaderAgent = leaderAgent;
        this.workers = new Map(); // workerName -> { process, port, status, currentTask }
        this.nextWorkerPort = settings.multibot_base_port + 2; // Start from 4002 (4001 is leader)
        this.taskQueue = [];
        this.buildSessions = new Map(); // sessionId -> { workers, tasks, status }
    }

    // Spawn worker bots with AI-driven coordination
    async spawnWorkers(count, leaderName = 'Leader') {
        console.log(`MultiBotManager: Spawning ${count} workers for leader ${leaderName}`);
        
        const spawnedWorkers = [];
        
        for (let i = 0; i < count; i++) {
            const workerName = `${leaderName}Worker${i + 1}`;
            const workerPort = this.nextWorkerPort++;
            
            try {
                // Create worker process - workers use internal brain mode
                const workerProcess = new WorkerProcess(workerName, workerPort);
                
                // Start worker with internal brain mode and unique count_id
                await workerProcess.start(false, `Hello, I am ${workerName}. Ready to work!`, i + 1);
                
                // Store worker info
                this.workers.set(workerName, {
                    process: workerProcess,
                    port: workerPort,
                    status: 'spawning',
                    currentTask: null,
                    spawnTime: Date.now()
                });
                
                spawnedWorkers.push({
                    name: workerName,
                    port: workerPort,
                    status: 'spawning'
                });
                
                console.log(`Worker ${workerName} spawning on port ${workerPort}`);
                
                // Set up process exit handler
                workerProcess.on('exit', (name) => {
                    console.log(`Worker ${name} process exited`);
                    this.workers.delete(name);
                });
                
            } catch (error) {
                console.error(`Failed to spawn worker ${workerName}:`, error);
            }
        }
        
        // Wait for workers to initialize
        await this.waitForWorkersReady(spawnedWorkers.map(w => w.name));
        
        return spawnedWorkers;
    }

    // Wait for workers to be ready (with timeout)
    async waitForWorkersReady(workerNames, timeoutMs = 30000) {
        console.log(`Waiting for ${workerNames.length} workers to be ready...`);
        
        const startTime = Date.now();
        const checkInterval = 1000;
        
        while (Date.now() - startTime < timeoutMs) {
            let allReady = true;
            
            for (const workerName of workerNames) {
                const worker = this.workers.get(workerName);
                if (!worker || worker.status === 'spawning') {
                    // Try to ping worker API to check if ready
                    try {
                        const response = await fetch(`http://localhost:${worker.port}/api/health`, {
                            method: 'GET',
                            timeout: 2000
                        });
                        
                        if (response.ok) {
                            worker.status = 'ready';
                            console.log(`Worker ${workerName} is ready on port ${worker.port}`);
                        } else {
                            allReady = false;
                        }
                    } catch (error) {
                        allReady = false;
                    }
                }
            }
            
            if (allReady) {
                console.log(`All ${workerNames.length} workers are ready!`);
                return true;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        console.warn(`Timeout waiting for workers to be ready. Proceeding anyway...`);
        return false;
    }

    // Coordinate collaborative building with AI-driven task distribution
    async coordinateCollaborativeBuild(buildRequest, workerCount, sessionId = null) {
        console.log(`Starting collaborative build: "${buildRequest}" with ${workerCount} workers`);
        
        if (!sessionId) {
            sessionId = `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // Get available workers or spawn new ones
        const availableWorkers = Array.from(this.workers.entries())
            .filter(([name, worker]) => worker.status === 'ready')
            .map(([name, worker]) => ({ name, port: worker.port }));
        
        let assignedWorkers = [];
        
        if (availableWorkers.length >= workerCount) {
            // Use existing workers
            assignedWorkers = availableWorkers.slice(0, workerCount);
            console.log(`Using ${workerCount} existing workers`);
        } else {
            // Spawn additional workers
            const leaderName = this.leaderAgent.name || 'Leader';
            const neededWorkers = workerCount - availableWorkers.length;
            console.log(`Spawning ${neededWorkers} additional workers`);
            
            const newWorkers = await this.spawnWorkers(neededWorkers, leaderName);
            assignedWorkers = [...availableWorkers, ...newWorkers];
        }
        
        // Create build session
        const buildSession = {
            sessionId,
            buildRequest,
            workers: assignedWorkers,
            tasks: [],
            status: 'planning',
            startTime: Date.now()
        };
        
        this.buildSessions.set(sessionId, buildSession);
        
        // Get leader bot position for coordination
        const leaderPosition = await this.getLeaderPosition();
        
        return {
            sessionId,
            workers: assignedWorkers,
            leaderPosition,
            status: 'workers_ready',
            message: `${assignedWorkers.length} workers ready for collaborative build: "${buildRequest}"`
        };
    }

    // Assign AI-generated tasks to workers
    async assignTasksToWorkers(sessionId, taskBreakdown) {
        console.log(`Assigning tasks for session ${sessionId}`);
        
        const buildSession = this.buildSessions.get(sessionId);
        if (!buildSession) {
            throw new Error(`Build session ${sessionId} not found`);
        }
        
        const tasks = Array.isArray(taskBreakdown) ? taskBreakdown : [taskBreakdown];
        const workers = buildSession.workers;
        
        if (tasks.length > workers.length) {
            console.warn(`More tasks (${tasks.length}) than workers (${workers.length}). Some workers will get multiple tasks.`);
        }
        
        // Get the current leader position for shared building coordinates
        const leaderPosition = await this.getLeaderPosition();
        
        // Check for conflicts with existing builds (optional MongoDB integration)
        const buildCoordinates = await this.checkAndReserveBuildLocation(leaderPosition, sessionId, buildSession.buildRequest);
        
        console.log(`Building at verified coordinates: ${buildCoordinates.x}, ${buildCoordinates.y}, ${buildCoordinates.z}`);
        
        const assignments = [];
        
        // FIXED: Ensure workers coordinate on the same structure
        console.log(`Coordinating ${workers.length} workers for: "${buildSession.buildRequest}"`);
        
        // First, teleport all workers to the build site for coordination
        await this.teleportWorkers(sessionId, buildCoordinates);
        
        // Wait a moment for workers to reach position
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            const worker = workers[i % workers.length]; // Round-robin assignment
            
            // Simple task assignment - let the external_api.js coordinate fix handle everything
            const coordinatedTask = `${task}

Build at your current position. You are worker ${i + 1} of ${tasks.length} working on: "${buildSession.buildRequest}"`;
            
            console.log(`🔧 Sending task to ${worker.name}: ${task.substring(0, 50)}...`);
            try {
                // Send coordinated task to worker
                const response = await fetch(`http://localhost:${worker.port}/api/agent/newAction`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: coordinatedTask })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    console.log(`✓ Coordinated task assigned to ${worker.name}: ${task.substring(0, 40)}...`);
                    
                    // Update worker status
                    const workerInfo = this.workers.get(worker.name);
                    if (workerInfo) {
                        workerInfo.status = 'working';
                        workerInfo.currentTask = task;
                        workerInfo.buildCoordinates = buildCoordinates;
                    }
                    
                    // Safely extract message from response
                    let responseMessage = 'Task assigned successfully';
                    if (result && typeof result === 'object') {
                        responseMessage = result.message || result.error || JSON.stringify(result);
                    } else if (typeof result === 'string') {
                        responseMessage = result;
                    }
                    
                    assignments.push({
                        worker: worker.name,
                        task: task,
                        coordinatedTask: coordinatedTask.substring(0, 200) + '...',
                        buildCoordinates: buildCoordinates,
                        status: 'assigned',
                        result: responseMessage,
                        prompt_modified: result?.prompt_modified || false,
                        original_prompt: result?.original_prompt || coordinatedTask,
                        modified_prompt: result?.modified_prompt || coordinatedTask
                    });
                } else {
                    console.error(`Failed to assign task to ${worker.name}:`, await response.text());
                    assignments.push({
                        worker: worker.name,
                        task,
                        status: 'failed',
                        error: 'API call failed'
                    });
                }
                
                // Small delay between assignments to avoid overwhelming workers
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.error(`Error assigning task to ${worker.name}:`, error);
                assignments.push({
                    worker: worker.name,
                    task,
                    status: 'failed',
                    error: error.message
                });
            }
        }
        
        // Update build session
        buildSession.tasks = assignments;
        buildSession.status = 'executing';
        
        return assignments;
    }

    // Get status of all workers and current build sessions
    getStatus() {
        const workers = Array.from(this.workers.entries()).map(([name, worker]) => ({
            name,
            port: worker.port,
            status: worker.status,
            currentTask: worker.currentTask ? worker.currentTask.substring(0, 100) + '...' : null,
            uptime: Date.now() - worker.spawnTime
        }));
        
        const buildSessions = Array.from(this.buildSessions.entries()).map(([id, session]) => ({
            sessionId: id,
            buildRequest: session.buildRequest,
            workers: session.workers.length,
            tasks: session.tasks.length,
            status: session.status,
            runtime: Date.now() - session.startTime
        }));
        
        return {
            totalWorkers: this.workers.size,
            workers,
            activeBuildSessions: this.buildSessions.size,
            buildSessions,
            nextPort: this.nextWorkerPort
        };
    }

    // Get leader bot position
    async getLeaderPosition() {
        try {
            if (this.leaderAgent.bot && this.leaderAgent.bot.entity) {
                const pos = this.leaderAgent.bot.entity.position;
                return {
                    x: Math.floor(pos.x),
                    y: Math.floor(pos.y), 
                    z: Math.floor(pos.z)
                };
            }
        } catch (error) {
            console.error('Error getting leader position:', error);
        }
        
        return { x: 0, y: 64, z: 0 }; // Default position
    }

    // Teleport workers to build location
    async teleportWorkers(sessionId, position) {
        const buildSession = this.buildSessions.get(sessionId);
        if (!buildSession) {
            throw new Error(`Build session ${sessionId} not found`);
        }
        
        const results = [];
        
        // FIXED: All workers go to the SAME position for coordination
        // Instead of random spreading, use a tight formation around the build site
        for (let i = 0; i < buildSession.workers.length; i++) {
            const worker = buildSession.workers[i];
            try {
                // Tight formation: workers positioned in a small circle around the build site
                const angle = (i / buildSession.workers.length) * 2 * Math.PI;
                const radius = Math.min(3, buildSession.workers.length); // Max 3 block radius
                
                const targetPos = {
                    x: Math.floor(position.x + Math.cos(angle) * radius),
                    y: position.y,
                    z: Math.floor(position.z + Math.sin(angle) * radius)
                };
                
                const response = await fetch(`http://localhost:${worker.port}/api/agent/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(targetPos)
                });
                
                if (response.ok) {
                    results.push({ 
                        worker: worker.name, 
                        status: 'teleported',
                        position: targetPos
                    });
                    console.log(`${worker.name} teleported to coordinated position: ${targetPos.x}, ${targetPos.y}, ${targetPos.z}`);
                } else {
                    results.push({ worker: worker.name, status: 'failed' });
                }
                
            } catch (error) {
                console.error(`Failed to teleport ${worker.name}:`, error);
                results.push({ worker: worker.name, status: 'error', error: error.message });
            }
        }
        
        return results;
    }

    // Stop all workers
    async stopAllWorkers() {
        console.log(`Stopping ${this.workers.size} workers...`);
        
        for (const [name, worker] of this.workers) {
            try {
                worker.process.stop();
                console.log(`Stopped worker ${name}`);
            } catch (error) {
                console.error(`Error stopping worker ${name}:`, error);
            }
        }
        
        this.workers.clear();
        this.buildSessions.clear();
        this.nextWorkerPort = settings.multibot_base_port + 2;
        
        return { message: 'All workers stopped', stopped: true };
    }

    // Check for build location conflicts and reserve new location if needed
    async checkAndReserveBuildLocation(preferredLocation, sessionId, buildRequest) {
        try {
            // For collaborative builds, we want workers to build together at the SAME location
            // Only check for conflicts with other build sessions, not within the same session
            
            const minDistance = 30; // Reduced distance for better coordination
            let buildLocation = { ...preferredLocation };
            
            // Simple conflict detection - only with OTHER sessions
            const existingBuilds = this.getExistingBuildLocations().filter(
                build => build.sessionId !== sessionId // Exclude current session
            );
            
            // Check if location conflicts with OTHER builds
            let attempts = 0;
            while (attempts < 5) { // Reduced attempts for faster coordination
                const hasConflict = existingBuilds.some(build => {
                    const distance = Math.sqrt(
                        Math.pow(buildLocation.x - build.x, 2) + 
                        Math.pow(buildLocation.z - build.z, 2)
                    );
                    return distance < minDistance;
                });
                
                if (!hasConflict) {
                    break;
                }
                
                // Move to a new location if conflict found with OTHER builds
                const angle = (attempts * 72) * (Math.PI / 180); // 72 degrees for 5 attempts
                buildLocation = {
                    x: Math.floor(preferredLocation.x + Math.cos(angle) * minDistance),
                    y: preferredLocation.y,
                    z: Math.floor(preferredLocation.z + Math.sin(angle) * minDistance)
                };
                attempts++;
            }
            
            // Reserve this location for the current session
            this.reserveBuildLocation(buildLocation, sessionId, buildRequest);
            
            console.log(`✓ Coordinated build location confirmed: x=${buildLocation.x}, y=${buildLocation.y}, z=${buildLocation.z} for session ${sessionId}`);
            return buildLocation;
            
        } catch (error) {
            console.error('Error checking build location:', error);
            return preferredLocation; // Fallback to preferred location
        }
    }
    
    // Get existing build locations (can be enhanced with MongoDB)
    getExistingBuildLocations() {
        // Simple in-memory storage for now
        if (!global.multibotBuildLocations) {
            global.multibotBuildLocations = [];
        }
        return global.multibotBuildLocations;
    }
    
    // Reserve a build location
    reserveBuildLocation(location, sessionId, buildRequest) {
        if (!global.multibotBuildLocations) {
            global.multibotBuildLocations = [];
        }
        
        global.multibotBuildLocations.push({
            x: location.x,
            y: location.y,
            z: location.z,
            sessionId: sessionId,
            buildRequest: buildRequest.substring(0, 100),
            timestamp: Date.now(),
            status: 'reserved'
        });
        
        console.log(`Location reserved for session ${sessionId}: x=${location.x}, z=${location.z}`);
    }
    
    // Clean up finished sessions
    cleanupFinishedSessions() {
        const currentTime = Date.now();
        const maxSessionAge = 3600000; // 1 hour
        
        for (const [sessionId, session] of this.buildSessions) {
            if (currentTime - session.startTime > maxSessionAge) {
                console.log(`Cleaning up old build session: ${sessionId}`);
                this.buildSessions.delete(sessionId);
            }
        }
        
        // Also clean up old location reservations
        if (global.multibotBuildLocations) {
            global.multibotBuildLocations = global.multibotBuildLocations.filter(
                location => currentTime - location.timestamp < maxSessionAge
            );
        }
    }

    // NEW: Coordinate worker synchronization for better collaboration
    async synchronizeWorkers(sessionId) {
        const buildSession = this.buildSessions.get(sessionId);
        if (!buildSession) {
            throw new Error(`Build session ${sessionId} not found`);
        }

        console.log(`🔄 Synchronizing ${buildSession.workers.length} workers for coordinated build...`);
        
        const syncResults = [];
        
        // Step 1: Stop any current actions to synchronize
        for (const worker of buildSession.workers) {
            try {
                const response = await fetch(`http://localhost:${worker.port}/api/agent/endGoal`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                
                if (response.ok) {
                    syncResults.push({ worker: worker.name, sync: 'ready' });
                } else {
                    syncResults.push({ worker: worker.name, sync: 'failed' });
                }
            } catch (error) {
                console.error(`Failed to sync ${worker.name}:`, error);
                syncResults.push({ worker: worker.name, sync: 'error' });
            }
        }

        // Step 2: Brief pause for synchronization
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log(`✓ Worker synchronization completed for session ${sessionId}`);
        return syncResults;
    }

    // NEW: Monitor build progress and coordinate workers
    async monitorBuildProgress(sessionId) {
        const buildSession = this.buildSessions.get(sessionId);
        if (!buildSession) return;

        // This could be enhanced to actually check block placements and coordinate
        console.log(`📊 Monitoring build progress for session ${sessionId}...`);
        
        // Update worker statuses
        for (const worker of buildSession.workers) {
            const workerInfo = this.workers.get(worker.name);
            if (workerInfo && workerInfo.status === 'working') {
                console.log(`  - ${worker.name}: Building ${workerInfo.currentTask?.substring(0, 30)}...`);
            }
        }
    }
}