import { EventEmitter } from 'events';

export class CollaborativeManager extends EventEmitter {
    constructor(kodecraftManager, agentHandler) {
        super();
        this.kodecraftManager = kodecraftManager;
        this.agentHandler = agentHandler;
        this.workerBots = new Map(); // Map of worker bot names to their info
        this.leaderWorkerPools = new Map(); // Map of leader bot names to their worker pools
        this.globalWorkerCount = 0; // Global counter for unique worker IDs
        this.activeTasks = new Map(); // Map of task IDs to task info
        this.taskIdCounter = 0;
        
        console.log('CollaborativeManager initialized');
    }

    spawnWorkerBots(count, baseSettings, leaderName = 'DefaultLeader') {
        const spawnedBots = [];
        
        if (!baseSettings) {
            console.error('No base settings provided for worker bots');
            return spawnedBots;
        }
        
        if (!this.leaderWorkerPools.has(leaderName)) {
            this.leaderWorkerPools.set(leaderName, []);
        }
        
        const leaderWorkers = this.leaderWorkerPools.get(leaderName) || [];
        
        console.log(`Attempting to spawn ${count} workers for leader '${leaderName}'. Current pool size: ${leaderWorkers.length}`);
        console.log(`Global stats: ${this.workerBots.size} total workers across all leaders`);
        
        if (this.workerBots.size + count > 15) {
            console.warn(`WARNING: Attempting to create ${this.workerBots.size + count} total bots. Minecraft servers typically limit players to 20. Check your server.properties max-players setting if bots fail to join.`);
        }
        
        for (let i = 0; i < count; i++) {
            const globalWorkerId = ++this.globalWorkerCount;
            const localWorkerId = this.getLeaderWorkerCount(leaderName) + 1;
            const workerName = `${leaderName}Worker${localWorkerId}`;
            
            console.log(`Creating worker ${i+1}/${count}: '${workerName}' (Global: ${globalWorkerId}, Local: ${localWorkerId})`);
            
            const workerSettings = JSON.parse(JSON.stringify(baseSettings));
            
            if (!workerSettings.profile) {
                workerSettings.profile = { name: workerName };
            } else {
                workerSettings.profile.name = workerName;
            }
            
            try {
                const workerAgent = this.agentHandler.createAgent(workerSettings);
                
                if (workerAgent) {
                    const workerInfo = {
                        name: workerName,
                        id: globalWorkerId,
                        localId: localWorkerId,
                        leader: leaderName,
                        agent: workerAgent,
                        settings: workerSettings,
                        status: 'spawned',
                        currentTask: null
                    };
                    
                    this.workerBots.set(workerName, workerInfo);
                    leaderWorkers.push(workerInfo);
                    this.leaderWorkerPools.set(leaderName, leaderWorkers);
                    spawnedBots.push(workerInfo);
                    
                    this.kodecraftManager.controlPanel.registerAgent(workerAgent);
                    
                    console.log(`Worker bot '${workerName}' spawned for leader '${leaderName}' (Global ID: ${globalWorkerId}, Local ID: ${localWorkerId})`);
                    this.emit('workerSpawned', workerInfo);
                } else {
                    console.error(`Failed to create worker bot '${workerName}' for leader '${leaderName}'`);
                }
            } catch (error) {
                console.error(`Error spawning worker bot '${workerName}' for leader '${leaderName}':`, error);
            }
        }
        
        console.log(`Spawn complete for '${leaderName}': ${spawnedBots.length}/${count} workers created successfully`);
        return spawnedBots;
    }

