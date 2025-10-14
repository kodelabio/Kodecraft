import express from 'express';
import { EventEmitter } from 'events';
import { KodecraftManager } from './core/KodecraftManager.js';
import { loadConfig } from './config/loader.js';

/**
 * N8N Integration Server for Kodecraft Bot System
 * 
 * This server provides real-time integration between n8n workflows and Minecraft bots.
 * It filters noisy bot logs and streams only meaningful updates using event-based architecture.
 * 
 * Key Features:
 * - Real-time event filtering using EventEmitter pattern
 * - Multi-bot support with per-bot update queues
 * - Intelligent message parsing to detect milestones
 * - Memory-efficient update storage with automatic cleanup
 * - RESTful endpoints for n8n integration
 */

class N8NIntegrationServer extends EventEmitter {
    constructor() {
        super();
        
        // Per-bot update storage: { botName: [updates...] }
        this.botUpdates = {};
        
        // Global update counter for timestamp ordering
        this.updateCounter = 0;
        
        // Maximum updates to keep per bot (memory management)
        this.maxUpdatesPerBot = 100;
        
        // Bot command tracking for response correlation
        this.pendingCommands = new Map(); // commandId -> { botName, user, command, timestamp }
        
        // Express app setup
        this.app = express();
        this.app.use(express.json());
        
        // Reference to Kodecraft system
        this.kodecraftManager = null;
        
        this.setupRoutes();
        this.setupEventListeners();
    }

    /**
     * Initialize the server and integrate with existing Kodecraft system
     */
    async initialize() {
        // Load configuration and initialize Kodecraft system
        const config = await loadConfig();
        await KodecraftManager.init(config);
        
        this.kodecraftManager = KodecraftManager;
        this.attachToControlPanel();
        
        console.log('N8N Integration Server initialized and connected to Kodecraft system');
    }

    /**
     * Attach to the existing control panel to intercept bot messages
     */
    attachToControlPanel() {
        const controlPanel = this.kodecraftManager.controlPanel;
        
        if (!controlPanel) {
            throw new Error('Kodecraft Control Panel not available');
        }

        // Override the recordEvent method to also emit events for our filtering
        const originalRecordEvent = controlPanel.recordEvent.bind(controlPanel);
        controlPanel.recordEvent = (type, data) => {
            const event = originalRecordEvent(type, data);
            
            // Emit event for our real-time filtering
            this.emit('botEvent', {
                type,
                data,
                timestamp: event.ts,
                eventId: event.id
            });
            
            return event;
        };

        // Hook into socket chat messages for real-time filtering
        const originalHandleSocket = controlPanel.handleSocket.bind(controlPanel);
        controlPanel.handleSocket = (socket) => {
            originalHandleSocket(socket);
            
            // Add our message interceptor
            socket.on('chat-message', (targetName, json) => {
                this.processBotMessage(socket.curAgentName || 'Unknown', json.message, targetName);
            });
        };

        console.log('Successfully attached to Kodecraft Control Panel for real-time message interception');
    }

