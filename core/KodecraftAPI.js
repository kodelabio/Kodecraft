import express from 'express';

export class KodecraftAPI {
    constructor(agentHandler, agentConnections, hierarchicalBotManager = null) {
        this.agentHandler = agentHandler;
        this.agentConnections = agentConnections;
        this.hierarchicalBotManager = hierarchicalBotManager;
        this.router = express.Router();
        this.setupRoutes();
    }

    // Set up all API routes
    setupRoutes() {
        this.router.use(express.json({ limit: '10mb' }));
        this.router.use(this.requestLogger.bind(this));

        // API Routes
        this.router.post('/task', this.handleTaskSubmission.bind(this));
        this.router.get('/agents', this.getAgents.bind(this));
        this.router.get('/agents/:agentName/status', this.getAgentStatus.bind(this));
        this.router.post('/agents/:agentName/message', this.sendMessageToAgent.bind(this));
        this.router.post('/spawn-bot', this.handleSpawnBot.bind(this));
        this.router.post('/dismiss-bot', this.handleDismissBot.bind(this));
        this.router.post('/hierarchical/delegate', this.handleHierarchicalDelegate.bind(this));
        this.router.post('/hierarchical/check-workers', this.handleCheckWorkers.bind(this));
        this.router.post('/hierarchical/release-worker', this.handleReleaseWorker.bind(this));
        this.router.post('/hierarchical/release-all-workers', this.handleReleaseAllWorkers.bind(this));
        this.router.post('/hierarchical/assign-task', this.handleAssignTask.bind(this));
        this.router.post('/hierarchical/list-workers', this.handleListWorkers.bind(this));
        this.router.post('/hierarchical/spawn-additional', this.handleSpawnAdditional.bind(this));
        this.router.post('/hierarchical/spawn-and-delegate', this.handleSpawnAndDelegate.bind(this));
        this.router.get('/health', this.healthCheck.bind(this));
    }

    requestLogger(req, res, next) {
        const timestamp = new Date().toISOString();
        console.log(`[API] ${timestamp} ${req.method} ${req.path} - ${req.ip}`);
        next();
    }

    // Handle task submission to agents
    // POST /api/task
    // Body: { task: string, agentName?: string, priority?: string }
    async handleTaskSubmission(req, res) {
        try {
            const { task, agentName, priority = 'normal' } = req.body;
            
            // Validate required fields
            if (!task || typeof task !== 'string' || task.trim().length === 0) {
                return this.sendError(res, 400, 'Task is required and must be a non-empty string');
            }

            // Find target agent
            const targetAgent = await this.findTargetAgent(agentName);
            if (!targetAgent.success) {
                return this.sendError(res, 404, targetAgent.error);
            }

            // Send task to the selected agent
            const result = await this.sendTaskToAgent(targetAgent.agentName, task, priority);
            
            if (result.success) {
                this.sendSuccess(res, {
                    message: `Task sent to agent '${targetAgent.agentName}'`,
                    agentName: targetAgent.agentName,
                    task: task
                });
            } else {
                this.sendError(res, 500, result.error || 'Failed to send task to agent');
            }

        } catch (error) {
            console.error('Error handling task submission:', error);
            this.sendError(res, 500, 'Internal server error');
        }
    }

    // Coordinated task methods removed — TaskCoordinator is not used in this hierarchical bot system.
    // The related endpoints and handlers have been deleted to avoid dependencies on TaskCoordinator.

    // Get list of all agents and their status
    // GET /api/agents
    async getAgents(req, res) {
        try {
            const agents = Object.keys(this.agentConnections).map(name => ({
                name,
                in_game: this.agentConnections[name].in_game,
                connected: !!this.agentConnections[name].socket,
                status: this.getAgentConnectionStatus(name)
            }));
            
            this.sendSuccess(res, { 
                agents,
                total: agents.length,
                online: agents.filter(a => a.connected).length
            });
        } catch (error) {
            console.error('[API] Error in getAgents:', error);
            this.sendError(res, 500, 'Failed to retrieve agents');
        }
    }

    // Get specific agent status
    // GET /api/agents/:agentName/status
    async getAgentStatus(req, res) {
        try {
            const { agentName } = req.params;
            const agentConnection = this.agentConnections[agentName];
            
            if (!agentConnection) {
                return this.sendError(res, 404, `Agent '${agentName}' not found`);
            }

            this.sendSuccess(res, {
                name: agentName,
                in_game: agentConnection.in_game,
                connected: !!agentConnection.socket,
                status: this.getAgentConnectionStatus(agentName),
                settings: agentConnection.settings ? {
                    profile: agentConnection.settings.profile
                } : null
            });
        } catch (error) {
            console.error('[API] Error in getAgentStatus:', error);
            this.sendError(res, 500, 'Failed to retrieve agent status');
        }
    }

