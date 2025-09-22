class HierarchicalBotManager {
    constructor() {
        this.managedWorkers = new Map();
        this.taskAssignments = new Map();
        this.taskCounter = 0;
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
            // ... existing code ...
            
            if (selectedWorkers.length === 0) {
                console.log('[HierarchicalBot] No suitable workers found for task type: ' + analysis.taskType);
                return {
                    success: false,
                    reason: 'no_suitable_workers',
                    message: 'No suitable workers available for ' + analysis.taskType + ' tasks'
                };
            }

            const taskBreakdown = this.breakDownTask(analysis, selectedWorkers);
            
            const assignments = [];
            for (const assignment of taskBreakdown) {
                const result = await this.assignTaskToWorker(leaderName, assignment.workerName, assignment.task);
                assignments.push(result);
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
                message: 'Task delegated to ' + selectedWorkers.length + ' worker(s)',
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
                init_message: 'You are ' + botName + ', a ' + botType + ' worker bot. You work under the direction of ' + leaderName + '. When given tasks, execute them directly using !newAction() - do NOT delegate tasks to other bots. Focus on ' + botType + ' work and follow instructions from your supervisor.',
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

    breakDownBuildingTask(analysis, workers) {
        const assignments = [];
        const task = analysis.originalTask;

        // If user explicitly requested a specific number of workers and we have at least that many available,
        // create more specific, coordinated subtasks so workers can collaborate effectively.
        if (analysis.explicitWorkerCount && workers.length >= 2) {
            // Two-worker explicit coordination: split into complementary halves with explicit coordination mentions.
            if (workers.length === 2) {
                assignments.push({
                    workerName: workers[0].name,
                    task: `Build the first half of: ${task}. Focus on foundation and initial structure. Coordinate with ${workers[1].name}.`
                });
                assignments.push({
                    workerName: workers[1].name,
                    task: `Build the second half of: ${task}. Focus on completion and finishing touches. Coordinate with ${workers[0].name}.`
                });
            } else if (workers.length >= 3) {
                // Three or more: assign clear phased roles, then assign extras as support/assistants.
                assignments.push({
                    workerName: workers[0].name,
                    task: `Build the foundation and base structure for: ${task}. Start the construction process and ensure layout is correct. Coordinate handoffs with the rest of the team.`
                });
                assignments.push({
                    workerName: workers[1].name,
                    task: `Build the walls and main structure for: ${task}. Continue after ${workers[0].name} starts and maintain alignment with foundation.`
                });
                assignments.push({
                    workerName: workers[2].name,
                    task: `Add the roof and finishing details for: ${task}. Complete the construction and prepare for final touches.`
                });

                // Additional workers act as assistants/support to increase throughput and handle materials.
                for (let i = 3; i < workers.length; i++) {
                    assignments.push({
                        workerName: workers[i].name,
                        task: `Assist with construction of: ${task}. Help with materials, support work, and coordination between primary builders.`
                    });
                }
            }
        } else if (workers.length === 2) {
            // Default two-worker split when no explicit count was requested: one focuses on structure, one on details.
            assignments.push({
                workerName: workers[0].name,
                task: `Build the main structure for: ${task}. Focus on walls, foundation, and basic framework. Coordinate with ${workers[1].name} as needed.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `Handle architectural details for: ${task}. Focus on rooms, doors, windows, and interior layout. Coordinate with ${workers[0].name}.`
            });
        } else if (workers.length >= 3) {
            // Default three-or-more split: foundation, layout, finishing.
            assignments.push({
                workerName: workers[0].name,
                task: `Build the foundation and main walls for: ${task}. Start with the basic structure and ensure stability.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `Create the architectural layout for: ${task}. Add rooms, divisions, and structural details.`
            });
            assignments.push({
                workerName: workers[2].name,
                task: `Add finishing touches for: ${task}. Install doors, windows, roof, and decorative elements.`
            });

            // If there are more than three workers, assign extras as assistants.
            for (let i = 3; i < workers.length; i++) {
                assignments.push({
                    workerName: workers[i].name,
                    task: `Assist with construction of: ${task}. Support the primary builders and manage materials.`
                });
            }
        } else if (workers.length === 1) {
            // Single worker: assign the full building task scaled to one person.
            assignments.push({
                workerName: workers[0].name,
                task: `Build: ${task}. Manage foundation, structure, and finishing as a single worker.`
            });
        }

        return assignments;
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
                        assignments.push({
                            workerName: workers[i].name,
                            task: 'Help with: ' + analysis.originalTask + ' (Part ' + (i + 1) + ' of ' + workers.length + ')'
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
                task: `Build the main structure for: ${task}. Focus on walls, foundation, and basic framework.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `Handle architectural details for: ${task}. Focus on rooms, doors, windows, and interior layout.`
            });
        } else if (workers.length >= 3) {
            assignments.push({
                workerName: workers[0].name,
                task: `Build the foundation and main walls for: ${task}. Start with the basic structure.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `Create the architectural layout for: ${task}. Add rooms, divisions, and structural details.`
            });
            assignments.push({
                workerName: workers[2].name,
                task: `Add finishing touches for: ${task}. Install doors, windows, roof, and decorative elements.`
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
                task: `Primary mining for: ${task}. Focus on digging and excavation work.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `Resource collection for: ${task}. Gather and organize mined materials.`
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
                task: `Planting and cultivation for: ${task}. Prepare soil and plant crops.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `Harvesting and maintenance for: ${task}. Collect crops and maintain farm.`
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
                task: `Primary resource gathering for: ${task}. Focus on main collection objectives.`
            });
            assignments.push({
                workerName: workers[1].name,
                task: `Secondary resource collection for: ${task}. Support and organize gathered materials.`
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
}

export default HierarchicalBotManager;