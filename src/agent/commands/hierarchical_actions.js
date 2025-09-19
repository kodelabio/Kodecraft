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
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }
        
        return await response.json();
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
                    agent.bot.chat(`❌ Failed to delegate task: ${result.error}`);
                    return `Failed to delegate task: ${result.error}`;
                }
            } catch (error) {
                console.error('[HierarchicalAction] Error in delegateTask:', error);
                return 'Hierarchical bot management system is not available. Please ensure the system is properly initialized.';
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
    }
];