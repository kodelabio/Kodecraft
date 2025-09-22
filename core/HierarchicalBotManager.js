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
        if (simpleKeywords.some(keyword => task.includes(keyword))) {
            needsWorkers = false;
            complexity = 'simple';
        }
        
        return {
            taskType,
            complexity,
            needsWorkers,
            originalTask: taskDescription
        };
    }

    async delegateTask(leaderName, taskDescription) {
        try {
            console.log('[HierarchicalBot] ' + leaderName + ' analyzing task: "' + taskDescription + '"');
            
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
                
                console.log('[HierarchicalBot] Waiting for spawned bots to initialize...');
                await new Promise(resolve => setTimeout(resolve, 8000));
                
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
        
        switch (analysis.taskType) {
            case 'building':
                workers.push({ name: 'builder_' + timestamp, type: 'builder' });
                break;
            case 'mining':
                workers.push({ name: 'miner_' + timestamp, type: 'miner' });
                break;
            case 'farming':
                workers.push({ name: 'farmer_' + timestamp, type: 'farmer' });
                break;
            case 'gathering':
                workers.push({ name: 'gatherer_' + timestamp, type: 'gatherer' });
                break;
            case 'complex':
                workers.push({ name: 'builder_' + timestamp, type: 'builder' });
                break;
            default:
                workers.push({ name: 'worker_' + timestamp, type: 'general' });
        }
        
        return workers;
    }

    async spawnWorkerBot(botName, botType, leaderName) {
        try {
            const agentConnections = global.kodecraftAgentConnections();
            const leaderConnection = agentConnections[leaderName];
            
            if (leaderConnection && leaderConnection.socket) {
                console.log('[HierarchicalBot] Spawning ' + botName + ' near ' + leaderName);
            }
            
            const botSettings = {
                minecraft_version: "1.21.4",
                host: "127.0.0.1",
                port: 55916,
                auth: "offline",
                mindserver_port: 8080,
                base_profile: "creative",
                load_memory: false,
                init_message: 'You are ' + botName + ', a ' + botType + ' worker bot. You work under the direction of ' + leaderName + '. Follow their instructions and help with ' + botType + ' tasks. Always respond with action commands when given tasks.',
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
            
            if (analysis.taskType === 'building' && workerName.includes('builder')) {
                suitableWorkers.push(worker);
            } else if (analysis.taskType === 'mining' && workerName.includes('miner')) {
                suitableWorkers.push(worker);
            } else if (analysis.taskType === 'farming' && workerName.includes('farmer')) {
                suitableWorkers.push(worker);
            } else if (analysis.taskType === 'gathering' && workerName.includes('gatherer')) {
                suitableWorkers.push(worker);
            } else if (workerName.includes('worker') || workerName.includes('helper')) {
                suitableWorkers.push(worker);
            }
        }
        
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
            for (let i = 0; i < workers.length; i++) {
                assignments.push({
                    workerName: workers[i].name,
                    task: 'Help with: ' + analysis.originalTask + ' (Part ' + (i + 1) + ' of ' + workers.length + ')'
                });
            }
        }
        
        return assignments;
    }

    async assignTaskToWorker(supervisorName, workerName, taskDescription) {
        try {
            console.log('[HierarchicalBot] ' + supervisorName + ' assigning task to ' + workerName + ': "' + taskDescription + '"');
            
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
            console.error('[HierarchicalBot] Error listing workers:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default HierarchicalBotManager;