    // Legacy spawn method - now calls enhanced version
    spawnWorkerBotsLegacy(count, baseSettings, leaderName = 'DefaultLeader') {
        const spawnedBots = [];
        
        if (!baseSettings) {
            console.error('No base settings provided for worker bots');
            return spawnedBots;
        }
        
        // Initialize leader's worker pool if it doesn't exist
        if (!this.leaderWorkerPools.has(leaderName)) {
            this.leaderWorkerPools.set(leaderName, []);
        }
        
        const leaderWorkers = this.leaderWorkerPools.get(leaderName) || [];
        
        console.log(`Attempting to spawn ${count} workers for leader '${leaderName}'. Current pool size: ${leaderWorkers.length}`);
        console.log(`Global stats: ${this.workerBots.size} total workers across all leaders`);
        
        if (this.workerBots.size + count > 15) {
            console.warn(`WARNING: Attempting to create ${this.workerBots.size + count} total bots. Minecraft servers typically limit players to 20. Check your server.properties max-players setting if bots fail to join.`);
        }
        
        for (let i = 0; i < count; i++) {
            const globalWorkerId = ++this.globalWorkerCount;
            const localWorkerId = this.getLeaderWorkerCount(leaderName) + 1;
            // Create unique worker names with leader prefix to avoid conflicts
            const workerName = `${leaderName}Worker${localWorkerId}`;
            
            console.log(`Creating worker ${i+1}/${count}: '${workerName}' (Global: ${globalWorkerId}, Local: ${localWorkerId})`);
            
            const workerSettings = JSON.parse(JSON.stringify(baseSettings));
            
            // Ensure profile exists and set worker name
            if (!workerSettings.profile) {
                workerSettings.profile = { name: workerName };
            } else {
                workerSettings.profile.name = workerName;
            }
            
            try {
                // Create the worker agent
                const workerAgent = this.agentHandler.createAgent(workerSettings);
                
                if (workerAgent) {
                    const workerInfo = {
                        name: workerName,
                        id: globalWorkerId,
                        localId: localWorkerId,
                        leader: leaderName,
                        agent: workerAgent,
                        settings: workerSettings,
                        status: 'spawned',
                        currentTask: null
                    };
                    
                    // Add to both global map and leader's pool
                    this.workerBots.set(workerName, workerInfo);
                    leaderPool.workers.set(workerName, workerInfo);
                    spawnedBots.push(workerInfo);
                    
                    // Register with control panel
                    this.kodecraftManager.controlPanel.registerAgent(workerAgent);
                    
                    console.log(`Worker bot '${workerName}' spawned for leader '${leaderName}' (Global ID: ${globalWorkerId}, Local ID: ${localWorkerId})`);
                    this.emit('workerSpawned', workerInfo);
                } else {
                    console.error(`Failed to create worker bot '${workerName}' for leader '${leaderName}'`);
                }
            } catch (error) {
                console.error(`Error spawning worker bot '${workerName}' for leader '${leaderName}':`, error);
            }
        }
        
        console.log(`Spawn complete for '${leaderName}': ${spawnedBots.length}/${count} workers created successfully`);
        return spawnedBots;
    }

    getWorkerBots(leaderName = null) {
        if (leaderName) {
            const leaderPool = this.leaderWorkerPools.get(leaderName);
            return leaderPool ? Array.from(leaderPool.workers.values()) : [];
        }
        return Array.from(this.workerBots.values());
    }
    
    getWorkerBot(workerName) {
        return this.workerBots.get(workerName);
    }
    
    getLeaderWorkers(leaderName) {
        const leaderWorkers = this.leaderWorkerPools.get(leaderName) || [];
        return leaderWorkers;
    }

    getLeaderWorkerCount(leaderName) {
        const leaderWorkers = this.leaderWorkerPools.get(leaderName) || [];
        return leaderWorkers.length;
    }

    startCollaborativeWallTask(workers, wallSpec) {
        const taskId = `wall_task_${++this.taskIdCounter}`;
        
        const task = {
            id: taskId,
            type: 'collaborative_wall',
            workers: workers,
            spec: wallSpec,
            status: 'starting',
            assignments: this._splitWallWork(workers, wallSpec)
        };
        
        this.activeTasks.set(taskId, task);
        
        // Assign work to each worker
        task.assignments.forEach((assignment, index) => {
            const workerName = workers[index];
            const worker = this.getWorkerBot(workerName);
            if (worker) {
                worker.currentTask = taskId;
                worker.status = 'building';
                this._assignWallSection(worker, assignment);
            }
        });
        
        console.log(`Started collaborative wall task '${taskId}' with ${workers.length} workers`);
        this.emit('taskStarted', task);
        
        return taskId;
    }

    _splitWallWork(workers, wallSpec) {
        const { start, end, height = 3, material = 'stone' } = wallSpec;
        const assignments = [];
        
        // Calculate wall dimensions
        const totalLength = Math.abs(end.x - start.x) + Math.abs(end.z - start.z);
        const sectionsPerWorker = Math.ceil(totalLength / workers.length);
        
        // Split along the X axis for simplicity (can be enhanced later)
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        
        for (let i = 0; i < workers.length; i++) {
            const sectionStart = i * sectionsPerWorker;
            const sectionEnd = Math.min((i + 1) * sectionsPerWorker - 1, totalLength - 1);
            
            // Calculate actual coordinates for this section
            const sectionStartX = start.x + Math.round((dx * sectionStart) / totalLength);
            const sectionStartZ = start.z + Math.round((dz * sectionStart) / totalLength);
            const sectionEndX = start.x + Math.round((dx * sectionEnd) / totalLength);
            const sectionEndZ = start.z + Math.round((dz * sectionEnd) / totalLength);
            
            assignments.push({
                worker: workers[i],
                section: {
                    start: { x: sectionStartX, y: start.y, z: sectionStartZ },
                    end: { x: sectionEndX, y: start.y + height - 1, z: sectionEndZ },
                    material: material
                }
            });
        }
        
        return assignments;
    }

