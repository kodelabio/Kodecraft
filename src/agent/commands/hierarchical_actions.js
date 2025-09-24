 // Helper function to make API calls to hierarchical bot manager
async function callHierarchicalAPI(endpoint, data) {
    try {
        const response = await fetch(`http://localhost:8080/api/hierarchical/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        // Parse the response body regardless of status
        const responseData = await response.json();

        // For hierarchical API, we want to return the data even if status is not 200
        // because it contains useful information about why the request failed
        if (!response.ok && !responseData) {
            throw new Error(`API request failed: ${response.status}`);
        }

        return responseData;
    } catch (error) {
        console.log(`[HierarchicalAction] API error for ${endpoint}:`, error.message);
        throw error;
    }
}

export const hierarchicalActions = [
    {
        name: '!delegateTask',
        description: 'Intelligently analyze a task and automatically spawn and assign worker bots to complete it.',
        params: {
            'task_description': { type: 'string', description: 'Description of the task to be completed (e.g., "build a house", "mine diamonds", "create a farm").' }
        },
        perform: async function(agent, task_description) {
            try {
                console.log('[HierarchicalAction] delegateTask called by:', agent.name);

                const result = await callHierarchicalAPI('delegate', {
                    supervisorName: agent.name,
                    taskDescription: task_description
                });

                if (result.success) {
                    agent.bot.chat(`✅ Task delegated successfully!`);
                    agent.bot.chat(`📋 Workers assigned: ${result.workersAssigned.join(', ')}`);
                    agent.bot.chat(`🎯 Task: ${result.taskBreakdown.join(' | ')}`);
                    return `Task successfully delegated to ${result.workersAssigned.length} worker(s): ${result.workersAssigned.join(', ')}. Task breakdown: ${result.taskBreakdown.join(' | ')}`;
                } else {
                    // Handle different failure reasons
                    if (result.reason === 'worker_should_execute') {
                        agent.bot.chat(`⚠️ I'm a worker bot - I should execute tasks directly, not delegate them!`);
                        agent.bot.chat(`💡 I'll use !newAction() to complete this task instead.`);
                        return `As a worker bot, I should execute tasks directly using !newAction() rather than delegating. Let me do the work myself.`;
                    } else if (result.reason === 'simple_task') {
                        agent.bot.chat(`ℹ️ This task is simple enough for me to handle personally.`);
                        return `Task "${task_description}" is simple enough to handle personally without delegating to workers.`;
                    } else if (result.error) {
                        agent.bot.chat(`❌ Failed to delegate task: ${result.error}`);
                        return `Failed to delegate task: ${result.error}`;
                    } else {
                        agent.bot.chat(`❌ Failed to delegate task for unknown reason`);
                        return `Failed to delegate task for unknown reason`;
                    }
                }
            } catch (error) {
                console.error('[HierarchicalAction] Error in delegateTask:', error);
                return 'Hierarchical bot management system is not available. Please ensure the system is properly initialized.';
            }
        }
    },
    {
    name: '!debugWorkerStatus',
    description: 'Debug the status of all workers and their current activities.',
    params: {},
    perform: async function(agent) {
        try {
            const agentConnections = global.kodecraftAgentConnections();
            if (!agentConnections) {
                return 'Agent connections not available.';
            }

            let status = `=== WORKER DEBUG STATUS ===\n`;
            for (const [botName, connection] of Object.entries(agentConnections)) {
                if (botName !== agent.name) {
                    status += `${botName}: `;
                    status += `Connected: ${!!connection.socket}, `;
                    status += `In-game: ${!!connection.in_game}, `;
                    status += `Position: ${connection.bot?.entity?.position ? 
                        `(${Math.floor(connection.bot.entity.position.x)}, ${Math.floor(connection.bot.entity.position.y)}, ${Math.floor(connection.bot.entity.position.z)})` : 
                        'Unknown'}\n`;
                }
            }

            agent.bot.chat(status);
            return status;
        } catch (error) {
            return `Debug error: ${error.message}`;
        }
    }
},
{
    name: '!sendDirectCommand',
    description: 'Send a direct command to a specific worker bot for testing.',
    params: {
        'worker_name': { type: 'string', description: 'Name of the worker bot' },
        'command': { type: 'string', description: 'Command to send' }
    },
    perform: async function(agent, worker_name, command) {
        try {
            const agentConnections = global.kodecraftAgentConnections();
            const workerConnection = agentConnections[worker_name];

            if (!workerConnection || !workerConnection.socket) {
                return `Worker ${worker_name} not found or not connected.`;
            }

            workerConnection.socket.emit('send-message', worker_name, command);
            agent.bot.chat(`Sent command to ${worker_name}: ${command}`);
            return `Command sent to ${worker_name}`;
        } catch (error) {
            return `Error sending command: ${error.message}`;
        }
    }
},
    {
        name: '!checkMyWorkers',
        description: 'Check the status of all workers assigned to this supervisor.',
        params: {},
        perform: async function(agent) {
            try {
                const result = await callHierarchicalAPI('check-workers', {
                    supervisorName: agent.name
                });
                
                if (result.success) {
                    const workers = result.workers || [];
                    if (workers.length === 0) {
                        agent.bot.chat('📋 No workers currently assigned to you.');
                        return 'No workers currently assigned.';
                    } else {
                        agent.bot.chat(`👥 You have ${workers.length} worker(s): ${workers.join(', ')}`);
                        return `Workers assigned: ${workers.join(', ')}`;
                    }
                } else {
                    return `Error checking workers: ${result.error}`;
                }
            } catch (error) {
                return 'Hierarchical bot management system is not available.';
            }
        }
    },
    {
        name: '!releaseWorker',
        description: 'Release a specific worker bot from your supervision.',
        params: {
            'worker_name': { type: 'string', description: 'Name of the worker bot to release.' }
        },
        perform: async function(agent, worker_name) {
            try {
                const result = await callHierarchicalAPI('release-worker', {
                    supervisorName: agent.name,
                    workerName: worker_name
                });
                
                if (result.success) {
                    agent.bot.chat(`✅ Worker ${worker_name} has been released.`);
                    return `Worker ${worker_name} released successfully.`;
                } else {
                    return `Error releasing worker: ${result.error}`;
                }
            } catch (error) {
                return 'Hierarchical bot management system is not available.';
            }
        }
    },
    {
        name: '!releaseAllWorkers',
        description: 'Release all worker bots from your supervision.',
        params: {},
        perform: async function(agent) {
            try {
                const result = await callHierarchicalAPI('release-all-workers', {
                    supervisorName: agent.name
                });
                
                if (result.success) {
                    agent.bot.chat(`✅ All workers have been released.`);
                    return `All workers released successfully.`;
                } else {
                    return `Error releasing workers: ${result.error}`;
                }
            } catch (error) {
                return 'Hierarchical bot management system is not available.';
            }
        }
    },
    {
        name: '!assignTaskToWorker',
        description: 'Assign a specific task to a specific worker bot.',
        params: {
            'worker_name': { type: 'string', description: 'Name of the worker bot.' },
            'task_description': { type: 'string', description: 'Description of the task to assign.' }
        },
        perform: async function(agent, worker_name, task_description) {
            try {
                const result = await callHierarchicalAPI('assign-task', {
                    supervisorName: agent.name,
                    workerName: worker_name,
                    taskDescription: task_description
                });
                
                if (result.success) {
                    agent.bot.chat(`✅ Task assigned to ${worker_name}: ${task_description}`);
                    return `Task successfully assigned to ${worker_name}.`;
                } else {
                    return `Error assigning task: ${result.error}`;
                }
            } catch (error) {
                return 'Hierarchical bot management system is not available.';
            }
        }
    },
    {
        name: '!listAvailableWorkers',
        description: 'List all available worker bots that can be assigned tasks.',
        params: {},
        perform: async function(agent) {
            try {
                const result = await callHierarchicalAPI('list-workers', {
                    supervisorName: agent.name
                });
                
                if (result.success) {
                    const workers = result.workers || [];
                    if (workers.length === 0) {
                        agent.bot.chat('📋 No available workers at the moment.');
                        return 'No available workers.';
                    } else {
                        agent.bot.chat(`👥 Available workers: ${workers.join(', ')}`);
                        return `Available workers: ${workers.join(', ')}`;
                    }
                } else {
                    return `Error listing workers: ${result.error}`;
                }
            } catch (error) {
                return 'Hierarchical bot management system is not available.';
            }
        }
    },
    {
        name: '!spawnAdditionalWorkers',
        description: 'Spawn additional worker bots to help with current tasks. Specify the number and type of workers needed.',
        params: {
            'worker_count': { type: 'float', description: 'Number of additional workers to spawn (1-5).' },
            'worker_type': { type: 'string', description: 'Type of workers to spawn: builder, miner, farmer, gatherer, or general.' }
        },
        perform: async function(agent, worker_count, worker_type = 'general') {
            try {
                // Validate input
                const count = parseInt(worker_count);
                if (isNaN(count) || count < 1 || count > 5) {
                    agent.bot.chat('⚠️ Please specify a valid number of workers (1-5).');
                    return 'Invalid worker count. Please specify 1-5 workers.';
                }

                const validTypes = ['builder', 'miner', 'farmer', 'gatherer', 'general'];
                if (!validTypes.includes(worker_type.toLowerCase())) {
                    agent.bot.chat('⚠️ Invalid worker type. Use: builder, miner, farmer, gatherer, or general.');
                    return 'Invalid worker type. Valid types: ' + validTypes.join(', ');
                }

                console.log('[HierarchicalAction] spawnAdditionalWorkers called by:', agent.name);

                const result = await callHierarchicalAPI('spawn-additional', {
                    supervisorName: agent.name,
                    workerCount: count,
                    workerType: worker_type.toLowerCase()
                });

                if (result.success) {
                    const spawnedWorkers = result.workers || [];
                    agent.bot.chat(`✅ Successfully spawned ${spawnedWorkers.length} additional ${worker_type} worker(s)!`);
                    agent.bot.chat(`👥 New workers: ${spawnedWorkers.join(', ')}`);
                    return `Successfully spawned ${spawnedWorkers.length} ${worker_type} worker(s): ${spawnedWorkers.join(', ')}`;
                } else {
                    agent.bot.chat(`❌ Failed to spawn additional workers: ${result.error}`);
                    return `Failed to spawn additional workers: ${result.error}`;
                }
            } catch (error) {
                console.error('[HierarchicalAction] Error in spawnAdditionalWorkers:', error);
                return 'Hierarchical bot management system is not available.';
            }
        }
    }
];

