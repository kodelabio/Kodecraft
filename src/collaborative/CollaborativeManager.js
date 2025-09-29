import { EventEmitter } from 'events';

export class CollaborativeManager extends EventEmitter {
    constructor(kodecraftManager, agentHandler) {
        super();
        this.kodecraftManager = kodecraftManager;
        this.agentHandler = agentHandler;
        this.workerBots = new Map(); // Map of worker bot names to their info
        this.workerCount = 0;
        this.activeTasks = new Map(); // Map of task IDs to task info
        this.taskIdCounter = 0;
        
        console.log('CollaborativeManager initialized');
    }

    /**
     * Spawn multiple worker bots based on the main Kid bot settings
     * @param {number} count - Number of workers to spawn (1-10)
     * @param {Object} baseSettings - Base settings from Kid bot
     * @returns {Array} Array of spawned worker bot info
     */
    spawnWorkerBots(count, baseSettings) {
        const spawnedBots = [];
        
        if (!baseSettings) {
            console.error('No base settings provided for worker bots');
            return spawnedBots;
        }
        
        for (let i = 0; i < count; i++) {
            const workerId = ++this.workerCount;
            const workerName = `Worker${workerId}`;
            
            // Clone the base settings and modify for worker bot
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
                        id: workerId,
                        agent: workerAgent,
                        settings: workerSettings,
                        status: 'spawned',
                        currentTask: null
                    };
                    
                    this.workerBots.set(workerName, workerInfo);
                    spawnedBots.push(workerInfo);
                    
                    // Register with control panel
                    this.kodecraftManager.controlPanel.registerAgent(workerAgent);
                    
                    console.log(`Worker bot '${workerName}' spawned successfully`);
                    this.emit('workerSpawned', workerInfo);
                } else {
                    console.error(`Failed to create worker bot '${workerName}'`);
                }
            } catch (error) {
                console.error(`Error spawning worker bot '${workerName}':`, error);
            }
        }
        
        return spawnedBots;
    }

    /**
     * Get list of all worker bots
     * @returns {Array} Array of worker bot info
     */
    getWorkerBots() {
        return Array.from(this.workerBots.values());
    }

    /**
     * Get a specific worker bot by name
     * @param {string} workerName - Name of the worker bot
     * @returns {Object|null} Worker bot info or null if not found
     */
    getWorkerBot(workerName) {
        return this.workerBots.get(workerName);
    }

    /**
     * Start a collaborative wall building task
     * @param {Array} workers - Array of worker bot names
     * @param {Object} wallSpec - Wall specification with start, end coordinates and material
     * @returns {string} Task ID
     */
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

    /**
     * Split wall building work between workers
     * @param {Array} workers - Array of worker names
     * @param {Object} wallSpec - Wall specification
     * @returns {Array} Array of work assignments
     */
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

    /**
     * Assign a wall section to a specific worker
     * @param {Object} worker - Worker bot info
     * @param {Object} assignment - Work assignment
     */
    _assignWallSection(worker, assignment) {
        const { section } = assignment;
        const commands = this._generateWallCommands(section);
        
        console.log(`Assigning wall section to ${worker.name}:`, section);
        
        // Send commands to the worker bot
        // This is a simplified approach - in practice, you might want to use the bot's command system
        if (worker.agent.process && worker.agent.process.process) {
            const message = `Build wall section from (${section.start.x},${section.start.y},${section.start.z}) to (${section.end.x},${section.end.y},${section.end.z}) using ${section.material}`;
            
            // Send message to worker bot (this will be processed by the bot's message handler)
            setTimeout(() => {
                this._sendMessageToWorker(worker.name, message);
            }, 1000); // Small delay to ensure bot is ready
        }
    }

    /**
     * Generate building commands for a wall section
     * @param {Object} section - Wall section specification
     * @returns {Array} Array of building commands
     */
    _generateWallCommands(section) {
        const commands = [];
        const { start, end, material } = section;
        
        // Generate fill command for the section
        commands.push(`!fill(${start.x}, ${start.y}, ${start.z}, ${end.x}, ${end.y}, ${end.z}, "${material}")`);
        
        return commands;
    }

    /**
     * Send a message to a specific worker bot
     * @param {string} workerName - Name of the worker bot
     * @param {string} message - Message to send
     */
    _sendMessageToWorker(workerName, message) {
        const controlPanel = this.kodecraftManager.controlPanel;
        if (controlPanel && controlPanel.agentConnections[workerName]) {
            const conn = controlPanel.agentConnections[workerName];
            if (conn.socket) {
                conn.socket.emit('send-message', workerName, message);
                console.log(`Sent message to ${workerName}: ${message}`);
            } else {
                console.warn(`Worker ${workerName} not connected to control panel`);
            }
        }
    }

    /**
     * Public method to send message to worker (for Kid coordination)
     * @param {string} workerName - Name of the worker bot
     * @param {string} message - Message to send
     */
    sendMessageToWorker(workerName, message) {
        // Validate worker is ready before sending task
        if (!this.isWorkerReady(workerName)) {
            console.warn(`[Worker Validation] ${workerName} not ready for message. Connection status: ${!!this.kodecraftManager?.controlPanel?.agentConnections?.[workerName]}`);
            return false;
        }
        
        console.log(`[Kid Coordination] Sending task to ${workerName}: ${message} (validated ready)`);
        this._sendMessageToWorker(workerName, message);
        return true;
    }

    /**
     * Create improved building task that handles foundation blocks
     * @param {string} workerName - Name of the worker bot  
     * @param {Object} section - Wall section with start, end coordinates
     * @param {string} material - Block material to use
     */
    sendImprovedBuildTask(workerName, section, material = 'cobblestone') {
        // Validate worker is ready before sending task
        if (!this.isWorkerReady(workerName)) {
            console.warn(`[Worker Validation] ${workerName} not ready for task assignment. Skipping.`);
            return false;
        }
        
        const { start, end } = section;
        
        // Create a task that builds foundation first, then upper layers
        const buildTask = `Build wall section from (${start.x},${start.y},${start.z}) to (${end.x},${end.y},${end.z}) using ${material}. Build foundation layer first (y=${start.y}), then upper layers. If a block fails to place due to "nothing to place on", place a support block below it first.`;
        
        console.log(`[Improved Building] Sending enhanced task to ${workerName} (validated ready)`);
        this._sendMessageToWorker(workerName, buildTask);
        return true;
    }

    /**
     * Teleport workers to a specific location (near the main bot)
     * @param {Array} workerNames - Names of workers to teleport
     * @param {Object} location - Target location {x, y, z}
     */
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

    /**
     * Check if a worker is fully ready (connected, logged in, and spawned)
     * @param {string} workerName - Name of worker to check
     * @returns {boolean} True if worker is ready
     */
    isWorkerReady(workerName) {
        const controlPanel = this.kodecraftManager.controlPanel;
        if (!controlPanel || !controlPanel.agentConnections[workerName]) {
            return false;
        }
        
        const conn = controlPanel.agentConnections[workerName];
        // Worker is ready if it has a socket connection and is marked as in_game
        return conn.socket && conn.in_game;
    }

    /**
     * Wait for workers to be ready, then teleport them
     * @param {Array} workerNames - Names of workers to teleport
     * @param {Object} location - Target location {x, y, z}
     * @param {number} maxWaitTime - Maximum time to wait in milliseconds (default 30s)
     */
    teleportWorkersToLocationWithRetry(workerNames, location, maxWaitTime = 30000) {
        console.log(`Waiting for ${workerNames.length} workers to be ready, then teleporting to:`, location);
        
        const startTime = Date.now();
        const checkInterval = 1000; // Check every second
        
        const teleportedWorkers = new Set(); // Track already teleported workers
        
        const waitAndTeleport = () => {
            const currentTime = Date.now();
            const elapsedTime = currentTime - startTime;
            
            // Check which workers are ready
            const readyWorkers = workerNames.filter(name => this.isWorkerReady(name));
            const notReadyWorkers = workerNames.filter(name => !this.isWorkerReady(name));
            
            console.log(`Status check (${Math.floor(elapsedTime/1000)}s): Ready: ${readyWorkers.length}/${workerNames.length} [${readyWorkers.join(', ')}]`);
            
            if (notReadyWorkers.length > 0) {
                console.log(`Still waiting for: ${notReadyWorkers.join(', ')}`);
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
                console.log(`Timeout reached. ${notReadyWorkers.length} workers never became ready: ${notReadyWorkers.join(', ')}`);
            } else {
                console.log(`All workers are ready and teleported!`);
            }
        };
        
        // Start checking immediately
        waitAndTeleport();
    }
    
    /**
     * Teleport only the ready workers immediately
     * @param {Array} readyWorkerNames - Names of ready workers
     * @param {Object} location - Target location
     */
    teleportReadyWorkers(readyWorkerNames, location) {
        readyWorkerNames.forEach((workerName, index) => {
            const offsetX = (index - Math.floor(readyWorkerNames.length / 2)) * 2;
            const targetX = Math.floor(location.x + offsetX);
            const targetY = Math.floor(location.y);
            const targetZ = Math.floor(location.z + 1);
            
            const teleportCommand = `!goToCoordinates(${targetX}, ${targetY}, ${targetZ}, 1)`;
            console.log(`Teleporting ready worker ${workerName}: ${teleportCommand}`);
            
            // Send teleport command immediately (worker is ready)
            setTimeout(() => {
                this._sendMessageToWorker(workerName, teleportCommand);
            }, index * 200); // Small stagger to prevent conflicts
        });
    }

    /**
     * Stop all worker bots
     */
    stopAllWorkers() {
        console.log('Stopping all worker bots');
        
        for (const [workerName, workerInfo] of this.workerBots) {
            try {
                this.agentHandler.stopAgent(workerName);
                workerInfo.status = 'stopped';
                console.log(`Stopped worker bot: ${workerName}`);
            } catch (error) {
                console.error(`Error stopping worker bot ${workerName}:`, error);
            }
        }
        
        // Clear worker bots map
        this.workerBots.clear();
        this.workerCount = 0;
        
        this.emit('allWorkersStopped');
    }

    /**
     * Get status of all workers
     * @returns {Object} Status summary
     */
    getStatus() {
        const workers = Array.from(this.workerBots.values()).map(worker => ({
            name: worker.name,
            status: worker.status,
            currentTask: worker.currentTask
        }));
        
        const tasks = Array.from(this.activeTasks.values()).map(task => ({
            id: task.id,
            type: task.type,
            status: task.status,
            workers: task.workers
        }));
        
        return {
            totalWorkers: this.workerBots.size,
            workers,
            activeTasks: tasks.length,
            tasks
        };
    }
}