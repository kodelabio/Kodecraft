import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import { ActionGuard } from './actionGuard.js';
import { ErrorMapper } from './errorMap.js';
import * as skills from '../src/agent/library/skills.js';
import * as world from '../src/agent/library/world.js';
import settings from '../settings.js';
import { readFileSync } from 'fs';
import { agentRegistry, getBotForExecutor } from '../src/agent/agent_registry.js';
import * as Mindcraft from '../src/mindcraft/mindcraft.js';

class BotExecutorServer {
    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.io = new SocketIO(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.agent = null;
        this.bot = null;
        this.botInfo = null;
        this.actionGuard = new ActionGuard();
        this.errorMapper = new ErrorMapper();
        this.mindserverInitialized = false;
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.stateInterval = null;
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        this.app.get('/api/agent/status', this.getStatus.bind(this));
        this.app.post('/api/agent/move', this.move.bind(this));
        this.app.post('/api/agent/collect', this.collect.bind(this));
        this.app.post('/api/agent/place', this.place.bind(this));
        this.app.post('/api/agent/break', this.breakBlock.bind(this));
        this.app.post('/api/agent/chat', this.chat.bind(this));
    }

    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log('Client connected to WebSocket');
            socket.on('disconnect', () => {
                console.log('Client disconnected from WebSocket');
            });
        });
    }

    async ensureBotInitialized() {
        // First, try to attach to existing agent/bot
        const existingBot = getBotForExecutor();
        if (existingBot) {
            console.log(`[Executor] Attaching to existing agent: ${existingBot.name}`);
            this.botInfo = existingBot;
            this.agent = existingBot.agent;
            this.bot = existingBot.bot;
            this.setupBotEventHandlers();
            this.startStateEmission();
            return this.bot;
        }

        // No existing bot, create one using the same Agent initialization path
        console.log('[Executor] No existing agent found, creating new agent in-process');
        
        if (!this.mindserverInitialized) {
            console.log('[Executor] Initializing Mindcraft system...');
            await Mindcraft.init(false, settings.mindserver_port);
            this.mindserverInitialized = true;
        }

        // Use first profile or create a default one for executor
        let profileToUse = null;
        if (settings.profiles && settings.profiles.length > 0) {
            try {
                const profileData = JSON.parse(readFileSync(settings.profiles[0], 'utf8'));
                profileToUse = profileData.name; // Use original name, not _executor suffix
                console.log(`[Executor] Using profile name: ${profileToUse}`);
                
                // Create settings for the agent
                const agentSettings = {
                    ...settings,
                    profile: profileData, // Use original profile data
                    verbose_commands: false, // Clean chat output for executor
                    narrate_behavior: false // Less spam in executor mode
                };
                
                this.agent = await Mindcraft.createAgent(agentSettings, true); // inProcess = true
            } catch (error) {
                console.warn(`[Executor] Failed to use profile, falling back to default: ${error.message}`);
            }
        }

        if (!this.agent) {
            // Create default executor agent
            profileToUse = 'executor_bot';
            console.log(`[Executor] Using default agent name: ${profileToUse}`);
            
            const agentSettings = {
                ...settings,
                profile: {
                    name: profileToUse,
                    model: 'none' // No AI model needed for executor
                },
                verbose_commands: false, // Clean chat output for executor
                narrate_behavior: false // Less spam in executor mode
            };
            
            this.agent = await Mindcraft.createAgent(agentSettings, true); // inProcess = true
        }

        if (!this.agent || !this.agent.bot) {
            throw new Error('Failed to create agent or bot instance');
        }

        this.bot = this.agent.bot;
        this.botInfo = {
            agent: this.agent,
            bot: this.bot,
            name: this.agent.name
        };

        console.log(`[Executor] Agent created successfully: ${this.agent.name}`);
        
        // Wait for spawn if not already spawned
        if (!this.bot.entity) {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Bot spawn timeout')), 30000);
                
                this.bot.once('spawn', () => {
                    clearTimeout(timeout);
                    console.log(`[Executor] Bot spawned: ${this.agent.name}`);
                    this.setupBotEventHandlers();
                    this.startStateEmission();
                    resolve();
                });
                
                this.bot.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
        } else {
            this.setupBotEventHandlers();
            this.startStateEmission();
        }

        return this.bot;
    }

    setupBotEventHandlers() {
        if (!this.bot || this.bot._executorHandlersSetup) return;
        
        console.log('[Executor] Setting up bot event handlers for API');
        
        // Mark that we've set up handlers to avoid duplicates
        this.bot._executorHandlersSetup = true;

        // We DON'T override existing chat handlers - the Agent already handles them
        // Just add executor-specific event forwarding
        
        this.bot.on('error', (err) => {
            console.error('[Executor] Bot error:', err.message);
            this.io.emit('agent.error', {
                error: err.message,
                action: this.actionGuard.currentAction,
                code: 500,
                timestamp: Date.now()
            });
        });

        this.bot.on('end', () => {
            console.log('[Executor] Bot disconnected from server');
            this.io.emit('agent.disconnected', {
                reason: 'Connection ended',
                timestamp: Date.now()
            });
            this.bot = null;
            this.agent = null;
            this.botInfo = null;
        });

        this.bot.on('kicked', (reason) => {
            console.error('[Executor] Bot was kicked:', reason);
            this.io.emit('agent.error', {
                error: `Bot was kicked: ${reason}`,
                action: this.actionGuard.currentAction,
                code: 403,
                timestamp: Date.now()
            });
        });

        // Forward existing chat events (don't duplicate them)
        const originalRespondFunc = this.agent?.respondFunc;
        if (originalRespondFunc && !this.agent._executorChatForwarding) {
            this.agent._executorChatForwarding = true;
            
            // Wrap the original respond function to also emit to WebSocket
            const wrappedRespondFunc = async (username, message) => {
                // Emit to WebSocket first
                this.io.emit('agent.chat_received', {
                    sender: username,
                    message: message,
                    isWhisper: false,
                    timestamp: Date.now()
                });
                
                // Then call original handler
                return originalRespondFunc(username, message);
            };
            
            console.log('[Executor] Wrapped chat handler to forward to WebSocket');
        }
    }

    startStateEmission() {
        if (this.stateInterval) return;
        
        this.stateInterval = setInterval(() => {
            if (this.bot && this.bot.entity) {
                this.io.emit('agent.state', {
                    position: this.bot.entity.position,
                    health: this.bot.health,
                    food: this.bot.food,
                    inventoryChanged: false, 
                    isIdle: !this.actionGuard.isBusy(),
                    timestamp: Date.now()
                });
            }
        }, 2000);
    }

    async executeAction(actionName, actionFn) {
        if (this.actionGuard.isBusy()) {
            throw new Error('BUSY');
        }

        this.actionGuard.startAction(actionName);
        this.io.emit('agent.action_started', {
            action: actionName,
            timestamp: Date.now()
        });

        const startTime = Date.now();
        let result;
        
        try {
            result = await actionFn();
            const executionTime = Date.now() - startTime;
            
            this.io.emit('agent.action_completed', {
                action: actionName,
                success: true,
                message: result?.message || 'Action completed successfully',
                interrupted: false,
                timedout: false,
                executionTimeMs: executionTime,
                timestamp: Date.now()
            });
            
            return {
                success: true,
                message: result?.message || 'Action completed successfully',
                interrupted: false,
                timedout: false,
                executionTimeMs: executionTime
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const isTimeout = error.message === 'TIMEOUT';
            
            this.io.emit('agent.action_completed', {
                action: actionName,
                success: false,
                message: error.message,
                interrupted: false,
                timedout: isTimeout,
                executionTimeMs: executionTime,
                timestamp: Date.now()
            });
            
            throw error;
        } finally {
            this.actionGuard.endAction();
        }
    }

    async getStatus(req, res) {
        try {
            if (!this.bot) {
                // Return server status without bot connection
                return res.json({
                    success: true,
                    data: {
                        serverRunning: true,
                        botConnected: false,
                        agentAttached: false,
                        message: 'Executor server running, no bot/agent attached yet',
                        minecraftServer: `${settings.host}:${settings.port}`,
                        isIdle: !this.actionGuard.isBusy(),
                        currentAction: this.actionGuard.currentAction
                    },
                    timestamp: Date.now()
                });
            }

            const bot = await this.ensureBotInitialized();
            
            const response = {
                success: true,
                data: {
                    serverRunning: true,
                    botConnected: true,
                    agentAttached: !!this.agent,
                    agentName: this.botInfo?.name || 'unknown',
                    position: bot.entity.position,
                    health: bot.health,
                    food: bot.food,
                    gameMode: bot.game.gameMode,
                    dimension: bot.game.dimension,
                    time: {
                        day: bot.time.day,
                        timeOfDay: bot.time.timeOfDay
                    },
                    inventorySummary: world.getInventoryCounts(bot),
                    isIdle: !this.actionGuard.isBusy(),
                    currentAction: this.actionGuard.currentAction,
                    chatHandlersActive: !!this.agent?.respondFunc,
                    commandSystemActive: !!this.agent?.handleMessage
                },
                timestamp: Date.now()
            };
            
            res.json(response);
        } catch (error) {
            const { code, message } = this.errorMapper.mapError(error);
            res.status(code).json({ 
                success: false, 
                error: message,
                botConnected: false,
                agentAttached: false,
                serverRunning: true
            });
        }
    }

    async move(req, res) {
        try {
            const bot = await this.ensureBotInitialized();
            const { x, y, z, minDistance = 2 } = req.body;
            
            if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid coordinates: x, y, z must be numbers' 
                });
            }
            
            const startPos = bot.entity.position;
            console.log(`[Executor] Movement requested from ${startPos.x}, ${startPos.y}, ${startPos.z} to ${x}, ${y}, ${z}`);
            
            const result = await this.executeAction('move', async () => {
                const success = await skills.goToPosition(bot, x, y, z, minDistance);
                const endPos = bot.entity.position;
                const moved = Math.abs(startPos.x - endPos.x) > 0.1 || 
                             Math.abs(startPos.y - endPos.y) > 0.1 || 
                             Math.abs(startPos.z - endPos.z) > 0.1;
                
                console.log(`[Executor] Movement result: success=${success}, moved=${moved}, final pos: ${endPos.x}, ${endPos.y}, ${endPos.z}`);
                
                return { 
                    message: success 
                        ? `Moved from (${startPos.x.toFixed(1)}, ${startPos.y.toFixed(1)}, ${startPos.z.toFixed(1)}) to (${endPos.x.toFixed(1)}, ${endPos.y.toFixed(1)}, ${endPos.z.toFixed(1)})` 
                        : 'Movement failed or was interrupted',
                    startPosition: startPos,
                    endPosition: endPos,
                    actuallyMoved: moved,
                    agentUsed: this.botInfo?.name
                };
            });
            
            res.json(result);
        } catch (error) {
            const { code, message } = this.errorMapper.mapError(error);
            res.status(code).json({ success: false, error: message });
        }
    }

    async collect(req, res) {
        try {
            const bot = await this.ensureBotInitialized();
            const { block, quantity = 1, exclude = null } = req.body;
            
            if (!block || typeof block !== 'string') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Block type is required and must be a string' 
                });
            }
            
            const result = await this.executeAction('collect', async () => {
                const success = await skills.collectBlock(bot, block, quantity, exclude);
                return { 
                    message: success 
                        ? `Collected ${quantity} ${block}` 
                        : `Failed to collect ${block}`,
                    agentUsed: this.botInfo?.name
                };
            });
            
            res.json(result);
        } catch (error) {
            const { code, message } = this.errorMapper.mapError(error);
            res.status(code).json({ success: false, error: message });
        }
    }

    async place(req, res) {
        try {
            const bot = await this.ensureBotInitialized();
            const { material, x, y, z, face = 'bottom' } = req.body;
            
            if (!material || typeof material !== 'string') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Material is required and must be a string' 
                });
            }
            
            if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid coordinates: x, y, z must be numbers' 
                });
            }
            
            const result = await this.executeAction('place', async () => {
                const success = await skills.placeBlock(bot, material, x, y, z, face, false);
                return { 
                    message: success 
                        ? `Placed ${material} at ${x}, ${y}, ${z}` 
                        : `Failed to place ${material}`,
                    agentUsed: this.botInfo?.name
                };
            });
            
            res.json(result);
        } catch (error) {
            const { code, message } = this.errorMapper.mapError(error);
            res.status(code).json({ success: false, error: message });
        }
    }

    async breakBlock(req, res) {
        try {
            const bot = await this.ensureBotInitialized();
            const { x, y, z } = req.body;
            
            if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid coordinates: x, y, z must be numbers' 
                });
            }
            
            const result = await this.executeAction('break', async () => {
                const success = await skills.breakBlockAt(bot, x, y, z);
                return { 
                    message: success 
                        ? `Broke block at ${x}, ${y}, ${z}` 
                        : 'Failed to break block',
                    agentUsed: this.botInfo?.name
                };
            });
            
            res.json(result);
        } catch (error) {
            const { code, message } = this.errorMapper.mapError(error);
            res.status(code).json({ success: false, error: message });
        }
    }

    async chat(req, res) {
        try {
            const bot = await this.ensureBotInitialized();
            const { message, target } = req.body;
            
            if (!message || typeof message !== 'string') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Message is required and must be a string' 
                });
            }
            
            if (message.length > 256) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Message too long (max 256 characters)' 
                });
            }
            
            console.log(`[Executor] Sending chat message: "${message}" ${target ? `to ${target}` : 'publicly'}`);
            
            if (target) {
                bot.whisper(target, message);
            } else {
                bot.chat(message);
            }
            
            res.json({
                success: true,
                message: `Sent message: ${message}`,
                agentUsed: this.botInfo?.name,
                timestamp: Date.now()
            });
        } catch (error) {
            const { code, message } = this.errorMapper.mapError(error);
            res.status(code).json({ success: false, error: message });
        }
    }

    async start(port = 3001) {
        this.server.listen(port, async () => {
            console.log(`[Executor] Bot Executor Server running on port ${port}`);
            console.log(`[Executor] REST API: http://localhost:${port}/api/agent/`);
            console.log(`[Executor] WebSocket: ws://localhost:${port}/`);
            console.log(`[Executor] Initializing bot automatically...`);
            
            // Initialize bot automatically on server start
            try {
                await this.ensureBotInitialized();
                console.log(`[Executor] Bot ready! Server fully operational.`);
            } catch (error) {
                console.error(`[Executor] Failed to initialize bot: ${error.message}`);
                console.log(`[Executor] Server running in API-only mode. Bot will initialize on first request.`);
            }
        });
    }

    stop() {
        if (this.stateInterval) {
            clearInterval(this.stateInterval);
            this.stateInterval = null;
        }
        
        // Don't quit the bot if it's shared with main.js
        // if (this.bot) {
        //     this.bot.quit();
        //     this.bot = null;
        // }
        
        this.server.close();
    }
}

const server = new BotExecutorServer();

process.on('SIGINT', () => {
    console.log('\n[Executor] Shutting down server...');
    server.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[Executor] Shutting down server...');
    server.stop();
    process.exit(0);
});

if (process.env.NODE_ENV !== 'test') {
    server.start();
}

export default BotExecutorServer;