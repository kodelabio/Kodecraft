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
        this.app.get('/api/bots/list', this.handleBotsList.bind(this));
        
    }

    async handleInitBot(req, res) {
        try {
            const { userId, botName } = req.body;

            if (!userId || !botName) {
                return res.status(400).json({
                    error: 'userId and botName required'
                });
            }

            // ✅ NEW: Normalize userId to string immediately
            const normalizedUserId = String(userId);
            
            console.log(`[APIServer] Init bot request - userId: ${normalizedUserId} (type: ${typeof normalizedUserId}), botName: ${botName}`);

            const result = await leaderBotManager.getOrSpawnLeaderBot(normalizedUserId, botName);
            
            // ✅ Debug: Show what got stored
            console.log(`[APIServer] Spawn result:`, result);
            console.log(`[APIServer] LeaderBots map now contains:`, Array.from(leaderBotManager.leaderBots.keys()));
            
            if (result.success) {
                res.json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async handleBotsList(req, res) {
        try {
            const allBots = [];
            
            for (const [userId, info] of leaderBotManager.leaderBots.entries()) {
                //console.log(`[APIServer] Bot info:`, info);  // ✅ ADD THIS
                //console.log(`[APIServer] Agent name:`, info.agent?.name);  // ✅ ADD THIS
                
                allBots.push({
                    userId: userId,
                    botName: info.botName,
                    port: info.port,
                    running: info.running
                });
            }
            
            res.json({
                success: true,
                leaderBots: allBots,
                totalLeaderBots: allBots.length
            });
        } catch (error) {
            console.error(`[APIServer] Error in handleBotsList:`, error);
            res.status(500).json({ error: error.message });
        }
}

    async handleAgentRequest(req, res) {
        try {
            let userId = String(req.params.userId); 

            console.log(`[APIServer] Agent request from user ${userId}`);
            console.log(`[APIServer] Full URL: ${req.originalUrl}`);
            const action = req.originalUrl.replace(`/api/agent/${userId}`, '');

            console.log(`[APIServer] Action: ${action}`);

            const port = leaderBotManager.getLeaderBotPort(userId);
            console.log(`[APIServer] Found port for user ${userId}: ${port}`);
            
            if (!port) {
                console.warn(`[APIServer] No bot found for user ${userId}`);
                console.log(`[APIServer] Available bots:`, Array.from(leaderBotManager.leaderBots.keys()));
                return res.status(404).json({ error: 'User bot not found' });
            }

            const fullUrl = `http://localhost:${port}/api/agent${action}`;
            console.log(`[APIServer] Forwarding to: ${fullUrl}`);

            const response = await fetch(fullUrl, {
                method: req.method,
                headers: { 'Content-Type': 'application/json' },
                body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
                timeout: 60000
            });

            const data = await response.json();
            console.log(`[APIServer] Response status: ${response.status}`);
            res.status(response.status).json(data);
        } catch (error) {
            console.error(`[APIServer] Error in handleAgentRequest:`, error);
            res.status(500).json({ error: error.message });
        }
    }

    async handleOrchestrationRequest(req, res) {
        try {
            const { userId } = req.params;
            // Use originalUrl and strip the gateway prefix correctly
            const action = req.originalUrl.replace(`/api/orchestration/${userId}`, '');

            const port = leaderBotManager.getLeaderBotPort(userId);
            if (!port) {
                return res.status(404).json({ error: 'User bot not found' });
            }

            console.log(`[APIServer] Forwarding orchestration request: ${action} to port ${port}`);

            const response = await fetch(`http://localhost:${port}/api/orchestration${action}`, {
                method: req.method,
                headers: { 'Content-Type': 'application/json' },
                body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
                timeout: 60000
            });

            const data = await response.json();
            res.status(response.status).json(data);
        } catch (error) {
            console.error(`[APIServer] Orchestration error:`, error);
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