    _assignWallSection(worker, assignment) {
        const { section } = assignment;
        const commands = this._generateWallCommands(section);
        
        console.log(`Assigning wall section to ${worker.name}:`, section);
        
        // Send commands to the worker bot
        if (worker.agent.process && worker.agent.process.process) {
            const message = `Build wall section from (${section.start.x},${section.start.y},${section.start.z}) to (${section.end.x},${section.end.y},${section.end.z}) using ${section.material}`;
            
            setTimeout(() => {
                this._sendMessageToWorker(worker.name, message);
            }, 1000); // Small delay to ensure bot is ready
        }
    }
    _generateWallCommands(section) {
        const commands = [];
        const { start, end, material } = section;
        
        // Generate fill command for the section
        commands.push(`!fill(${start.x}, ${start.y}, ${start.z}, ${end.x}, ${end.y}, ${end.z}, "${material}")`);
        
        return commands;
    }
    _sendMessageToWorker(workerName, message, leaderName = null) {
        const workerInfo = this.workerBots.get(workerName);
        if (workerInfo && leaderName && workerInfo.leader !== leaderName) {
            console.warn(`[Access Control] Leader '${leaderName}' cannot send message to worker '${workerName}' owned by '${workerInfo.leader}'`);
            return false;
        }
        
        const controlPanel = this.kodecraftManager.controlPanel;
        if (!controlPanel || !controlPanel.agentConnections[workerName]) {
            console.warn(`[Connection] No connection found for worker '${workerName}'`);
            return false;
        }
        
        const conn = controlPanel.agentConnections[workerName];
        if (!conn.socket) {
            console.warn(`[Socket] No socket connection for worker '${workerName}'`);
            return false;
        }
        
        if (!conn.in_game) {
            console.warn(`[Game State] Worker '${workerName}' not in game yet`);
            return false;
        }
        
        try {
            conn.socket.emit('send-message', workerName, message);
            console.log(`[Message] Successfully sent to '${workerName}': ${message.substring(0, 50)}...`);
            return true;
        } catch (error) {
            console.error(`[Send Error] Failed to send message to '${workerName}':`, error.message);
            return false;
        }
    }


    sendMessageToWorker(workerName, message, leaderName = null) {
        if (!this.isWorkerReady(workerName)) {
            const workerInfo = this.workerBots.get(workerName);
            const connectionExists = !!this.kodecraftManager?.controlPanel?.agentConnections?.[workerName];
            const inGame = connectionExists && this.kodecraftManager.controlPanel.agentConnections[workerName].in_game;
            
            console.warn(`[Worker Validation] ${workerName} not ready for message. Leader: ${workerInfo?.leader || 'unknown'}, Connection: ${connectionExists}, InGame: ${inGame}`);
            return false;
        }
        
        return this._sendMessageToWorker(workerName, message, leaderName);
    }

    sendImprovedBuildTask(workerName, section, material = 'cobblestone') {
        // Validate worker is ready before sending task
        if (!this.isWorkerReady(workerName)) {
            return false;
        }
        
        const { start, end } = section;
        
        // Create a task that builds foundation first, then upper layers
        const buildTask = `Build wall section from (${start.x},${start.y},${start.z}) to (${end.x},${end.y},${end.z}) using ${material}. Build foundation layer first (y=${start.y}), then upper layers. If a block fails to place due to "nothing to place on", place a support block below it first. When finished, say "Task complete for ${workerName}".`;
        
        this._sendMessageToWorker(workerName, buildTask);

        // Set up completion timeout (2 minutes per task)
        setTimeout(() => {
            const worker = this.workerBots.get(workerName);
            if (worker && worker.currentTask) {
                this.markWorkerComplete(workerName, worker.currentTask);
            }
        }, 120000); // 2 minutes

        return true;
    }

