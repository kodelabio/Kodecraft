// src/agent/api_server.js
// Simple gateway router - forwards requests to appropriate leader bot's external_api

import express from 'express';
import { leaderBotManager } from '../agent/leader_bot_manager.js';
import settings from '../../settings.js';

export class APIServer {
    constructor() {
        this.app = express();
        this.app.use(express.json());
        
        // CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        this.setupRoutes();
    }

    setupRoutes() {
        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'ok', service: 'api-gateway' });
        });

        // Initialize bot for user
        this.app.post('/api/user/init-bot', this.handleInitBot.bind(this));

        // Proxy all agent requests to user's bot
        this.app.all('/api/agent/:userId/*', this.handleAgentRequest.bind(this));

        // Proxy all orchestration requests to user's bot
        this.app.all('/api/orchestration/:userId/*', this.handleOrchestrationRequest.bind(this));

        // Admin endpoints
        this.app.get('/api/admin/status', this.handleStatus.bind(this));
        this.app.post('/api/admin/stop-bot/:userId', this.handleStopBot.bind(this));
        this.app.post('/api/admin/stop-all', this.handleStopAll.bind(this));
    }

    async handleInitBot(req, res) {
        try {
            const { userId, botName } = req.body;

            if (!userId || !botName) {
                return res.status(400).json({
                    error: 'userId and botName required'
                });
            }

            const result = await leaderBotManager.getOrSpawnLeaderBot(userId, botName);

            if (result.success) {
                res.json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async handleAgentRequest(req, res) {
        try {
            const { userId } = req.params;
            const action = req.baseUrl.replace(`/api/agent/${userId}`, '');

            const port = leaderBotManager.getLeaderBotPort(userId);
            if (!port) {
                return res.status(404).json({ error: 'User bot not found' });
            }

            const response = await fetch(`http://localhost:${port}/api/agent${action}`, {
                method: req.method,
                headers: { 'Content-Type': 'application/json' },
                body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
                timeout: 60000
            });

            const data = await response.json();
            res.status(response.status).json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async handleOrchestrationRequest(req, res) {
        try {
            const { userId } = req.params;
            const action = req.baseUrl.replace(`/api/orchestration/${userId}`, '');

            const port = leaderBotManager.getLeaderBotPort(userId);
            if (!port) {
                return res.status(404).json({ error: 'User bot not found' });
            }

            const response = await fetch(`http://localhost:${port}/api/orchestration${action}`, {
                method: req.method,
                headers: { 'Content-Type': 'application/json' },
                body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
                timeout: 60000
            });

            const data = await response.json();
            res.status(response.status).json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async handleStatus(req, res) {
        try {
            const status = leaderBotManager.getStatus();
            res.json(status);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async handleStopBot(req, res) {
        try {
            const { userId } = req.params;
            const info = leaderBotManager.getLeaderBotForUser(userId);
            
            if (!info) {
                return res.status(404).json({ error: 'User bot not found' });
            }

            info.agentProcess.stop();
            res.json({ success: true, message: `Bot for user ${userId} stopped` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async handleStopAll(req, res) {
        try {
            const result = await leaderBotManager.stopAllLeaderBots();
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    start(port) {
        const apiPort = port || settings.api_gateway_port;
        return new Promise((resolve) => {
            this.server = this.app.listen(apiPort, () => {
                console.log(`[APIServer] 🚀 API Gateway listening on port ${apiPort}`);
                resolve();
            });
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}

export const apiServer = new APIServer();