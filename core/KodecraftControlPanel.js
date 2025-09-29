import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { projectRoot } from '../paths.js';

const specPath = path.join(projectRoot, 'core/public/settings_spec.json');

export class KodecraftControlPanel {
    agentHandler;
    settingsSpec;
    server;
    io;
    agentConnections = {};
    // Simple in-memory message/event log for external integrations (Telegram polling)
    messageLog = [];
    nextMessageId = 1;

    constructor(config, agentHandler) {
        this.config = config;
        this.agentHandler = agentHandler;

        this.agentHandler.on('agentOffline', (agentName) => {
            this.handleAgentOffline(agentName);
        });

        const specPath = path.join(projectRoot, 'core/public/settings_spec.json');
        this.settingsSpec = JSON.parse(readFileSync(specPath, 'utf8'));
    }

    async startServer() {
        const app = express();
        this.server = http.createServer(app);
        this.io = new Server(this.server);

        app.use(express.static(path.join(projectRoot, 'core/public')));
        
        // Add JSON parsing middleware
        app.use(express.json());
        
        // Add command endpoint for Telegram integration
        app.post('/command', async (req, res) => {
            try {
                const { user, command } = req.body;
                
                if (!user || !command) {
                    return res.status(400).json({
                        status: 'error',
                        reply: 'Missing user or command in request body'
                    });
                }
                
                // Find Kid agent
                const kidAgent = this.agentConnections['Kid'];
                if (!kidAgent || !kidAgent.socket) {
                    return res.status(500).json({
                        status: 'error',
                        reply: 'Kid bot is not connected'
                    });
                }
                
                // Send command to Kid agent and wait for response
                const reply = await this.sendCommandToAgent('Kid', user, command);
                
                res.json({
                    status: 'success',
                    reply: reply || 'Command executed successfully'
                });
                
            } catch (error) {
                console.error('Error handling command:', error);
                res.status(500).json({
                    status: 'error',
                    reply: `Internal error: ${error.message}`
                });
            }
        });

        // Fetch new updates since last id (polling friendly for n8n/Telegram)
        // GET /updates?since=123  -> returns { lastId, items: [...] }
        app.get('/updates', (req, res) => {
            const since = parseInt(req.query.since, 10) || 0;
            const items = this.messageLog.filter(m => m.id > since);
            res.json({ lastId: this.nextMessageId - 1, items });
        });

        this.io.on('connection', (socket) => this.handleSocket(socket));

        const host = this.config.host_public ? '0.0.0.0' : 'localhost';
        const port = this.config.mindserver_port || 8080;

        this.server.listen(port, host, () => {
            console.log(`KodecraftDashboard running on http://${host}:${port}`);
        });
    }

    registerAgent(agentInfo) {
        this.agentConnections[agentInfo.name] = {
            socket: null,
            settings: agentInfo.settings,
            in_game: false,
            process: agentInfo.process,
        };
    }

    handleAgentOffline(agentName) {
        const conn = this.agentConnections[agentName];
        if (conn) {
            conn.in_game = false;
            this.sendAgentList();
        }
    }