    teleportWorkersToLocation(workerNames, location) {
        console.log(`Teleporting ${workerNames.length} workers to location:`, location);
        
        workerNames.forEach((workerName, index) => {
            const offsetX = (index - Math.floor(workerNames.length / 2)) * 2; // Spread workers 2 blocks apart
            const targetX = Math.floor(location.x + offsetX);
            const targetY = Math.floor(location.y);
            const targetZ = Math.floor(location.z + 1); // 1 block in front
            
            const teleportCommand = `!goToCoordinates(${targetX}, ${targetY}, ${targetZ}, 1)`;
            console.log(`Sending to ${workerName}: ${teleportCommand}`);
            
            // Send teleport command to worker
            setTimeout(() => {
                this._sendMessageToWorker(workerName, teleportCommand);
            }, index * 500); // Stagger the commands to avoid conflicts
        });
    }
    isWorkerReady(workerName) {
        const controlPanel = this.kodecraftManager.controlPanel;
        if (!controlPanel || !controlPanel.agentConnections[workerName]) {
            return false;
        }
        
        const conn = controlPanel.agentConnections[workerName];
        return conn.socket && conn.in_game;
    }

    async waitForWorkerReadiness(workerName, maxWaitTime = 15000) {
        const startTime = Date.now();
        const checkInterval = 500;
        
        return new Promise((resolve) => {
            const checkReadiness = () => {
                const elapsed = Date.now() - startTime;
                
                if (this.isWorkerReady(workerName)) {
                    console.log(`[Readiness] Worker '${workerName}' is ready after ${elapsed}ms`);
                    resolve(true);
                    return;
                }
                
                if (elapsed > maxWaitTime) {
                    console.warn(`[Timeout] Worker '${workerName}' not ready after ${elapsed}ms`);
                    resolve(false);
                    return;
                }
                
                setTimeout(checkReadiness, checkInterval);
            };
            
            checkReadiness();
        });
    }





    teleportWorkersToLocationWithRetry(workerNames, location, maxWaitTime = 30000) {
        const startTime = Date.now();
        const checkInterval = 2000; // Check every 2 seconds (reduced frequency)
        
        const teleportedWorkers = new Set(); // Track already teleported workers
        
        const waitAndTeleport = () => {
            const currentTime = Date.now();
            const elapsedTime = currentTime - startTime;
            
            // Check which workers are ready
            const readyWorkers = workerNames.filter(name => this.isWorkerReady(name));
            const notReadyWorkers = workerNames.filter(name => !this.isWorkerReady(name));
            
            // Only log every 10 seconds to reduce spam
            if (Math.floor(elapsedTime/1000) % 10 === 0) {
                console.log(`Workers ready: ${readyWorkers.length}/${workerNames.length}`);
            }
            
            // Teleport any workers that are ready and haven't been teleported yet
            const workersToTeleport = readyWorkers.filter(name => !teleportedWorkers.has(name));
            if (workersToTeleport.length > 0) {
                this.teleportReadyWorkers(workersToTeleport, location);
                workersToTeleport.forEach(name => teleportedWorkers.add(name));
            }
            
            // Continue waiting for remaining workers if we haven't exceeded max wait time
            if (notReadyWorkers.length > 0 && elapsedTime < maxWaitTime) {
                setTimeout(waitAndTeleport, checkInterval);
            } else if (notReadyWorkers.length > 0) {
                // Silently timeout - workers who aren't ready will be handled gracefully
            }
        };
        
        // Start checking immediately
        waitAndTeleport();
    }

    teleportReadyWorkers(readyWorkerNames, location) {
        readyWorkerNames.forEach((workerName, index) => {
            const offsetX = (index - Math.floor(readyWorkerNames.length / 2)) * 4; // Even more spacing
            const targetX = Math.floor(location.x + offsetX);
            const targetY = Math.floor(location.y + 1); // One block higher to avoid ground conflicts
            const targetZ = Math.floor(location.z + 3); // Further from build area
            
            // Use a more reliable teleportation approach
            const safeCommand = `Go to coordinates (${targetX}, ${targetY}, ${targetZ}) and wait there for further instructions. Move carefully and avoid obstacles.`;
            
            // Send command with longer delay for stability
            setTimeout(() => {
                this._sendMessageToWorker(workerName, safeCommand);
            }, index * 500); // Longer stagger for better stability
        });
    }
    stopAllWorkers(leaderName = null) {
        if (leaderName) {
            console.log(`Stopping worker bots for leader '${leaderName}'`);
            const leaderPool = this.leaderWorkerPools.get(leaderName);
            if (leaderPool) {
                for (const [workerName, workerInfo] of leaderPool.workers) {
                    try {
                        this.agentHandler.stopAgent(workerName);
                        workerInfo.status = 'stopped';
                        // Remove from global map as well
                        this.workerBots.delete(workerName);
                    } catch (error) {
                        console.error(`Error stopping worker ${workerName}:`, error);
                    }
                }
                leaderPool.workers.clear();
                leaderPool.workerCount = 0;
                this.emit('leaderWorkersStopped', leaderName);
            }
        } else {
            console.log('Stopping all worker bots');
            
            for (const [workerName, workerInfo] of this.workerBots) {
                try {
                    this.agentHandler.stopAgent(workerName);
                    workerInfo.status = 'stopped';
                } catch (error) {
                    console.error(`Error stopping worker ${workerName}:`, error);
                }
            }
            
            this.workerBots.clear();
            this.leaderWorkerPools.clear();
            this.globalWorkerCount = 0;
            this.emit('allWorkersStopped');
        }
    }