    // Send message directly to specific agent
    // POST /api/agents/:agentName/message
    // Body: { message: string, type?: string }
    async sendMessageToAgent(req, res) {
        try {
            const { agentName } = req.params;
            const { message, type = 'direct' } = req.body;

            if (!message || typeof message !== 'string') {
                return this.sendError(res, 400, 'Message is required and must be a string');
            }

            const agentConnection = this.agentConnections[agentName];
            if (!agentConnection) {
                return this.sendError(res, 404, `Agent '${agentName}' not found`);
            }

            const result = await this.sendTaskToAgent(agentName, message, 'normal', type);
            if (!result.success) {
                return this.sendError(res, 500, result.error);
            }

            this.sendSuccess(res, {
                message: `Message sent to agent '${agentName}'`,
                agentName,
                sentMessage: message,
                type,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('[API] Error in sendMessageToAgent:', error);
            this.sendError(res, 500, 'Failed to send message to agent');
        }
    }

    // Health check endpoint
    // GET /api/health
    async healthCheck(req, res) {
        const totalAgents = Object.keys(this.agentConnections).length;
        const onlineAgents = Object.values(this.agentConnections).filter(conn => conn.socket).length;
        
        this.sendSuccess(res, {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            agents: {
                total: totalAgents,
                online: onlineAgents
            },
            uptime: process.uptime()
        });
    }

    // Find the target agent for task submission
    async findTargetAgent(requestedAgentName) {
        // If specific agent requested, validate it exists
        if (requestedAgentName) {
            if (!this.agentConnections[requestedAgentName]) {
                return { success: false, error: `Agent '${requestedAgentName}' not found` };
            }
            return { success: true, agentName: requestedAgentName };
        }

        // Find first available agent
        const availableAgents = Object.keys(this.agentConnections);
        if (availableAgents.length === 0) {
            return { success: false, error: 'No agents available' };
        }

        // Prefer connected agents
        const connectedAgent = availableAgents.find(name => this.agentConnections[name].socket);
        const targetAgent = connectedAgent || availableAgents[0];

        return { success: true, agentName: targetAgent };
    }

    // Send task to specific agent
    async sendTaskToAgent(agentName, task, priority = 'normal', type = 'task') {
        try {
            const agentConnection = this.agentConnections[agentName];
            let handlerSuccess = false;

            // Try agent handler to send message directly
            if (this.agentHandler && typeof this.agentHandler.sendMessage === 'function') {
                try {
                    await this.agentHandler.sendMessage(agentName, task);
                    console.log(`[API] Task sent via handler to agent '${agentName}': ${task}`);
                    handlerSuccess = true;
                } catch (handlerError) {
                    console.log(`[API] Handler failed for agent '${agentName}', trying socket fallback: ${handlerError.message}`);
                }
            }

            // If handler succeeded, return success
            if (handlerSuccess) {
                return { success: true, method: 'handler' };
            }

            // Fallback to socket connection if handler failed or not available
            if (agentConnection && agentConnection.socket) {
                agentConnection.socket.emit('send-message', agentName, task);
                console.log(`[API] Task sent via socket to agent '${agentName}': ${task}`);
                return { success: true, method: 'socket' };
            }

            return { success: false, error: 'No communication method available for agent' };
        } catch (error) {
            console.error(`[API] Failed to send task to agent '${agentName}':`, error);
            return { success: false, error: error.message };
        }
    }

    // Get agent connection status
    getAgentConnectionStatus(agentName) {
        const connection = this.agentConnections[agentName];
        if (!connection) return 'not_found';
        if (connection.socket && connection.in_game) return 'online_in_game';
        if (connection.socket) return 'online';
        return 'offline';
    }

    // Send success response
    sendSuccess(res, data) {
        res.json({
            success: true,
            ...data
        });
    }

    // Send error response
    sendError(res, statusCode, message) {
        res.status(statusCode).json({
            success: false,
            error: message,
            timestamp: new Date().toISOString()
        });
    }

    // Get the Express router
    getRouter() {
        return this.router;
    }

    // Handle bot spawning
    // POST /api/spawn-bot
    // Body: { settings: object }
    async handleSpawnBot(req, res) {
        try {
            const { settings } = req.body;

            if (!settings || !settings.profile || !settings.profile.name) {
                return this.sendError(res, 400, 'Bot settings with profile name are required');
            }

            const botName = settings.profile.name;

            // Check if bot already exists
            if (this.agentHandler.hasAgent(botName)) {
                return this.sendError(res, 409, `Bot '${botName}' already exists`);
            }

            // Create the bot
            const result = this.agentHandler.createAgent(settings);

            if (result) {
                // Register the bot in connections
                this.agentConnections[botName] = {
                    name: botName,
                    in_game: false,
                    socket: null,
                    settings: settings  // Add the settings so they can be retrieved by get-settings
                };

                this.sendSuccess(res, {
                    message: `Bot '${botName}' spawned successfully`,
                    botName: botName,
                    status: 'initializing'
                });
            } else {
                this.sendError(res, 500, `Failed to spawn bot '${botName}'`);
            }

        } catch (error) {
            console.error('[API] Error in handleSpawnBot:', error);
            this.sendError(res, 500, 'Failed to spawn bot');
        }
    }

    // Handle bot dismissal
    // POST /api/dismiss-bot
    // Body: { botName: string }
    async handleDismissBot(req, res) {
        try {
            const { botName } = req.body;

            if (!botName) {
                return this.sendError(res, 400, 'Bot name is required');
            }

            // Check if bot exists
            if (!this.agentHandler.hasAgent(botName)) {
                return this.sendError(res, 404, `Bot '${botName}' not found`);
            }

            // Stop the bot
            this.agentHandler.stopAgent(botName);

            // Remove from connections
            if (this.agentConnections[botName]) {
                delete this.agentConnections[botName];
            }

            this.sendSuccess(res, {
                message: `Bot '${botName}' dismissed successfully`,
                botName: botName
            });

        } catch (error) {
            console.error('[API] Error in handleDismissBot:', error);
            this.sendError(res, 500, 'Failed to dismiss bot');
        }
    }

    // Handle hierarchical task delegation
    // POST /api/hierarchical/delegate
    async handleHierarchicalDelegate(req, res) {
        try {
            const { supervisorName, taskDescription } = req.body;

            if (!supervisorName || !taskDescription) {
                return this.sendError(res, 400, 'Missing required fields: supervisorName, taskDescription');
            }

            // Access the hierarchical bot manager from instance or global
            const hierarchicalManager = this.hierarchicalBotManager || global.kodecraftHierarchicalBotManager;

            if (!hierarchicalManager) {
                return this.sendError(res, 503, 'Hierarchical bot management system is not available');
            }

            console.log(`[API] Hierarchical delegation request from ${supervisorName}: ${taskDescription}`);

            const result = await hierarchicalManager.delegateTask(supervisorName, taskDescription);

            if (result.success) {
                this.sendSuccess(res, {
                    success: true,
                    workersAssigned: result.workersAssigned || [],
                    taskBreakdown: result.taskBreakdown || [],
                    message: result.message || 'Task delegated successfully'
                });
            } else {
                // For simple_task reason, return 200 with success: false
                if (result.reason === 'simple_task') {
                    console.log('[API] Task identified as simple, no delegation needed');
                    this.sendSuccess(res, {
                        success: false,
                        reason: result.reason,
                        error: result.reason,
                        message: result.message || 'This task can be handled personally'
                    });
                } else {
                    console.warn('[API] Delegation failed:', result && (result.error || result));
                    this.sendError(res, 400, result && result.error ? result.error : 'Failed to delegate task');
                }
            }

        } catch (error) {
            console.error('[API] Error in handleHierarchicalDelegate:', error);
            this.sendError(res, 500, 'Internal server error during task delegation');
        }
    }

    // Handle checking workers
    // POST /api/hierarchical/check-workers
    async handleCheckWorkers(req, res) {
        try {
            const { supervisorName } = req.body;
            const hierarchicalManager = this.hierarchicalBotManager || global.kodecraftHierarchicalBotManager;

            if (!hierarchicalManager) {
                return this.sendError(res, 503, 'Hierarchical bot management system is not available');
            }

            const result = await hierarchicalManager.checkWorkers(supervisorName);
            this.sendSuccess(res, result);
        } catch (error) {
            console.error('[API] Error in handleCheckWorkers:', error);
            this.sendError(res, 500, 'Internal server error');
        }
    }

    // Handle releasing a worker
    // POST /api/hierarchical/release-worker
    async handleReleaseWorker(req, res) {
        try {
            const { supervisorName, workerName } = req.body;
            const hierarchicalManager = this.hierarchicalBotManager || global.kodecraftHierarchicalBotManager;

            if (!hierarchicalManager) {
                return this.sendError(res, 503, 'Hierarchical bot management system is not available');
            }

            const result = await hierarchicalManager.releaseWorker(supervisorName, workerName);
            this.sendSuccess(res, result);
        } catch (error) {
            console.error('[API] Error in handleReleaseWorker:', error);
            this.sendError(res, 500, 'Internal server error');
        }
    }

    // Handle releasing all workers
    // POST /api/hierarchical/release-all-workers
    async handleReleaseAllWorkers(req, res) {
        try {
            const { supervisorName } = req.body;
            const hierarchicalManager = this.hierarchicalBotManager || global.kodecraftHierarchicalBotManager;

            if (!hierarchicalManager) {
                return this.sendError(res, 503, 'Hierarchical bot management system is not available');
            }

            const result = await hierarchicalManager.releaseAllWorkers(supervisorName);
            this.sendSuccess(res, result);
        } catch (error) {
            console.error('[API] Error in handleReleaseAllWorkers:', error);
            this.sendError(res, 500, 'Internal server error');
        }
    }

    // Handle assigning task to specific worker
    // POST /api/hierarchical/assign-task
    async handleAssignTask(req, res) {
        try {
            const { supervisorName, workerName, taskDescription } = req.body;
            const hierarchicalManager = this.hierarchicalBotManager || global.kodecraftHierarchicalBotManager;

            if (!hierarchicalManager) {
                return this.sendError(res, 503, 'Hierarchical bot management system is not available');
            }

            const result = await hierarchicalManager.assignTaskToWorker(supervisorName, workerName, taskDescription);
            this.sendSuccess(res, result);
        } catch (error) {
            console.error('[API] Error in handleAssignTask:', error);
            this.sendError(res, 500, 'Internal server error');
        }
    }

    // Handle listing available workers
    // POST /api/hierarchical/list-workers
    async handleListWorkers(req, res) {
        try {
            const { supervisorName } = req.body;
            const hierarchicalManager = this.hierarchicalBotManager || global.kodecraftHierarchicalBotManager;

            if (!hierarchicalManager) {
                return this.sendError(res, 503, 'Hierarchical bot management system is not available');
            }

            const result = await hierarchicalManager.listAvailableWorkers(supervisorName);
            this.sendSuccess(res, result);
        } catch (error) {
            console.error('[API] Error in handleListWorkers:', error);
            this.sendError(res, 500, 'Internal server error');
        }
    }

    // Handle spawning additional workers
    // POST /api/hierarchical/spawn-additional
    async handleSpawnAdditional(req, res) {
        try {
            const { supervisorName, workerCount, workerType } = req.body;
            const hierarchicalManager = this.hierarchicalBotManager || global.kodecraftHierarchicalBotManager;

            if (!hierarchicalManager) {
                return this.sendError(res, 503, 'Hierarchical bot management system is not available');
            }

            const result = await hierarchicalManager.spawnAdditionalWorkers(supervisorName, workerCount, workerType);
            this.sendSuccess(res, result);
        } catch (error) {
            console.error('[API] Error in handleSpawnAdditional:', error);
            this.sendError(res, 500, 'Internal server error');
        }
    }

    // Handle spawning workers and delegating task in one step
    // POST /api/hierarchical/spawn-and-delegate
    async handleSpawnAndDelegate(req, res) {
        try {
            const { supervisorName, taskDescription, workerCount, workerType } = req.body;

            if (!supervisorName || !taskDescription) {
                return this.sendError(res, 400, 'Missing required fields: supervisorName, taskDescription');
            }

            const hierarchicalManager = this.hierarchicalBotManager || global.kodecraftHierarchicalBotManager;

            if (!hierarchicalManager) {
                return this.sendError(res, 503, 'Hierarchical bot management system is not available');
            }

            console.log(`[API] Spawn and delegate request from ${supervisorName}: ${taskDescription} with ${workerCount || 'auto'} ${workerType || 'auto'} workers`);

            const result = await hierarchicalManager.spawnAndDelegateTask(
                supervisorName,
                taskDescription,
                workerCount,
                workerType
            );

            if (result.success) {
                this.sendSuccess(res, {
                    success: true,
                    workersAssigned: result.workersAssigned || [],
                    taskBreakdown: result.taskBreakdown || [],
                    message: result.message || 'Workers spawned and task delegated successfully'
                });
            } else {
                // Handle different failure reasons
                if (result.reason === 'simple_task') {
                    this.sendSuccess(res, {
                        success: false,
                        reason: result.reason,
                        message: result.message || 'This task can be handled personally'
                    });
                } else {
                    this.sendError(res, 400, result.message || result.reason || 'Failed to spawn and delegate task');
                }
            }

        } catch (error) {
            console.error('[API] Error in handleSpawnAndDelegate:', error);
            this.sendError(res, 500, 'Internal server error during spawn and delegate');
        }
    }
}