    handleSocket(socket) {
        let curAgentName = null;
        console.log('Client connected');

        this.sendAgentList(socket);

        socket.on('create-agent', (settings, callback) => {
            console.log('API create agent...');
            const result = this.validateSettings(settings);
            if (!result.valid) {
                callback({ success: false, error: result.error });
                return;
            }

            const agentName = settings.profile?.name;
            if (this.agentConnections[agentName]) {
                callback({ success: false, error: 'Agent already exists' });
                return;
            }

            this.agentHandler.createAgent(settings);
            this.agentConnections[agentName] = {
                socket: null,
                settings,
                in_game: false
            };
            callback({ success: true });
        });

        socket.on('get-settings', (agentName, callback) => {
            const conn = this.agentConnections[agentName];
            callback(conn ? { settings: conn.settings } : { error: `Agent '${agentName}' not found.` });
        });

        socket.on('login-agent', (agentName) => {
            const conn = this.agentConnections[agentName];
            if (!conn) {
                console.warn(`Unregistered agent ${agentName} tried to login`);
                return;
            }
            conn.socket = socket;
            conn.in_game = true;
            curAgentName = agentName;
            this.sendAgentList();
        });

        socket.on('disconnect', () => {
            if (curAgentName && this.agentConnections[curAgentName]) {
                console.log(`Agent ${curAgentName} disconnected`);
                this.agentConnections[curAgentName].in_game = false;
                this.sendAgentList();
            }
        });

        socket.on('chat-message', (targetName, json) => {
            const target = this.agentConnections[targetName];
            if (!target || !target.socket) {
                console.warn(`Chat target ${targetName} not available`);
                return;
            }
            console.log(`${curAgentName} → ${targetName}: ${json.message}`);
            target.socket.emit('chat-message', curAgentName, json);

            // Record chat event (direction: from curAgentName to targetName)
            this.recordEvent('chat', {
                from: curAgentName,
                to: targetName,
                message: json.message
            });

            // Simple heuristic: detect completion / progress keywords for status feed
            const lower = (json.message || '').toLowerCase();
            if (/(build complete|completed|task done|foundation finished|roof complete|walls complete)/.test(lower)) {
                this.recordEvent('status', {
                    from: curAgentName,
                    to: targetName,
                    message: json.message,
                    status: 'detected'
                });
            }
        });

        socket.on('restart-agent', (agentName) => {
            const conn = this.agentConnections[agentName];
            if (conn && conn.socket) conn.socket.emit('restart-agent');
        });

        socket.on('start-agent', (agentName) => this.agentHandler.startAgent(agentName));
        socket.on('stop-agent', (agentName) => this.agentHandler.stopAgent(agentName));

        socket.on('stop-all-agents', () => {
            console.log('Killing all agents');
            Object.keys(this.agentConnections).forEach(name => this.agentHandler.stopAgent(name));
        });

        socket.on('shutdown', () => {
            console.log('Shutting down');
            this.agentHandler.shutdown();
        });

        socket.on('send-message', (agentName, message) => {
            const conn = this.agentConnections[agentName];
            if (!conn || !conn.socket) {
                console.warn(`Agent ${agentName} not available for messaging`);
                return;
            }
            console.log(`Sending message to ${agentName}: ${message}`);
            conn.socket.emit('send-message', agentName, message);
        });

        socket.on('collaborative-command', async (request) => {
            const { requestId, command, data, agentName } = request;
            
            try {
                const collaborativeManager = this.kodecraftManager?.collaborativeManager;
                if (!collaborativeManager) {
                    socket.emit(`collab-response-${requestId}`, {
                        success: false,
                        error: 'Collaborative manager not available'
                    });
                    return;
                }

                let result;
                switch (command) {
                    case 'spawn':
                        result = collaborativeManager.spawnWorkerBots(data.count, data.baseSettings);
                        
                        // If spawn location provided, teleport workers there after a delay
                        if (data.spawnLocation && result.length > 0) {
                            setTimeout(() => {
                                const workerNames = result.map(bot => bot.name);
                                collaborativeManager.teleportWorkersToLocationWithRetry(workerNames, data.spawnLocation);
                            }, 2000); // 2 second delay, then dynamically wait for workers to be ready
                        }
                        
                        socket.emit(`collab-response-${requestId}`, {
                            success: true,
                            data: { spawnedBots: result }
                        });
                        break;

                    case 'getStatus':
                        result = collaborativeManager.getStatus();
                        socket.emit(`collab-response-${requestId}`, {
                            success: true,
                            data: result
                        });
                        break;

                    case 'stopAllWorkers':
                        collaborativeManager.stopAllWorkers();
                        socket.emit(`collab-response-${requestId}`, {
                            success: true,
                            data: { message: 'All workers stopped' }
                        });
                        break;

                    case 'teleportWorkers':
                        const workers = collaborativeManager.getWorkerBots();
                        const workerNames = workers.map(w => w.name);
                        if (data.useRetry) {
                            collaborativeManager.teleportWorkersToLocationWithRetry(workerNames, data.location);
                        } else {
                            collaborativeManager.teleportWorkersToLocation(workerNames, data.location);
                        }
                        socket.emit(`collab-response-${requestId}`, {
                            success: true,
                            data: { message: `Teleporting ${workerNames.length} workers`, workers: workerNames }
                        });
                        break;

                    case 'startWallTask':
                        result = collaborativeManager.startCollaborativeWallTask(data.workers, data.wallSpec);
                        socket.emit(`collab-response-${requestId}`, {
                            success: true,
                            data: { taskId: result }
                        });
                        break;

                    case 'sendMessageToWorker':
                        collaborativeManager.sendMessageToWorker(data.workerName, data.message);
                        socket.emit(`collab-response-${requestId}`, {
                            success: true,
                            data: { message: `Message sent to ${data.workerName}` }
                        });
                        break;

                    case 'sendImprovedBuildTask':
                        collaborativeManager.sendImprovedBuildTask(data.workerName, data.section, data.material);
                        socket.emit(`collab-response-${requestId}`, {
                            success: true,
                            data: { message: `Improved build task sent to ${data.workerName}` }
                        });
                        break;

                    default:
                        socket.emit(`collab-response-${requestId}`, {
                            success: false,
                            error: `Unknown collaborative command: ${command}`
                        });
                }
            } catch (error) {
                console.error('Error handling collaborative command:', error);
                socket.emit(`collab-response-${requestId}`, {
                    success: false,
                    error: error.message
                });
            }
        });
    }

