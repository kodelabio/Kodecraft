// src/agent/api_server.js
// Simple gateway router - forwards requests to appropriate leader bot's external_api
import { globalRealmManager } from './realm_manager.js';

import express from 'express';
import { leaderBotManager } from '../agent/leader_bot_manager.js';
import settings from './settings.js';


export class APIServer {
    constructor() {
        this.app = express();
        this.app.use(express.json({ limit: '2mb' }));
        this.app.use(express.urlencoded({ limit: '2mb', extended: true }));
        this.worldInfo = null;
        this.leaderBotManager = leaderBotManager; // this is instantiated in /agent/leader_bot_manager.js
        this.globalRealmManager = globalRealmManager; // Use the shared globalRealmManager
        
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

        // Realm management endpoints - moved to n8n
        this.app.get('/api/admin/world-bounds', this.handleWorldBound.bind(this));
        //this.app.post('/api/admin/realm/allocate', this.handleAllocateRealm.bind(this));
        //this.app.post('/api/admin/realm/define', this.handleDefineRealm.bind(this));
        //this.app.get('/api/admin/realm/:realmId', this.handleGetRealm.bind(this));
        //this.app.get('/api/admin/realms', this.handleListRealms.bind(this));
        
    }

    async handleWorldBound(req, res) {
        try {
            if (!globalRealmManager || !globalRealmManager.worldBounds) {
                return res.status(503).json({
                    error: 'World bounds not initialized',
                    code: 'world_not_initialized'
                });
            }
            
            res.json({
                success: true,
                worldBounds: globalRealmManager.worldBounds,
                worldInfo: {
                    type: globalRealmManager.worldInfo?.worldType,
                    minY: globalRealmManager.worldInfo?.minY,
                    maxY: globalRealmManager.worldInfo?.maxY
                }
            });
        } catch (error) {
            console.error(`[APIServer] Error in handleWorldBounds:`, error);
            res.status(500).json({ error: error.message });
        }
    }

    // In APIServer
    async initializeWorldInfo(userId) {
        try {
            const botInfo = this.leaderBotManager.getLeaderBotForUser(userId);
            if (!botInfo) {
                console.warn(`⚠️  Bot not found for user ${userId}`);
                return false;
            }
            
            const port = settings.api_gateway_port || 3000; 
            const url = `http://localhost:${port}/api/agent/${userId}/world-info`;
            
            //console.log(`[APIServer] 📡 Fetching world info from: ${url}`);
            
            const response = await fetch(url);
            //console.log(`[APIServer] Response status: ${response.status}`);
            //console.log(`[APIServer] Response headers:`, response.headers);
            
            const text = await response.text();
            //console.log(`[APIServer] World Info: ${text.substring(0, 500)}`);
            
            if (!response.ok) {
                console.error(`[APIServer] ❌ HTTP ${response.status}: ${text.substring(0, 200)}`);
                return false;
            }
            
            let worldData;
            try {
                worldData = JSON.parse(text);
            } catch (parseError) {
                console.error(`[APIServer] ❌ JSON parse error:`, parseError.message);
                console.error(`[APIServer] Raw response:`, text);
                return false;
            }
            
            if (worldData.success) {
                this.globalRealmManager.worldInfo = worldData;
                this.globalRealmManager.initializeWorldBounds();
                console.log(`✅ RealmManager initialized with world info`);
                console.log(`   World type: ${worldData.worldType}`);
                console.log(`   Bounds: X[${this.globalRealmManager.worldBounds.minX}, ${this.globalRealmManager.worldBounds.maxX}]`);
                return true;
            } else {
                console.warn(`⚠️  World info returned success=false`);
                return false;
            }
        } catch (error) {
            console.error(`[APIServer] ❌ Error fetching world info:`, error.message);
            console.error(`[APIServer] Stack:`, error.stack);
            return false;
        }
    }