    /**
     * Setup Express routes for n8n integration
     */
    setupRoutes() {
        // Enhanced command endpoint with better response tracking
        this.app.post('/command', async (req, res) => {
            try {
                const { user, command, bot } = req.body;
                
                if (!user || !command) {
                    return res.status(400).json({
                        status: 'error',
                        message: 'Missing user or command in request body'
                    });
                }
                
                const targetBot = bot || 'Kid';
                const commandId = await this.sendCommandToBot(targetBot, user, command);
                
                // Track command for response correlation
                this.pendingCommands.set(commandId, {
                    botName: targetBot,
                    user,
                    command,
                    timestamp: Date.now()
                });
                
                // Auto-cleanup old pending commands (prevent memory leak)
                setTimeout(() => {
                    this.pendingCommands.delete(commandId);
                }, 300000); // 5 minutes
                
                res.json({
                    status: 'success',
                    commandId,
                    bot: targetBot,
                    message: `Command sent to ${targetBot}. Check /updates for progress.`
                });
                
                // Emit command sent event
                this.emitFilteredUpdate(targetBot, {
                    type: 'command_received',
                    message: `Received command: ${command}`,
                    user,
                    commandId
                });
                
            } catch (error) {
                console.error('Error handling command:', error);
                res.status(500).json({
                    status: 'error',
                    message: `Failed to send command: ${error.message}`
                });
            }
        });

        // Enhanced updates endpoint with bot filtering and since parameter
        this.app.get('/updates', (req, res) => {
            const { since = 0, bot } = req.query;
            const sinceTimestamp = parseInt(since, 10);
            
            let updates = [];
            
            if (bot) {
                // Get updates for specific bot
                const botUpdateList = this.botUpdates[bot] || [];
                updates = botUpdateList.filter(update => update.ts > sinceTimestamp);
            } else {
                // Get updates for all bots
                Object.values(this.botUpdates).forEach(botUpdateList => {
                    updates.push(...botUpdateList.filter(update => update.ts > sinceTimestamp));
                });
                
                // Sort by timestamp
                updates.sort((a, b) => a.ts - b.ts);
            }
            
            const latestTimestamp = updates.length > 0 ? Math.max(...updates.map(u => u.ts)) : sinceTimestamp;
            
            res.json({
                updates,
                latestTimestamp,
                totalCount: updates.length,
                availableBots: Object.keys(this.botUpdates)
            });
        });

        // Bot status endpoint
        this.app.get('/bots/status', (req, res) => {
            const controlPanel = this.kodecraftManager?.controlPanel;
            if (!controlPanel) {
                return res.status(503).json({
                    status: 'error',
                    message: 'Bot system not available'
                });
            }

            const bots = Object.entries(controlPanel.agentConnections).map(([name, conn]) => ({
                name,
                connected: conn.in_game,
                available: !!(conn.socket),
                lastSeen: conn.registered_at,
                updateCount: (this.botUpdates[name] || []).length
            }));

            res.json({ bots });
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: Date.now(),
                botCount: Object.keys(this.botUpdates).length,
                totalUpdates: Object.values(this.botUpdates).reduce((sum, updates) => sum + updates.length, 0)
            });
        });
    }

    /**
     * Setup event listeners for real-time message processing
     */
    setupEventListeners() {
        // Listen to our own bot events for filtering
        this.on('botEvent', (event) => {
            this.processBotEvent(event);
        });

        // Cleanup old updates periodically
        setInterval(() => {
            this.cleanupOldUpdates();
        }, 60000); // Every minute
    }

    /**
     * Send command to bot through existing control panel
     */
    async sendCommandToBot(botName, user, command) {
        const controlPanel = this.kodecraftManager?.controlPanel;
        if (!controlPanel) {
            throw new Error('Control panel not available');
        }

        return await controlPanel.sendCommandToAgent(botName, user, command);
    }

    /**
     * Process bot messages in real-time and emit filtered updates
     */
    processBotMessage(fromBot, message, targetBot = null) {
        if (!fromBot || !message) return;

        const lowerMessage = message.toLowerCase();

        // Filter out noisy logs
        const noisyPatterns = [
            /task assigned to worker/i,
            /placing block/i,
            /moving to coordinate/i,
            /walking to/i,
            /looking at/i,
            /inventory check/i,
            /pathfinding/i,
            /updating position/i
        ];

        // Skip if message matches noisy patterns
        if (noisyPatterns.some(pattern => pattern.test(message))) {
            return;
        }

        // Detect important milestones
        this.detectAndEmitMilestones(fromBot, message, targetBot);
    }

    /**
     * Process bot events from the control panel
     */
    processBotEvent(event) {
        const { type, data } = event;

        switch (type) {
            case 'response':
                if (data.responseToCommand) {
                    this.handleCommandResponse(data);
                }
                break;
                
            case 'chat':
                if (data.from) {
                    this.processBotMessage(data.from, data.message, data.to);
                }
                break;
                
            case 'status':
                if (data.status === 'detected') {
                    this.emitFilteredUpdate(data.from, {
                        type: 'status_update',
                        message: data.message
                    });
                }
                break;
        }
    }

    /**
     * Handle responses to commands
     */
    handleCommandResponse(responseData) {
        const { commandId, from: botName, message, originalUser, originalCommand } = responseData;
        
        // Check if this was a pending command
        const pendingCommand = this.pendingCommands.get(commandId);
        if (pendingCommand) {
            this.pendingCommands.delete(commandId);
            
            this.emitFilteredUpdate(botName, {
                type: 'response',
                message: message,
                commandId,
                originalUser,
                originalCommand
            });
        }
    }

    /**
     * Detect important milestones from bot messages and emit structured updates
     */
    detectAndEmitMilestones(botName, message, targetBot) {
        const lowerMessage = message.toLowerCase();

        // Worker assignment detection
        const workerMatch = message.match(/assigned (\d+) workers?/i) || 
                          message.match(/spawned (\d+) workers?/i);
        if (workerMatch) {
            const count = parseInt(workerMatch[1]);
            this.emitFilteredUpdate(botName, {
                type: 'worker_assignment',
                message: `Assigned ${count} worker${count > 1 ? 's' : ''} to the task`,
                workerCount: count
            });
            return;
        }

        // Building phases detection
        const phasePatterns = {
            'foundation_start': /starting foundation|digging foundation|foundation begun/i,
            'foundation_complete': /foundation complete|foundation finished|foundation done/i,
            'walls_start': /starting walls|building walls|wall construction/i,
            'walls_complete': /walls complete|walls finished|walls done/i,
            'roof_start': /starting roof|building roof|roof construction/i,
            'roof_complete': /roof complete|roof finished|roof done/i,
            'building_start': /building started|construction started|starting build/i,
            'building_complete': /build complete|construction complete|building finished|task completed/i
        };

        for (const [phaseType, pattern] of Object.entries(phasePatterns)) {
            if (pattern.test(lowerMessage)) {
                const phaseMessages = {
                    'foundation_start': 'Foundation work started',
                    'foundation_complete': 'Foundation completed',
                    'walls_start': 'Wall construction started', 
                    'walls_complete': 'Walls completed',
                    'roof_start': 'Roof construction started',
                    'roof_complete': 'Roof completed',
                    'building_start': 'Building started',
                    'building_complete': 'Building completed successfully'
                };

                this.emitFilteredUpdate(botName, {
                    type: 'milestone',
                    phase: phaseType,
                    message: phaseMessages[phaseType] || message
                });
                return;
            }
        }

        // Error detection
        const errorPatterns = [
            /error/i, /failed/i, /cannot/i, /unable/i, /stuck/i, /blocked/i
        ];
        
        if (errorPatterns.some(pattern => pattern.test(lowerMessage))) {
            this.emitFilteredUpdate(botName, {
                type: 'error',
                message: message,
                severity: 'warning'
            });
            return;
        }

        // Progress updates (only if significant)
        const progressMatch = message.match(/(\d+)%|(\d+) of (\d+)|(\d+)\/(\d+)/);
        if (progressMatch) {
            this.emitFilteredUpdate(botName, {
                type: 'progress',
                message: message
            });
            return;
        }

        // Generic important message (catch-all for other significant messages)
        const importantPatterns = [
            /ready|done|complete|finished|success/i,
            /waiting|need|require/i,
            /teleport|move|position/i
        ];
        
        if (importantPatterns.some(pattern => pattern.test(lowerMessage))) {
            this.emitFilteredUpdate(botName, {
                type: 'info',
                message: message
            });
        }
    }

    /**
     * Emit a filtered update for a specific bot
     */
    emitFilteredUpdate(botName, updateData) {
        if (!botName) return;

        // Initialize bot updates array if needed
        if (!this.botUpdates[botName]) {
            this.botUpdates[botName] = [];
        }

        const update = {
            type: updateData.type || 'info',
            from: botName,
            message: updateData.message,
            ts: Date.now(),
            id: ++this.updateCounter,
            ...updateData
        };

        // Add to bot's update queue
        this.botUpdates[botName].push(update);

        // Maintain memory limits
        if (this.botUpdates[botName].length > this.maxUpdatesPerBot) {
            this.botUpdates[botName].splice(0, this.botUpdates[botName].length - this.maxUpdatesPerBot);
        }

        // Emit real-time event
        this.emit('update', { botName, update });

        console.log(`📡 [${botName}] ${update.type}: ${update.message}`);
    }

    /**
     * Cleanup old updates to prevent memory bloat
     */
    cleanupOldUpdates() {
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        const cutoff = Date.now() - maxAge;

        Object.keys(this.botUpdates).forEach(botName => {
            const updates = this.botUpdates[botName];
            this.botUpdates[botName] = updates.filter(update => update.ts > cutoff);
        });
    }

    /**
     * Start the server
     */
    start(port = 8080, host = 'localhost') {
        this.app.listen(port, host, () => {
            console.log(`🚀 N8N Integration Server running on http://${host}:${port}`);
            console.log(`📡 Real-time bot updates available at /updates`);
            console.log(`🤖 Send commands to /command`);
            console.log(`📊 Check bot status at /bots/status`);
        });
    }
}

// Main execution
async function main() {
    try {
        const server = new N8NIntegrationServer();
        await server.initialize();
        
        // Start server (use environment variables or defaults)
        const port = process.env.N8N_PORT || 8080;
        const host = process.env.N8N_HOST || 'localhost';
        
        server.start(port, host);
        
        // Graceful shutdown handling
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down N8N Integration Server...');
            process.exit(0);
        });
        
    } catch (error) {
        console.error('Failed to start N8N Integration Server:', error);
        process.exit(1);
    }
}

// Export for use as module or run directly
export { N8NIntegrationServer };

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}