    validateSettings(settings) {
        for (let key in this.settingsSpec) {
            if (!(key in settings)) {
                if (this.settingsSpec[key].required) {
                    return { valid: false, error: `Setting ${key} is required` };
                }
                settings[key] = this.settingsSpec[key].default;
            }
        }

        for (let key in settings) {
            if (!(key in this.settingsSpec)) {
                delete settings[key];
            }
        }

        if (!settings.profile?.name) {
            return { valid: false, error: 'Agent name is required in profile' };
        }

        return { valid: true };
    }

    sendAgentList(targetSocket = null) {
        const list = Object.entries(this.agentConnections).map(([name, conn]) => ({
            name,
            in_game: conn.in_game,
        }));

        if (targetSocket) {
            targetSocket.emit('agents-update', list);
        } else {
            this.io.emit('agents-update', list);
        }
    }

    /**
     * Send command to agent and wait for response (for HTTP API)
     * @param {string} agentName - Name of the agent
     * @param {string} user - Username sending the command
     * @param {string} command - Command to send
     * @returns {Promise<string>} Agent's response
     */
    async sendCommandToAgent(agentName, user, command) {
        const conn = this.agentConnections[agentName];
        if (!conn || !conn.socket) {
            throw new Error(`Agent ${agentName} is not connected`);
        }

        // For now, just send the message and return a simple confirmation
        // In the future, we can implement proper response capturing
        const message = `${user}: ${command}`;
        console.log(`HTTP API sending to ${agentName}: ${message}`);
        conn.socket.emit('send-message', agentName, message);
        
        // Return a simple confirmation for now
        this.recordEvent('command', { user, agent: agentName, command });
        return `Command "${command}" sent to ${agentName}`;
    }

    /**
     * Record an event/message in the integration log
     * @param {string} type - Type of event (chat|command|taskAssigned|improvedTaskAssigned|status)
     * @param {Object} data - Payload
     */
    recordEvent(type, data) {
        const entry = {
            id: this.nextMessageId++,
            ts: Date.now(),
            type,
            ...data
        };
        this.messageLog.push(entry);
        // Keep memory bounded
        if (this.messageLog.length > 500) {
            this.messageLog.splice(0, this.messageLog.length - 500);
        }
        return entry;
    }
}