    async handleInitBot(req, res) {
        const startTime = Date.now();
        try {
            const { userId, botName, playerPosition, realmId, realmBounds } = req.body;
            console.log(`[APIServer] 📝 Init bot request`);
            //console.log(`   userId: ${userId} (${typeof userId}), botName: ${botName}`);
            //console.log(`   playerPosition: ${playerPosition ? `(${playerPosition.x}, ${playerPosition.y}, ${playerPosition.z})` : 'not provided'}`);
            console.log(`   realmId: ${realmId || 'not provided'}`);
            console.log(`   realmBounds: ${realmBounds ? JSON.stringify(realmBounds) : 'not provided'}`);


            if (!userId || !botName) {
                console.warn(`[APIServer] ⚠️  Missing params`);
                return res.status(400).json({ error: 'userId and botName required' });
            }
            
            let spawnPosition = playerPosition;
            // If playerPosition provided, validate it's within realm bounds
            if (spawnPosition && realmBounds) {
                const validation = globalRealmManager.validateMovement(spawnPosition, realmBounds);
                
                if (!validation.valid) {
                    console.warn(`[APIServer] ⚠️ playerPosition outside realm, correcting to closest point`);
                    spawnPosition = this.getClosestPositionInRealm(spawnPosition, realmBounds);
                    console.log(`[APIServer] Corrected position: ${JSON.stringify(spawnPosition)}`);
                }
            }

            // If no position provided, use a random position within realm
            if (!spawnPosition && realmBounds) {
                spawnPosition = globalRealmManager.getRandomPosInRealm(realmBounds, globalRealmManager.worldInfo?.worldType );
                console.log(`[APIServer] Generated random position: ${JSON.stringify(spawnPosition)}`);
            }

            
            const normalizedUserId = String(userId);
            //console.log(`[APIServer] ✓ Normalized: ${normalizedUserId}, map size: ${leaderBotManager.leaderBots.size}/${settings.max_leader_bots}`);
            //console.log(`[APIServer] Current users: ${Array.from(leaderBotManager.leaderBots.keys()).join(', ')}`);
            
            // Check if this specific bot already exists
            const botExists = this.leaderBotManager.getLeaderBotForUser(normalizedUserId);
            // Spawn bot (reuses if exists, creates if doesn't)
            const result = await leaderBotManager.getOrSpawnLeaderBot(
                normalizedUserId, 
                botName, 
                spawnPosition, 
                realmId || null);
            //const duration = Date.now() - startTime;
            //console.log(`[APIServer] ✓ Completed in ${duration}ms - success: ${result.success}, port: ${result.port}`);
            // Only initialize world info if this is a NEW bot spawn (not rejoin)
            if (result.success && !botExists && !this.globalRealmManager.worldInfo) {
                console.log(`[APIServer] 🌍 New bot connected, initializing world info...`);
                await this.initializeWorldInfo(normalizedUserId);

                try {
                    const port = settings.api_gateway_port || 3000; 
                    const setRealmResult = await fetch(`http://localhost:${port}/api/agent/${normalizedUserId}/init-realm`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            realmId: realmId,
                            bounds: realmBounds,
                            userId: normalizedUserId 
                        }),
                        timeout: 5000
                    });
                    
                    if (setRealmResult.ok) {
                        console.log(`✓ Leader realm initialized: ${realmId}`);
                        console.log(`  Bounds: X[${realmBounds.minX}, ${realmBounds.maxX}], Z[${realmBounds.minZ}, ${realmBounds.maxZ}]`);
                    } else {
                        console.warn(`⚠️ Failed to set realm on leader bot`);
                    }
                } catch (error) {
                    console.error(`Failed to set realm bounds on leader:`, error.message);
                }
            }

            res.status(result.success ? 200 : 500).json(result);
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`[APIServer] 💥 Exception (${duration}ms): ${error.message}`);
            console.error(error.stack);
            res.status(500).json({ error: error.message, code: 'init_exception' });
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

            //console.log(`[APIServer] Agent request from user ${userId}`);
            //console.log(`[APIServer] Full URL: ${req.originalUrl}`);
            const action = req.originalUrl.replace(`/api/agent/${userId}`, '');

            //console.log(`[APIServer] Action: ${action}`);

            const port = leaderBotManager.getLeaderBotPort(userId);
            //console.log(`[APIServer] Found port for user ${userId}: ${port}`);
            
            if (!port) {
                console.warn(`[APIServer] No bot found for user ${userId}`);
                //console.log(`[APIServer] Available bots:`, Array.from(leaderBotManager.leaderBots.keys()));
                return res.status(404).json({ error: 'User bot not found' });
            }

            const fullUrl = `http://localhost:${port}/api/agent${action}`;
            //console.log(`[APIServer] Forwarding to: ${fullUrl}`);

            const response = await fetch(fullUrl, {
                method: req.method,
                headers: { 'Content-Type': 'application/json' },
                body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
                timeout: 600000
            });

            let data;
            const contentType = response.headers.get('content-type');

            if (contentType?.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                console.error(`[APIServer] Non-JSON response from ${fullUrl}`);
                console.error(`   Status: ${response.status}`);
                console.error(`   Content-Type: ${contentType}`);
                console.error(`   Body: ${text.substring(0, 500)}`);
                return res.status(502).json({
                    error: 'Worker API returned invalid response',
                    workerPort: port,
                    status: response.status
                });
            }
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

            //console.log(`[APIServer] Forwarding orchestration request: ${action} to port ${port}`);
            const body = req.method !== 'GET' ? {
                ...req.body,
                userId: userId  // Pass userId in body
            } : undefined;

            const response = await fetch(`http://localhost:${port}/api/orchestration${action}`, {
                method: req.method,
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
                timeout: 600000
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

    // Realm management endpoints
    // REPLACED BY n8n WORKFLOWS
    /*
    async handleAllocateRealm(req, res) {
        try {
            const { userId, leader_pr_value } = req.body;
            
            if (!userId || leader_pr_value === undefined) {
                return res.status(400).json({
                    error: 'userId and leader_pr_value required'
                });
            }
            
            if (!this.globalRealmManager) {
                return res.status(503).json({
                    error: 'RealmManager not initialized - no bot connected yet',
                    code: 'realm_manager_not_ready'
                });
            }
            console.log(`[APIServer] globalRealmManager id:`, this.globalRealmManager);
            console.log(`[APIServer] Realms after allocation:`, this.globalRealmManager.realms.size);
            
            // Calculate realm size based on leader priority
            const realmSize = this.globalRealmManager.calculateRealmSize(leader_pr_value);
            console.log(`[APIServer] Allocating realm for user ${userId}: size=${realmSize}`);
            
            // Find available space
            const bounds = this.globalRealmManager.findAvailableRealmSpace(realmSize);
            
            if (!bounds) {
                return res.status(400).json({
                    error: 'No available space for realm',
                    code: 'no_space'
                });
            }
            
            // Create realm
            const realmId = `realm_${userId}_${Date.now()}`;
            this.globalRealmManager.defineRealm(realmId, userId, bounds);
            
            console.log(`✅ Realm allocated for user ${userId}`);
            console.log(`   realmId: ${realmId}`);
            console.log(`   bounds: X[${bounds.minX}, ${bounds.maxX}] Z[${bounds.minZ}, ${bounds.maxZ}]`);
            
            res.status(201).json({
                success: true,
                realmId: realmId,
                userId: userId,
                bounds: bounds,
                size: realmSize,
                message: `Realm allocated for user ${userId}`
            });
        } catch (error) {
            console.error(`[APIServer] Error allocating realm:`, error);
            res.status(500).json({ error: error.message });
        }
    }

    

    async handleDefineRealm(req, res) {
        try {
            const { realmId, minX, maxX, minZ, maxZ, minY = -64, maxY = 320 } = req.body;
            
            if (!realmId || minX === undefined || maxX === undefined || minZ === undefined || maxZ === undefined) {
                return res.status(400).json({
                    error: 'realmId, minX, maxX, minZ, maxZ required',
                    code: 'missing_parameters'
                });
            }
            
            if (!this.globalRealmManager) {
                return res.status(503).json({
                    error: 'RealmManager not initialized',
                    code: 'realm_manager_not_ready'
                });
            }
            
            const bounds = { minX, maxX, minZ, maxZ, minY, maxY };
            
            this.globalRealmManager.defineRealm(realmId, null, bounds);
            
            console.log(`✅ Realm '${realmId}' defined`);
            console.log(`   Bounds: X[${minX}, ${maxX}] Z[${minZ}, ${maxZ}]`);
            
            res.status(201).json({
                success: true,
                realmId: realmId,
                bounds: bounds,
                message: `Realm ${realmId} defined`
            });
        } catch (error) {
            console.error(`[APIServer] Error defining realm:`, error);
            res.status(500).json({ error: error.message });
        }
    }

    async handleGetRealm(req, res) {
        try {
            const { realmId } = req.params;
            
            if (!this.globalRealmManager) {
                return res.status(503).json({ error: 'RealmManager not initialized' });
            }
            console.log(`[APIServer] globalRealmManager:`, this.globalRealmManager);
            const realm = this.globalRealmManager.realms.get(realmId);
            if (!realm) {
                return res.status(404).json({ error: `Realm ${realmId} not found` });
            }
            
            res.json({ success: true, realm: realm });
        } catch (error) {
            console.error(`[APIServer] Error in handleGetRealm:`, error);
            res.status(500).json({ error: error.message });
        }
    }

    async handleListRealms(req, res) {
        try {
            // Just return realms from globalRealmManager directly (no bot fetch needed)
            if (!this.globalRealmManager) {
                return res.status(503).json({ error: 'RealmManager not initialized' });
            }
            
            const realms = Array.from(this.globalRealmManager.realms.entries()).map(([id, realm]) => ({
                realmId: id,
                bounds: realm.bounds,
                leaderId: realm.leaderId
            }));
            
            res.json({ success: true, realms: realms });
        } catch (error) {
            console.error(`[APIServer] Error in handleListRealms:`, error);
            res.status(500).json({ error: error.message });
        }
}


*/

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

//export const apiServer = new APIServer();