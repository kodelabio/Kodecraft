class HierarchicalBotManager {
    constructor(agentHandler = null, agentConnections = {}) {
        this.managedWorkers = new Map();
        this.taskAssignments = new Map();
        this.taskCounter = 0;
        
        // Store references for compatibility
        this.agentHandler = agentHandler;
        this.agentConnections = agentConnections;
    }

    analyzeTask(taskDescription) {
        const task = taskDescription.toLowerCase();

        const buildingKeywords = ['build', 'construct', 'create', 'make', 'house', 'wall', 'tower', 'structure', 'place'];
        const miningKeywords = ['mine', 'dig', 'excavate', 'tunnel', 'cave', 'ore', 'diamond', 'coal'];
        const farmingKeywords = ['farm', 'plant', 'grow', 'harvest', 'crop', 'wheat', 'carrot', 'potato'];
        const gatheringKeywords = ['gather', 'collect', 'get', 'find', 'wood', 'stone', 'resource'];
        const complexKeywords = ['large', 'big', 'huge', 'massive', 'complex', 'multiple', 'many', 'several'];

        let taskType = 'general';
        let needsWorkers = false;
        let complexity = 'simple';
        let explicitWorkerCount = null;

        // Check for explicit worker count requests
        const workerCountPatterns = [
            /(\d+)\s*bots?/,
            /(\d+)\s*workers?/,
            /(\d+)\s*agents?/,
            /spawn\s*(\d+)/,
            /assign\s*(\d+)/,
            /use\s*(\d+)/,
            /get\s*(\d+)/
        ];

        for (const pattern of workerCountPatterns) {
            const match = task.match(pattern);
            if (match) {
                const count = parseInt(match[1]);
                if (count >= 1 && count <= 10) { // Reasonable limits
                    explicitWorkerCount = count;
                    needsWorkers = true;
                    if (count > 1) {
                        complexity = 'complex'; // Multiple workers = complex task
                    }
                    console.log('[HierarchicalBot] Detected explicit worker count request: ' + count + ' workers');
                    break;
                }
            }
        }

        if (buildingKeywords.some(keyword => task.includes(keyword))) {
            taskType = 'building';
            needsWorkers = true;
        } else if (miningKeywords.some(keyword => task.includes(keyword))) {
            taskType = 'mining';
            needsWorkers = true;
        } else if (farmingKeywords.some(keyword => task.includes(keyword))) {
            taskType = 'farming';
            needsWorkers = true;
        } else if (gatheringKeywords.some(keyword => task.includes(keyword))) {
            taskType = 'gathering';
            needsWorkers = true;
        }

        if (complexKeywords.some(keyword => task.includes(keyword))) {
            complexity = 'complex';
            needsWorkers = true;
        }

        const simpleKeywords = ['say', 'tell', 'move', 'go', 'walk', 'run', 'jump', 'look'];
        if (simpleKeywords.some(keyword => task.includes(keyword)) && !explicitWorkerCount) {
            needsWorkers = false;
            complexity = 'simple';
        }

        return {
            taskType,
            complexity,
            needsWorkers,
            explicitWorkerCount,
            originalTask: taskDescription
        };
    }

    async delegateTask(leaderName, taskDescription) {
        try {
            console.log('[HierarchicalBot] ' + leaderName + ' analyzing task: "' + taskDescription + '"');

            // Check if this is a worker bot trying to delegate (prevent infinite loops)
            if (leaderName.includes('builder_') || leaderName.includes('miner_') ||
                leaderName.includes('farmer_') || leaderName.includes('gatherer_') ||
                leaderName.includes('worker_')) {
                console.log('[HierarchicalBot] Worker bot ' + leaderName + ' attempted to delegate - redirecting to direct execution');
                return {
                    success: false,
                    reason: 'worker_should_execute',
                    message: 'Worker bots should execute tasks directly, not delegate them. Use !newAction instead.'
                };
            }

            const analysis = this.analyzeTask(taskDescription);

            if (!analysis.needsWorkers) {
                console.log('[HierarchicalBot] Task can be handled by ' + leaderName + ' alone');
                return {
                    success: false,
                    reason: 'simple_task',
                    message: 'This task can be handled personally by ' + leaderName
                };
            }

            let availableWorkers = this.getAvailableWorkers(leaderName);

            if (availableWorkers.length === 0) {
                console.log('[HierarchicalBot] No worker bots available, spawning new ones for ' + leaderName);

                const spawnResult = await this.spawnWorkersForTask(leaderName, analysis);
                if (!spawnResult.success) {
                    return {
                        success: false,
                        reason: 'spawn_failed',
                        message: 'Failed to spawn worker bots: ' + spawnResult.error
                    };
                }

                // Wait for all spawned bots to connect
                console.log('[HierarchicalBot] Waiting for spawned bots to connect and initialize...');
                const botNames = spawnResult.workers;
                const allConnected = await this.waitForBotsConnection(botNames, 30000); // 30 second timeout

                if (!allConnected) {
                    return {
                        success: false,
                        reason: 'connection_timeout',
                        message: 'Some worker bots failed to connect in time'
                    };
                }

                // Give bots a moment to fully initialize after connection
                await new Promise(resolve => setTimeout(resolve, 2000));

                availableWorkers = this.getAvailableWorkers(leaderName);
                console.log('[HierarchicalBot] Found ' + availableWorkers.length + ' available workers after spawning');
            }

            const selectedWorkers = this.selectWorkersForTask(availableWorkers, analysis);
            
            if (selectedWorkers.length === 0) {
                console.log('[HierarchicalBot] No suitable workers found for task type: ' + analysis.taskType);
                return {
                    success: false,
                    reason: 'no_suitable_workers',
                    message: 'No suitable workers available for ' + analysis.taskType + ' tasks'
                };
            }

            const taskBreakdown = this.breakDownTask(analysis, selectedWorkers);
            
            // COORDINATION FIX: Assign tasks sequentially with coordination
            const assignments = [];
            
            // Phase 1: Assign lead worker first
            if (taskBreakdown.length > 0) {
                const leadAssignment = taskBreakdown[0];
                console.log('[HierarchicalBot] Assigning lead task to ' + leadAssignment.workerName);
                const leadResult = await this.assignTaskToWorker(leaderName, leadAssignment.workerName, leadAssignment.task);
                assignments.push(leadResult);
                
                // Wait for lead worker to start
                if (leadResult.success && taskBreakdown.length > 1) {
                    console.log('[HierarchicalBot] Waiting 3 seconds for lead worker to establish location...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
            
            // Phase 2: Assign follower workers with coordination commands
            for (let i = 1; i < taskBreakdown.length; i++) {
                const assignment = taskBreakdown[i];
                console.log('[HierarchicalBot] Assigning coordinated task to ' + assignment.workerName);
                
                // Add coordination command to follower tasks
                const coordinatedTask = `!newAction("First, go to ${taskBreakdown[0].workerName} to coordinate: !goToPlayer('${taskBreakdown[0].workerName}')"); ${assignment.task}`;
                
                const result = await this.assignTaskToWorker(leaderName, assignment.workerName, coordinatedTask);
                assignments.push(result);
                
                // Small delay between assignments
                if (i < taskBreakdown.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            const taskId = 'task_' + (++this.taskCounter);
            this.taskAssignments.set(taskId, {
                leaderName,
                taskDescription,
                analysis,
                workers: selectedWorkers.map(w => w.name),
                assignments,
                timestamp: Date.now()
            });

            if (!this.managedWorkers.has(leaderName)) {
                this.managedWorkers.set(leaderName, new Set());
            }
            selectedWorkers.forEach(worker => {
                this.managedWorkers.get(leaderName).add(worker.name);
            });

            return {
                success: true,
                taskId,
                message: 'Task delegated to ' + selectedWorkers.length + ' worker(s) with coordination',
                workersAssigned: selectedWorkers.map(w => w.name),
                taskBreakdown: taskBreakdown.map(t => ({ worker: t.workerName, task: t.task }))
            };

        } catch (error) {
            console.error('[HierarchicalBot] Error in delegateTask:', error);
            return {
                success: false,
                reason: 'error',
                message: 'Error delegating task: ' + error.message
            };
        }
    }

    async spawnWorkersForTask(leaderName, analysis) {
        try {
            const workersToSpawn = this.determineWorkersNeeded(analysis);
            const spawnResults = [];
            
            console.log('[HierarchicalBot] Spawning ' + workersToSpawn.length + ' workers for ' + leaderName + ': ' + workersToSpawn.map(w => w.name).join(', '));
            
            for (const workerSpec of workersToSpawn) {
                const spawnResult = await this.spawnWorkerBot(workerSpec.name, workerSpec.type, leaderName);
                spawnResults.push(spawnResult);
                
                if (spawnResult.success) {
                    console.log('[HierarchicalBot] Successfully spawned ' + workerSpec.name + ' (' + workerSpec.type + ')');
                } else {
                    console.log('[HierarchicalBot] Failed to spawn ' + workerSpec.name + ': ' + spawnResult.error);
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            const successfulSpawns = spawnResults.filter(r => r.success);
            
            return {
                success: successfulSpawns.length > 0,
                spawned: successfulSpawns.length,
                total: workersToSpawn.length,
                workers: successfulSpawns.map(r => r.botName),
                error: successfulSpawns.length === 0 ? 'No workers could be spawned' : null
            };
            
        } catch (error) {
            console.error('[HierarchicalBot] Error spawning workers:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    determineWorkersNeeded(analysis) {
        const workers = [];
        const timestamp = Date.now().toString().slice(-4);

        // Use explicit worker count if provided, otherwise determine based on complexity
        let workerCount = 1; // Default to 1 worker

        if (analysis.explicitWorkerCount) {
            // User explicitly requested a specific number of workers
            workerCount = analysis.explicitWorkerCount;
            console.log('[HierarchicalBot] Using explicit worker count: ' + workerCount);
        } else if (analysis.complexity === 'complex') {
            // Complex tasks need multiple workers
            if (analysis.taskType === 'building') {
                workerCount = 3; // Main builder, foundation specialist, decorator
            } else if (analysis.taskType === 'mining') {
                workerCount = 2; // Main miner, resource collector
            } else if (analysis.taskType === 'farming') {
                workerCount = 2; // Planter, harvester
            } else if (analysis.taskType === 'gathering') {
                workerCount = 2; // Primary gatherer, secondary gatherer
            } else {
                workerCount = 2; // General complex tasks get 2 workers
            }
        }

        // Check for specific keywords that indicate need for multiple workers
        const task = analysis.originalTask.toLowerCase();
        const multiWorkerKeywords = ['coordinate', 'collaborate', 'team', 'together', 'divide', 'split'];
        if (multiWorkerKeywords.some(keyword => task.includes(keyword)) && !analysis.explicitWorkerCount) {
            workerCount = Math.max(workerCount, 2); // At least 2 workers for coordination tasks
        }

        // Spawn the determined number of workers
        for (let i = 0; i < workerCount; i++) {
            const workerTimestamp = (parseInt(timestamp) + i).toString();
            let workerName, workerType;

            switch (analysis.taskType) {
                case 'building':
                    if (i === 0) {
                        workerName = 'builder_' + workerTimestamp;
                        workerType = 'builder';
                    } else if (i === 1) {
                        workerName = 'architect_' + workerTimestamp;
                        workerType = 'architect';
                    } else {
                        workerName = 'decorator_' + workerTimestamp;
                        workerType = 'decorator';
                    }
                    break;
                case 'mining':
                    if (i === 0) {
                        workerName = 'miner_' + workerTimestamp;
                        workerType = 'miner';
                    } else {
                        workerName = 'collector_' + workerTimestamp;
                        workerType = 'collector';
                    }
                    break;
                case 'farming':
                    if (i === 0) {
                        workerName = 'farmer_' + workerTimestamp;
                        workerType = 'farmer';
                    } else {
                        workerName = 'harvester_' + workerTimestamp;
                        workerType = 'harvester';
                    }
                    break;
                case 'gathering':
                    if (i === 0) {
                        workerName = 'gatherer_' + workerTimestamp;
                        workerType = 'gatherer';
                    } else {
                        workerName = 'collector_' + workerTimestamp;
                        workerType = 'collector';
                    }
                    break;
                case 'complex':
                    if (i === 0) {
                        workerName = 'builder_' + workerTimestamp;
                        workerType = 'builder';
                    } else {
                        workerName = 'assistant_' + workerTimestamp;
                        workerType = 'assistant';
                    }
                    break;
                default:
                    // For explicit worker counts with general tasks, create numbered workers
                    if (analysis.explicitWorkerCount) {
                        workerName = 'worker_' + workerTimestamp;
                        workerType = 'general';
                    } else {
                        workerName = 'worker_' + workerTimestamp;
                        workerType = 'general';
                    }
            }

            workers.push({ name: workerName, type: workerType });
        }

        const source = analysis.explicitWorkerCount ? 'explicit request' : 'automatic analysis';
        console.log('[HierarchicalBot] Determined need for ' + workerCount + ' workers for ' + analysis.taskType + ' task (complexity: ' + analysis.complexity + ', source: ' + source + ')');
        return workers;
    }

    async spawnWorkerBot(botName, botType, leaderName) {
        try {
            const agentConnections = global.kodecraftAgentConnections ? global.kodecraftAgentConnections() : {};
            const leaderConnection = agentConnections && agentConnections[leaderName];

            if (leaderConnection && leaderConnection.socket) {
                console.log('[HierarchicalBot] Spawning ' + botName + ' near ' + leaderName);
            }

            const botSettings = {
                minecraft_version: "1.21.4",
                host: "127.0.0.1",
                port: 55916,
                auth: "offline",
                base_profile: "creative",
                load_memory: false,
                init_message: 'You are ' + botName + ', a ' + botType + ' worker bot. You work under the direction of ' + leaderName + '. When given tasks, execute them directly using !newAction() - do NOT delegate tasks to other bots. IMPORTANT COORDINATION: When working with other bots, use !goToPlayer("botname") to coordinate locations and work at the SAME location as your team. Focus on ' + botType + ' work and follow instructions from your supervisor.',
                only_chat_with: [],
                speak: false,
                language: "en",
                render_bot_view: true,
                allow_insecure_coding: true,
                allow_vision: true,
                blocked_actions: [],
                code_timeout_mins: -1,
                relevant_docs_count: 5,
                max_messages: 15,
                num_examples: 2,
                max_commands: -1,
                verbose_commands: true,
                narrate_behavior: true,
                chat_bot_messages: true,
                log_all_prompts: false,
                profile: {
                    name: botName,
                    model: "gpt-4o",
                    description: 'A specialized ' + botType + ' worker bot managed by ' + leaderName,
                    role: botType
                }
            };

            const response = await fetch('http://localhost:8080/api/spawn-bot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ settings: botSettings })
            });

            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }

            const result = await response.json();

            return {
                success: true,
                botName: botName,
                botType: botType,
                message: result.message || 'Successfully spawned ' + botName
            };

        } catch (error) {
            console.error('[HierarchicalBot] Error spawning ' + botName + ':', error);
            return {
                success: false,
                error: error.message,
                botName: botName
            };
        }
    }

    // Wait for a bot to be connected and in-game
    async waitForBotConnection(botName, maxWaitTime = 30000) {
        const startTime = Date.now();
        const checkInterval = 500; // Check every 500ms

        console.log('[HierarchicalBot] Waiting for ' + botName + ' to connect...');

        while (Date.now() - startTime < maxWaitTime) {
            const agentConnections = global.kodecraftAgentConnections();
            const botConnection = agentConnections[botName];

            if (botConnection && botConnection.in_game) {
                console.log('[HierarchicalBot] ' + botName + ' is now connected and in-game');
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        console.error('[HierarchicalBot] Timeout waiting for ' + botName + ' to connect after ' + maxWaitTime + 'ms');
        return false;
    }

    // Wait for multiple bots to connect
    async waitForBotsConnection(botNames, maxWaitTime = 30000) {
        const connectionPromises = botNames.map(botName =>
            this.waitForBotConnection(botName, maxWaitTime)
        );

        const results = await Promise.all(connectionPromises);
        const allConnected = results.every(result => result === true);

        if (!allConnected) {
            const failedBots = botNames.filter((name, index) => !results[index]);
            console.error('[HierarchicalBot] Failed to connect bots: ' + failedBots.join(', '));
        }

        return allConnected;
    }

    getAvailableWorkers(leaderName) {
        if (!global.kodecraftAgentConnections) {
            return [];
        }

        const availableWorkers = [];
        const agentConnections = global.kodecraftAgentConnections();
        
        for (const [botName, connection] of Object.entries(agentConnections)) {
            if (botName === leaderName) continue;
            
            if (connection.in_game) {
                availableWorkers.push({
                    name: botName,
                    connection: connection
                });
            }
        }

        return availableWorkers;
    }

    selectWorkersForTask(availableWorkers, analysis) {
        console.log('[HierarchicalBot] Selecting workers for ' + analysis.taskType + ' task from ' + availableWorkers.length + ' available workers');

        let suitableWorkers = [];

        for (const worker of availableWorkers) {
            const workerName = worker.name.toLowerCase();

            // Check for task-specific workers and their specializations
            if (analysis.taskType === 'building') {
                if (workerName.includes('builder') || workerName.includes('architect') ||
                    workerName.includes('decorator') || workerName.includes('assistant')) {
                    suitableWorkers.push(worker);
                }
            } else if (analysis.taskType === 'mining') {
                if (workerName.includes('miner') || workerName.includes('collector')) {
                    suitableWorkers.push(worker);
                }
            } else if (analysis.taskType === 'farming') {
                if (workerName.includes('farmer') || workerName.includes('harvester')) {
                    suitableWorkers.push(worker);
                }
            } else if (analysis.taskType === 'gathering') {
                if (workerName.includes('gatherer') || workerName.includes('collector')) {
                    suitableWorkers.push(worker);
                }
            }

            // Also include general workers
            if (workerName.includes('worker') || workerName.includes('helper') || workerName.includes('assistant')) {
                suitableWorkers.push(worker);
            }
        }

        // Remove duplicates (in case a worker matches multiple criteria)
        suitableWorkers = suitableWorkers.filter((worker, index, self) =>
            index === self.findIndex(w => w.name === worker.name)
        );

        console.log('[HierarchicalBot] Found ' + suitableWorkers.length + ' suitable workers for ' + analysis.taskType + ' task');

        if (suitableWorkers.length === 0) {
            console.log('[HierarchicalBot] No specialized workers found, using all available workers');
            suitableWorkers = availableWorkers;
        }

        return suitableWorkers;
    }

    breakDownTask(analysis, workers) {
        const assignments = [];

        if (workers.length === 1) {
            assignments.push({
                workerName: workers[0].name,
                task: analysis.originalTask
            });
        } else {
            // Create specific subtasks based on task type and worker specializations
            switch (analysis.taskType) {
                case 'building':
                    assignments.push(...this.breakDownBuildingTask(analysis, workers));
                    break;
                case 'mining':
                    assignments.push(...this.breakDownMiningTask(analysis, workers));
                    break;
                case 'farming':
                    assignments.push(...this.breakDownFarmingTask(analysis, workers));
                    break;
                case 'gathering':
                    assignments.push(...this.breakDownGatheringTask(analysis, workers));
                    break;
                default:
                    // Generic task breakdown for other task types
                    for (let i = 0; i < workers.length; i++) {
                        let task = 'Help with: ' + analysis.originalTask + ' (Part ' + (i + 1) + ' of ' + workers.length + ')';
                        
                        // COORDINATION FIX: Add coordination instructions for multi-worker tasks
                        if (workers.length > 1) {
                            if (i === 0) {
                                task += ' LEAD WORKER: Establish work location and announce coordinates in chat. Wait for team members to arrive.';
                            } else {
                                task += ' TEAM MEMBER: Wait for location announcement from ' + workers[0].name + ' and work at the SAME location.';
                            }
                        }
                        
                        assignments.push({
                            workerName: workers[i].name,
                            task: task
                        });
                    }
            }
        }

        return assignments;
    }

    breakDownBuildingTask(analysis, workers) {
        const assignments = [];
        const task = analysis.originalTask;

        if (workers.length === 2) {
            assignments.push({
                workerName: workers[0].name,
                task: `LEAD BUILDER: Build the main structure for: ${task}. Focus on walls, foundation, and basic framework. COORDINATION: Establish build location and announce coordinates in chat. Wait for ${workers[1].name} to arrive before starting major construction.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `TEAM BUILDER: Handle architectural details for: ${task}. Focus on rooms, doors, windows, and interior layout. COORDINATION: Wait for ${workers[0].name} to announce build location, then work on the SAME structure.`
            });
        } else if (workers.length >= 3) {
            assignments.push({
                workerName: workers[0].name,
                task: `LEAD BUILDER: Build the foundation and main walls for: ${task}. Start with the basic structure. COORDINATION: Establish ONE build location and announce coordinates in chat for all team members.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `STRUCTURE BUILDER: Create the architectural layout for: ${task}. Add rooms, divisions, and structural details. COORDINATION: Wait for build location announcement and work on the SAME structure as ${workers[0].name}.`
            });
            assignments.push({
                workerName: workers[2].name,
                task: `FINISHING BUILDER: Add finishing touches for: ${task}. Install doors, windows, roof, and decorative elements. COORDINATION: Work on the SAME structure established by the team.`
            });
            
            // Additional workers as assistants
            for (let i = 3; i < workers.length; i++) {
                assignments.push({
                    workerName: workers[i].name,
                    task: `SUPPORT BUILDER: Assist with construction of: ${task}. Support the primary builders and manage materials. COORDINATION: Work at the SAME location as the team.`
                });
            }
        } else if (workers.length === 1) {
            assignments.push({
                workerName: workers[0].name,
                task: `Build: ${task}. Manage foundation, structure, and finishing as a single worker.`
            });
        }

        return assignments;
    }

    breakDownMiningTask(analysis, workers) {
        const assignments = [];
        const task = analysis.originalTask;

        if (workers.length >= 2) {
            assignments.push({
                workerName: workers[0].name,
                task: `LEAD MINER: Primary mining for: ${task}. Focus on digging and excavation work. COORDINATION: Establish mining site and announce location in chat.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `COLLECTOR: Resource collection for: ${task}. Gather and organize mined materials. COORDINATION: Work at the SAME mining site as ${workers[0].name}.`
            });
        }

        return assignments;
    }

    breakDownFarmingTask(analysis, workers) {
        const assignments = [];
        const task = analysis.originalTask;

        if (workers.length >= 2) {
            assignments.push({
                workerName: workers[0].name,
                task: `LEAD FARMER: Planting and cultivation for: ${task}. Prepare soil and plant crops. COORDINATION: Establish farm location and announce coordinates.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `FARM HELPER: Harvesting and maintenance for: ${task}. Collect crops and maintain farm. COORDINATION: Work at the SAME farm location as ${workers[0].name}.`
            });
        }

        return assignments;
    }

    breakDownGatheringTask(analysis, workers) {
        const assignments = [];
        const task = analysis.originalTask;

        if (workers.length >= 2) {
            assignments.push({
                workerName: workers[0].name,
                task: `LEAD GATHERER: Primary resource gathering for: ${task}. Focus on main collection objectives. COORDINATION: Establish gathering areas and announce locations.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `GATHERER HELPER: Secondary resource collection for: ${task}. Support and organize gathered materials. COORDINATION: Work in the SAME areas as ${workers[0].name}.`
            });
        }

        return assignments;
    }

    async assignTaskToWorker(supervisorName, workerName, taskDescription, waitForConnection = false) {
        try {
            console.log('[HierarchicalBot] ' + supervisorName + ' assigning task to ' + workerName + ': "' + taskDescription + '"');

            // If waitForConnection is true, wait for the bot to be connected first
            if (waitForConnection) {
                const isConnected = await this.waitForBotConnection(workerName, 15000); // 15 second timeout
                if (!isConnected) {
                    return {
                        success: false,
                        error: 'Worker \'' + workerName + '\' failed to connect in time'
                    };
                }
            }

            const agentConnections = global.kodecraftAgentConnections();
            const workerConnection = agentConnections[workerName];

            if (!workerConnection) {
                return {
                    success: false,
                    error: 'Worker \'' + workerName + '\' not found'
                };
            }

            if (!workerConnection.in_game) {
                return {
                    success: false,
                    error: 'Worker \'' + workerName + '\' is not in-game'
                };
            }

            if (workerConnection.socket) {
                workerConnection.socket.emit('send-message', workerName, taskDescription);

                if (!this.managedWorkers.has(supervisorName)) {
                    this.managedWorkers.set(supervisorName, new Set());
                }
                this.managedWorkers.get(supervisorName).add(workerName);

                return {
                    success: true,
                    message: 'Task assigned to ' + workerName,
                    workerName: workerName,
                    task: taskDescription
                };
            } else {
                return {
                    success: false,
                    error: 'Worker \'' + workerName + '\' is not connected'
                };
            }

        } catch (error) {
            console.error('[HierarchicalBot] Error assigning task to worker:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async releaseWorker(supervisorName, workerName) {
        try {
            console.log('[HierarchicalBot] ' + supervisorName + ' releasing worker ' + workerName);
            
            if (this.managedWorkers.has(supervisorName)) {
                this.managedWorkers.get(supervisorName).delete(workerName);
                
                if (this.managedWorkers.get(supervisorName).size === 0) {
                    this.managedWorkers.delete(supervisorName);
                }
            }
            
            return {
                success: true,
                message: 'Worker \'' + workerName + '\' released'
            };
            
        } catch (error) {
            console.error('[HierarchicalBot] Error releasing worker:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async releaseAllWorkers(supervisorName) {
        try {
            console.log('[HierarchicalBot] ' + supervisorName + ' releasing all workers');
            
            const releasedWorkers = [];
            if (this.managedWorkers.has(supervisorName)) {
                releasedWorkers.push(...this.managedWorkers.get(supervisorName));
                this.managedWorkers.delete(supervisorName);
            }
            
            return {
                success: true,
                message: 'Released ' + releasedWorkers.length + ' workers',
                releasedWorkers: releasedWorkers
            };
            
        } catch (error) {
            console.error('[HierarchicalBot] Error releasing all workers:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async listAvailableWorkers(supervisorName) {
        try {
            const availableWorkers = this.getAvailableWorkers(supervisorName);
            const managedWorkers = this.managedWorkers.get(supervisorName) || new Set();
            
            return {
                success: true,
                availableWorkers: availableWorkers.map(w => ({
                    name: w.name,
                    managed: managedWorkers.has(w.name)
                })),
                totalAvailable: availableWorkers.length,
                totalManaged: managedWorkers.size
            };
        } catch (error) {
            console.error('[HierarchicalBot] Error while gathering worker info:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Spawn additional workers for a supervisor
    async spawnAdditionalWorkers(supervisorName, workerCount, workerType) {
        try {
            console.log('[HierarchicalBot] ' + supervisorName + ' requesting ' + workerCount + ' additional ' + workerType + ' workers');

            // Validate inputs
            const count = parseInt(workerCount);
            if (isNaN(count) || count < 1 || count > 5) {
                return {
                    success: false,
                    error: 'Invalid worker count. Must be between 1 and 5.'
                };
            }

            const validTypes = ['builder', 'miner', 'farmer', 'gatherer', 'general'];
            if (!validTypes.includes(workerType)) {
                return {
                    success: false,
                    error: 'Invalid worker type. Valid types: ' + validTypes.join(', ')
                };
            }

            // Create worker specifications
            const workers = [];
            const timestamp = Date.now().toString().slice(-4);

            for (let i = 0; i < count; i++) {
                const workerTimestamp = (parseInt(timestamp) + i).toString();
                const workerName = workerType + '_' + workerTimestamp;
                workers.push({ name: workerName, type: workerType });
            }

            // Spawn the workers
            const spawnResults = [];
            for (const workerSpec of workers) {
                const spawnResult = await this.spawnWorkerBot(workerSpec.name, workerSpec.type, supervisorName);
                spawnResults.push(spawnResult);

                if (spawnResult.success) {
                    console.log('[HierarchicalBot] Successfully spawned additional worker ' + workerSpec.name);
                } else {
                    console.log('[HierarchicalBot] Failed to spawn additional worker ' + workerSpec.name + ': ' + spawnResult.error);
                }

                // Small delay between spawns
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const successfulSpawns = spawnResults.filter(r => r.success);

            if (successfulSpawns.length > 0) {
                // Wait for all spawned bots to connect
                const botNames = successfulSpawns.map(r => r.botName);
                const allConnected = await this.waitForBotsConnection(botNames, 30000);

                if (!allConnected) {
                    console.warn('[HierarchicalBot] Some additional workers failed to connect');
                }
            }

            return {
                success: successfulSpawns.length > 0,
                spawned: successfulSpawns.length,
                total: count,
                workers: successfulSpawns.map(r => r.botName),
                error: successfulSpawns.length === 0 ? 'No workers could be spawned' : null
            };

        } catch (error) {
            console.error('[HierarchicalBot] Error spawning additional workers:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    checkWorkers(supervisorName) {
        try {
            console.log('[HierarchicalBot] ' + supervisorName + ' checking worker status');

            const agentConnections = global.kodecraftAgentConnections ? global.kodecraftAgentConnections() : {};
            const managedWorkers = this.managedWorkers.get(supervisorName) || new Set();
            
            const workerStatus = [];
            const connectedWorkers = [];
            const disconnectedWorkers = [];

            for (const workerName of managedWorkers) {
                const connection = agentConnections[workerName];
                const status = {
                    name: workerName,
                    connected: !!(connection && connection.socket),
                    inGame: !!(connection && connection.in_game),
                    hasSocket: !!(connection && connection.socket)
                };

                workerStatus.push(status);

                if (status.connected && status.inGame) {
                    connectedWorkers.push(workerName);
                } else {
                    disconnectedWorkers.push(workerName);
                }
            }

            return {
                success: true,
                supervisor: supervisorName,
                totalWorkers: managedWorkers.size,
                connectedWorkers: connectedWorkers.length,
                disconnectedWorkers: disconnectedWorkers.length,
                workerDetails: workerStatus,
                connectedWorkerNames: connectedWorkers,
                disconnectedWorkerNames: disconnectedWorkers,
                workers: Array.from(managedWorkers)
            };

        } catch (error) {
            console.error('[HierarchicalBot] Error checking workers:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default HierarchicalBotManager;