    getStatus(leaderName = null) {
        let workers;
        let totalWorkers;
        
        if (leaderName) {
            const leaderWorkers = this.getLeaderWorkers(leaderName);
            workers = leaderWorkers.map(worker => ({
                name: worker.name,
                status: worker.status,
                currentTask: worker.currentTask,
                leader: worker.leader
            }));
            totalWorkers = leaderWorkers.length;
        } else {
            workers = Array.from(this.workerBots.values()).map(worker => ({
                name: worker.name,
                status: worker.status,
                currentTask: worker.currentTask,
                leader: worker.leader || 'Unknown'
            }));
            totalWorkers = this.workerBots.size;
        }
        
        const tasks = Array.from(this.activeTasks.values()).map(task => ({
            id: task.id,
            type: task.type,
            status: task.status,
            workers: task.workers
        }));
        
        return {
            totalWorkers,
            workers,
            activeTasks: tasks.length,
            tasks,
            leaderName: leaderName || 'All'
        };
    }


    markWorkerComplete(workerName, taskId) {
        const worker = this.workerBots.get(workerName);
        if (!worker) return;

        worker.status = 'completed';
        worker.currentTask = null;

        // Check if this completes a collaborative task
        const task = this.activeTasks.get(taskId);
        if (task) {
            if (!task.completedWorkers) task.completedWorkers = new Set();
            task.completedWorkers.add(workerName);

            // Check if all workers for this task are complete
            if (task.completedWorkers.size >= task.workers.length) {
                task.status = 'completed';
                this.emit('taskCompleted', { id: taskId, type: task.type });
                
                // Log to control panel for external updates
                try {
                    this.kodecraftManager?.controlPanel?.recordEvent?.('buildComplete', {
                        taskId: taskId,
                        type: task.type,
                        totalWorkers: task.workers.length,
                        message: `Construction complete! All ${task.workers.length} workers have finished building the ${task.type}.`,
                        structure: task.type,
                        workersInvolved: task.workers
                    });
                } catch (e) { /* ignore */ }
                
                console.log(`[Collaborative] Build complete! Task ${taskId} (${task.type}) finished by all ${task.workers.length} workers`);
            }
        }
    }

    detectWorkerCompletion(workerName, message) {
        const worker = this.workerBots.get(workerName);
        if (!worker || !worker.currentTask) return;

        const lower = message.toLowerCase();
        
        // Check for errors that need repair
        const errorKeywords = [
            'error', 'failed', 'cannot', 'stuck', 'broke', 'broken',
            'vec3', 'undefined', 'null', 'exception'
        ];
        
        const hasError = errorKeywords.some(keyword => lower.includes(keyword));
        
        if (hasError) {
            console.log(`[Error Detection] ${workerName} encountered error: "${message}"`);
            this.retryWorkerTaskWithRepair(workerName, worker.currentTask);
            return;
        }
        
        // Look for completion keywords in worker messages
        const completionKeywords = [
            'complete', 'finished', 'done', 'built', 'construction finished',
            'task complete', 'build complete', 'structure complete',
            'wall complete', 'house complete', 'foundation finished'
        ];

        const isComplete = completionKeywords.some(keyword => lower.includes(keyword));
        
        if (isComplete) {
            console.log(`[Completion Detection] ${workerName} reported completion: "${message}"`);
            this.markWorkerComplete(workerName, worker.currentTask);
        }
    }

    retryWorkerTaskWithRepair(workerName, taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task) return;

        console.log(`[Repair Retry] Retrying ${workerName}'s task with enhanced repair logic`);
        
        // Enhanced instruction with explicit repair commands
        const repairInstruction = `REPAIR AND RETRY: ${task.instruction}

CRITICAL: If you encounter ANY errors:
1. Stop immediately
2. Check for broken blocks around your work area
3. Repair any missing stone, oak_planks, or glass blocks
4. Then continue with the original task
5. Use !repairAction instead of !newAction for all building

If you get Vec3 errors or undefined errors, use simple coordinate variables instead of complex objects.`;

        this.sendMessageToWorker(workerName, repairInstruction);
    }
}