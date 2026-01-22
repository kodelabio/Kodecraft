// src/agent/external_api.js
// REST API server for n8n integration when BRAIN_MODE=external

import express from 'express';
import { getCommand, executeCommand } from './commands/index.js';
import settings from '../../settings.js';
import { History } from './history.js';
import { Coder } from './coder.js';
//import { MultiBotManager } from './multibot_manager.js';
import { OrchestrationAPI } from './orchestration_api.js';
    

export class ExternalAPI {
    constructor(agent) {
        this.agent = agent;
        this.app = express();
        this.app.use(express.json());
        
        // Initialize multi-bot manager: REMOVED, REPLLACES WITH ORCHESTRATION API
        //this.multiBotManager = new MultiBotManager(agent);

        this.orchestration = new OrchestrationAPI(agent);  // â† NEW LINE (replaced old line)
        // Make orchestration accessible from agent, this will allow us to stop workers when an agent is stopped
        this.agent.orchestration = this.orchestration; 
        
        // CORS for n8n
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        this.setupRoutes();
    }

    setupRoutes() {

        this.app.get('/api/agent/world-info', this.handleWorldInfo.bind(this));

        // Movement endpoints
        this.app.post('/api/agent/move', this.handleMove.bind(this));
        this.app.post('/api/agent/goToPlayer', this.handleGoToPlayer.bind(this));
        this.app.post('/api/agent/goToCoordinates', this.handleGoToCoordinates.bind(this));
        this.app.post('/api/agent/moveAway', this.handleMoveAway.bind(this));
        this.app.post('/api/agent/searchForBlock', this.handleSearchForBlock.bind(this));
        this.app.post('/api/agent/searchForEntity', this.handleSearchForEntity.bind(this));
        this.app.post('/api/agent/teleport', this.handleTeleport.bind(this));
        
        // Block operations
        this.app.post('/api/agent/collect', this.handleCollect.bind(this));
        this.app.post('/api/agent/place', this.handlePlace.bind(this));
        this.app.post('/api/agent/break', this.handleBreak.bind(this));
        this.app.post('/api/agent/digDown', this.handleDigDown.bind(this));
        this.app.post('/api/agent/activate', this.handleActivate.bind(this));
        
        // Item management
        this.app.post('/api/agent/equip', this.handleEquip.bind(this));
        this.app.post('/api/agent/discard', this.handleDiscard.bind(this));
        this.app.post('/api/agent/consume', this.handleConsume.bind(this));
        this.app.post('/api/agent/fish', this.handleFish.bind(this));
        this.app.post('/api/agent/catchFish', this.handleCatchFish.bind(this));
        this.app.post('/api/agent/shear', this.handleShear.bind(this));
        this.app.post('/api/agent/givePlayer', this.handleGivePlayer.bind(this));
        
        // Chest operations
        this.app.post('/api/agent/putInChest', this.handlePutInChest.bind(this));
        this.app.post('/api/agent/takeFromChest', this.handleTakeFromChest.bind(this));
        this.app.get('/api/agent/viewChest', this.handleViewChest.bind(this));
        
        // Crafting and smelting
        this.app.post('/api/agent/craft', this.handleCraft.bind(this));
        this.app.post('/api/agent/smelt', this.handleSmelt.bind(this));
        this.app.post('/api/agent/clearFurnace', this.handleClearFurnace.bind(this));
        
        // Combat and interaction
        this.app.post('/api/agent/attack', this.handleAttack.bind(this));
        this.app.post('/api/agent/attackPlayer', this.handleAttackPlayer.bind(this));

        this.app.post('/api/agent/followPlayer', this.handleFollowPlayer.bind(this));
        this.app.post('/api/agent/defendSelf', this.handleDefendSelf.bind(this));
        
        // Location memory
        this.app.post('/api/agent/rememberHere', this.handleRememberHere.bind(this));
        this.app.post('/api/agent/goToRememberedPlace', this.handleGoToRememberedPlace.bind(this));
        this.app.get('/api/agent/savedPlaces', this.handleSavedPlaces.bind(this));
        
        // Information queries
        this.app.get('/api/agent/status', this.handleStatus.bind(this));
        this.app.get('/api/agent/inventory', this.handleInventory.bind(this));
        this.app.get('/api/agent/nearbyBlocks', this.handleNearbyBlocks.bind(this));
        this.app.get('/api/agent/craftable', this.handleCraftable.bind(this));
        this.app.get('/api/agent/entities', this.handleEntities.bind(this));
        this.app.get('/api/agent/modes', this.handleModes.bind(this));
        this.app.get('/api/agent/getCraftingPlan', this.handleGetCraftingPlan.bind(this));
        this.app.get('/api/agent/player-position', this.handleGetPlayerPosition.bind(this));
        
        this.app.get('/api/agent/identify-entity', this.handleIdentifyEntity.bind(this));
        
        
        // Mode management
        this.app.post('/api/agent/setMode', this.handleSetMode.bind(this));
        
        // Utility actions
        this.app.post('/api/agent/stay', this.handleStay.bind(this));
        this.app.post('/api/agent/goToBed', this.handleGoToBed.bind(this));
        this.app.post('/api/agent/useDoor', this.handleUseDoor.bind(this));
        this.app.post('/api/agent/newAction', this.handleNewAction.bind(this));
        
        // Communication
        this.app.post('/api/agent/chat', this.handleChat.bind(this));
        this.app.post('/api/agent/startConversation', this.handleStartConversation.bind(this));
        this.app.post('/api/agent/endConversation', this.handleEndConversation.bind(this));
        
        // Control
        this.app.post('/api/agent/kick-bot', this.handleKickBot.bind(this));
        this.app.post('/api/agent/stop', this.handleStop.bind(this));
        this.app.post('/api/agent/restart', this.handleRestart.bind(this));
        this.app.post('/api/agent/clearChat', this.handleClearChat.bind(this));
        this.app.post('/api/agent/spawnWorkers', this.handleSpawnWorkers.bind(this));
        
        // Vision
        this.app.post('/api/agent/vision', this.handleVision.bind(this));
        this.app.post('/api/agent/lookAtPlayer', this.handleLookAtPlayer.bind(this));
        this.app.post('/api/agent/lookAtPosition', this.handleLookAtPosition.bind(this));
        
        // Goal management
        this.app.post('/api/agent/goal', this.handleGoal.bind(this));
        this.app.post('/api/agent/endGoal', this.handleEndGoal.bind(this));

        // ========== NEW STAGE-AWARE ENDPOINTS ==========
        // Send a task for a specific stage to a worker
        this.app.post('/api/orchestration/send-task-stage', this.handleOrchestrationSendTaskStage.bind(this));
        // Get task metadata by ID
        this.app.get('/api/orchestration/task-status/:taskId', this.handleOrchestrationTaskStatus.bind(this));
        // Get all tasks for a session
        this.app.get('/api/orchestration/session-tasks/:sessionId', this.handleOrchestrationSessionTasks.bind(this));
        // Get all tasks for a specific stage
        this.app.get('/api/orchestration/stage-tasks/:sessionId/:stageNumber', this.handleOrchestrationStageTasks.bind(this));
        
        // Multi-bot management: REMOVED, REPLACED by ORCHESTRATION API
        //this.app.post('/api/multibot/spawnWorkers', this.handleSpawnWorkers.bind(this));
        //this.app.post('/api/multibot/coordinateBuild', this.handleCoordinateBuild.bind(this));
        //this.app.post('/api/multibot/assignTasks', this.handleAssignTasks.bind(this));
        //this.app.post('/api/multibot/teleportWorkers', this.handleTeleportWorkers.bind(this));
        //this.app.get('/api/multibot/status', this.handleMultiBotStatus.bind(this));
        //this.app.post('/api/multibot/stopWorkers', this.handleStopWorkers.bind(this));
        
        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'ok' });
        });
        // Orchestration endpoints for n8n for complex tasks(â† NEW SECTION STARTS HERE)
        this.app.post('/api/orchestration/spawn-workers', this.handleOrchestrationSpawnWorkers.bind(this));
        this.app.post('/api/orchestration/spawn-worker', this.handleOrchestrationSpawnWorker.bind(this));
        this.app.post('/api/orchestration/wait-workers', this.handleOrchestrationWaitWorkers.bind(this));
        this.app.post('/api/orchestration/create-session', this.handleOrchestrationCreateSession.bind(this));
        this.app.post('/api/orchestration/register-workers', this.handleOrchestrationRegisterWorkers.bind(this));
        this.app.post('/api/orchestration/reserve-location', this.handleOrchestrationReserveLocation.bind(this));
        this.app.post('/api/orchestration/teleport-worker', this.handleOrchestrationTeleportWorker.bind(this));
        this.app.post('/api/orchestration/teleport-workers', this.handleOrchestrationTeleportWorkers.bind(this));
        this.app.post('/api/orchestration/teleport-to-player', this.handleOrchestrationTeleportToPlayer.bind(this));
        this.app.post('/api/orchestration/send-task', this.handleOrchestrationSendTask.bind(this));
        this.app.get('/api/orchestration/status', this.handleOrchestrationStatus.bind(this));
        this.app.post('/api/orchestration/stop-worker', this.handleOrchestrationStopWorker.bind(this));
        this.app.post('/api/orchestration/stop-all', this.handleOrchestrationStopAll.bind(this));
        this.app.post('/api/orchestration/kick-all-workers', this.handleOrchestrationKickAll.bind(this));
        this.app.post('/api/orchestration/move-worker-to-player', this.handleMoveWorkerToPlayer.bind(this));
        this.app.post('/api/orchestration/move-worker-to', this.handleMoveWorkerTo.bind(this));
        // (â† NEW SECTION ENDS HERE)

         // Add these lines in setupRoutes() method, in the orchestration section:
        this.app.post('/api/orchestration/arm-workers', this.handleOrchestrationArmWorkers.bind(this));
        this.app.post('/api/orchestration/arm-worker', this.handleOrchestrationArmWorker.bind(this));
        
        // Worker status management endpoints
        this.app.post('/api/orchestration/worker-ready', this.handleOrchestrationWorkerReady.bind(this));
        this.app.post('/api/orchestration/check-workers', this.handleOrchestrationCheckWorkers.bind(this));

        this.app.post('/api/orchestration/verify-permissions', this.handleOrchestrationVerifyPermissions.bind(this));
        
    }
    

    // New helper: wait for bot to finish current action
    async waitForBotIdle(bot, timeoutMs = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            // Check if bot is idle (not executing an action)
            if (this.agent.actions && !this.agent.actions.executing) {
                console.log(`✅ Bot idle after ${Date.now() - startTime}ms`);
                return true;
            }
            
            // Wait 100ms before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.warn(`⚠️  Bot did not become idle within ${timeoutMs}ms`);
        return false;
    }

    // âœ… FIXED handleWorldInfo
    async handleWorldInfo(req, res) {
        try {
            const bot = this.agent.bot;
            const worldInfo = {
                dimension: bot.game.dimension || 'unknown',
                minY: bot.world.minY ?? -64,
                maxY: bot.world.maxY ?? 320,
                worldType: bot.game.levelType || 'unknown',
                difficulty: bot.game.difficulty || 'unknown',
                spawnPoint: bot.spawnPoint || null
            };
            
            res.json({ success: true, ...worldInfo });
        } catch (error) {
            this.handleError(res, error, 'worldInfo');
        }
    }


    // âœ… Helper method for null safety checks
    getBotSafely() {
        try {
            if (!this.agent) return null;
            if (!this.agent.bot) return null;
            if (!this.agent.bot.entity) return null;
            if (!this.agent.bot.entity.position) return null;
            return this.agent.bot;
        } catch (e) {
            return null;
        }
    }

    // âœ… Helper method for coordinate validation and rounding
    validateAndRoundCoordinates(x, y, z) {
        if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
            return 'x, y, z coordinates must be numbers';
        }
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            return 'coordinates must be finite numbers (not Infinity or NaN)';
        }
        return {
            x: Math.floor(x),
            y: Math.floor(y),
            z: Math.floor(z)
        };
    }

    // âœ… Helper method for minDistance validation
    validateMinDistance(minDistance) {
        if (typeof minDistance !== 'number') {
            return `minDistance must be a number, got ${typeof minDistance}`;
        }
        if (!Number.isFinite(minDistance)) {
            return 'minDistance must be a finite number';
        }
        if (minDistance < 0) {
            return 'minDistance must be non-negative';
        }
        return true;
    }

    // âœ… FIXED handleMove
    async handleMove(req, res) {
        try {
            const { x, y, z, direction, minDistance = 1 } = req.body;
            console.log(`[API handleMove] Received move request:`, { x, y, z, direction });  // ✅ ADD THIS
            
            const minDistanceValid = this.validateMinDistance(minDistance);
            if (minDistanceValid !== true) {
                return res.status(400).json({ 
                    error: minDistanceValid,
                    code: 'invalid_parameter'
                });
            }
            
            let command;
            
            if (direction && direction.trim() && !x && !y && !z) {
                const bot = this.getBotSafely();
                if (!bot) {
                    return res.status(503).json({ 
                        error: 'Bot not initialized or disconnected',
                        code: 'bot_unavailable'
                    });
                }

                // Map common direction variations to standard directions
                const directionMapping = {
                    'backward': 'back',
                    'backwards': 'back',
                    'forwards': 'forward',
                    'leftward': 'left',
                    'rightward': 'right'
                };
                
                // Normalize direction
                const normalizedDirection = directionMapping[direction.toLowerCase()] || direction.toLowerCase();
                
                const validDirections = ['left', 'right', 'forward', 'back', 'north', 'south', 'east', 'west'];
                if (!validDirections.includes(normalizedDirection)) {
                    return res.status(400).json({
                        error: `Invalid direction: '${direction}'. Valid options: left, right, forward, back, north, south, east, west`,
                        code: 'invalid_direction'
                    });
                }


                const pos = bot.entity.position;
                const movements = {
                    'left': [-5, 0, 0],
                    'right': [5, 0, 0], 
                    'forward': [0, 0, -5],
                    'back': [0, 0, 5],
                    'north': [0, 0, -5],
                    'south': [0, 0, 5],
                    'east': [5, 0, 0],
                    'west': [-5, 0, 0]
                };
                
                const [dx, dy, dz] = movements[normalizedDirection];
                const targetX = Math.floor(pos.x + dx);
                const targetY = Math.floor(pos.y + dy);
                const targetZ = Math.floor(pos.z + dz);
                
                command = `!goToCoordinates(${targetX}, ${targetY}, ${targetZ}, ${minDistance})`;
            }

            else if ((typeof x === 'number' || typeof x === 'string') && 
                    (typeof y === 'number' || typeof y === 'string') && 
                    (typeof z === 'number' || typeof z === 'string')) {
                // Coerce strings to numbers if needed
                const numX = typeof x === 'string' ? parseFloat(x) : x;
                const numY = typeof y === 'string' ? parseFloat(y) : y;
                const numZ = typeof z === 'string' ? parseFloat(z) : z;
                const coordValidation = this.validateAndRoundCoordinates(numX, numY, numZ);
                if (typeof coordValidation === 'string') {
                    return res.status(400).json({ 
                        error: coordValidation,
                        code: 'invalid_coordinates'
                    });
                }
                
                command = `!goToCoordinates(${coordValidation.x}, ${coordValidation.y}, ${coordValidation.z}, ${minDistance})`;
            }
            else {
                return res.status(400).json({ 
                    error: 'Either provide direction (left/right/forward/back/north/south/east/west) OR x,y,z coordinates',
                    code: 'invalid_input'
                });
            }

            console.log(`[handleMove DEBUG] Executing command:`, command);
            console.log(`[handleMove DEBUG] Bot busy?`, this.agent.actions?.executing);
            console.log(`[handleMove DEBUG] Current action:`, this.agent.actions?.currentActionLabel);
            const result = await executeCommand(this.agent, command);
            console.log(`[handleMove DEBUG] Command result:`, result);
            console.log(`[handleMove DEBUG] Result type:`, typeof result);
            console.log(`[API handleMove] Move result:`, result);  // ✅ ADD THIS
            console.log(`[API handleMove] Bot position after move:`, this.agent.bot.entity.position);  // ✅ ADD THIS
        
            
            if (!result || typeof result !== 'string' || result.length === 0) {
                return res.status(503).json({ 
                    error: 'Movement command failed or returned invalid result',
                    code: 'command_failed'
                });
            }
            
            const lowerResult = result.toLowerCase();
            if (lowerResult.includes('error') || lowerResult.includes('unreachable') || lowerResult.includes('failed')) {
                return res.status(422).json({ 
                    error: result, 
                    code: 'unreachable'
                });
            }
            
            const directionText = direction ? `to the ${direction}` : `to ${x}, ${y}, ${z}`;
            const message = result || `Moving ${directionText}`;
            
            res.json({ 
                success: true, 
                message: message,
                direction: direction || null,
                coordinates: direction ? null : { x, y, z }
            });
        } catch (error) {
            this.handleError(res, error, 'move');
        }
    }

    

    // âœ… FIXED handleGoToPlayer
    async handleGoToPlayer(req, res) {
        try {
            const { player, distance = 1 } = req.body;
            
            if (!player || typeof player !== 'string') {
                return res.status(400).json({ 
                    error: 'player parameter required and must be a string',
                    code: 'invalid_parameter'
                });
            }

            const distanceValid = this.validateMinDistance(distance);
            if (distanceValid !== true) {
                return res.status(400).json({ 
                    error: `distance parameter invalid: ${distanceValid}`,
                    code: 'invalid_parameter'
                });
            }

            const command = `!goToPlayer("${player}", ${distance})`;
            const result = await executeCommand(this.agent, command);
            
            if (!result || typeof result !== 'string') {
                return res.status(503).json({ 
                    error: 'Command execution failed',
                    code: 'command_failed'
                });
            }

            if (result.toLowerCase().includes('not found')) {
                return res.status(404).json({ 
                    error: result, 
                    code: 'player_not_found' 
                });
            }
            
            res.json({ 
                success: true, 
                message: result || `Going to ${player}` 
            });
        } catch (error) {
            this.handleError(res, error, 'goToPlayer');
        }
    }

    // âœ… FIXED handleGoToCoordinates
    async handleGoToCoordinates(req, res) {
        try {
            const { x, y, z, closeness = 1 } = req.body;
            
            const coordValidation = this.validateAndRoundCoordinates(x, y, z);
            if (typeof coordValidation === 'string') {
                return res.status(400).json({ 
                    error: coordValidation,
                    code: 'invalid_coordinates'
                });
            }

            const closenessValid = this.validateMinDistance(closeness);
            if (closenessValid !== true) {
                return res.status(400).json({ 
                    error: `closeness parameter invalid: ${closenessValid}`,
                    code: 'invalid_parameter'
                });
            }

            const command = `!goToCoordinates(${coordValidation.x}, ${coordValidation.y}, ${coordValidation.z}, ${closeness})`;
            const result = await executeCommand(this.agent, command);
            
            if (!result || typeof result !== 'string') {
                return res.status(503).json({ 
                    error: 'Command execution failed',
                    code: 'command_failed'
                });
            }

            if (result.toLowerCase().includes('error') || result.toLowerCase().includes('failed')) {
                return res.status(422).json({ 
                    error: result, 
                    code: 'unreachable' 
                });
            }
            
            res.json({ 
                success: true, 
                message: result || `Moving to ${coordValidation.x}, ${coordValidation.y}, ${coordValidation.z}` 
            });
        } catch (error) {
            this.handleError(res, error, 'goToCoordinates');
        }
    }

    // âœ… FIXED handleMoveAway
    async handleMoveAway(req, res) {
        try {
            const { distance = 5 } = req.body;
            
            if (typeof distance !== 'number' || distance <= 0) {
                return res.status(400).json({ 
                    error: 'distance must be a positive number',
                    code: 'invalid_parameter'
                });
            }

            if (!Number.isFinite(distance)) {
                return res.status(400).json({ 
                    error: 'distance must be a finite number',
                    code: 'invalid_parameter'
                });
            }

            const command = `!moveAway(${distance})`;
            const result = await executeCommand(this.agent, command);
            
            if (!result || typeof result !== 'string') {
                return res.status(503).json({ 
                    error: 'Command execution failed',
                    code: 'command_failed'
                });
            }

            res.json({ 
                success: true, 
                message: result || `Moved away ${distance} blocks` 
            });
        } catch (error) {
            this.handleError(res, error, 'moveAway');
        }
    }

    // âœ… FIXED handleSearchForBlock
    async handleSearchForBlock(req, res) {
        try {
            const { blockType, range = 64 } = req.body;
            
            if (!blockType || typeof blockType !== 'string') {
                return res.status(400).json({ 
                    error: 'blockType parameter required and must be a string',
                    code: 'invalid_parameter'
                });
            }

            if (typeof range !== 'number' || range <= 0) {
                return res.status(400).json({ 
                    error: 'range must be a positive number',
                    code: 'invalid_parameter'
                });
            }

            const command = `!searchForBlock("${blockType}", ${range})`;
            const result = await executeCommand(this.agent, command);
            
            if (!result || typeof result !== 'string') {
                return res.status(503).json({ 
                    error: 'Command execution failed',
                    code: 'command_failed'
                });
            }

            // âœ… CHECK FOR PATHFINDING/NAVIGATION FAILURES
            const lowerResult = result.toLowerCase();
            if (lowerResult.includes('not found')) {
                return res.status(404).json({ 
                    error: result, 
                    code: 'block_not_found' 
                });
            }

            // âœ… NEW: Check for pathfinding errors
            if (lowerResult.includes('pathfinding stopped') || 
                lowerResult.includes('unreachable') || 
                lowerResult.includes('took too long') ||
                lowerResult.includes('failed')) {
                return res.status(422).json({ 
                    error: result, 
                    code: 'unreachable'
                });
            }
            
            res.json({ 
                success: true, 
                message: result || `Searching for ${blockType}` 
            });
        } catch (error) {
            this.handleError(res, error, 'searchForBlock');
        }
    }

    // âœ… FIXED handleSearchForEntity
    async handleSearchForEntity(req, res) {
        try {
            const { entityType, range = 64 } = req.body;
            
            if (!entityType || typeof entityType !== 'string') {
                return res.status(400).json({ 
                    error: 'entityType parameter required and must be a string',
                    code: 'invalid_parameter'
                });
            }

            if (typeof range !== 'number' || range <= 0) {
                return res.status(400).json({ 
                    error: 'range must be a positive number',
                    code: 'invalid_parameter'
                });
            }

            const command = `!searchForEntity("${entityType}", ${range})`;
            const result = await executeCommand(this.agent, command);
            
            if (!result || typeof result !== 'string') {
                return res.status(503).json({ 
                    error: 'Command execution failed',
                    code: 'command_failed'
                });
            }

            const lowerResult = result.toLowerCase();
            if (lowerResult.includes('not found')) {
                return res.status(404).json({ 
                    error: result, 
                    code: 'entity_not_found' 
                });
            }

            // âœ… NEW: Check for pathfinding errors
            if (lowerResult.includes('pathfinding stopped') || 
                lowerResult.includes('unreachable') || 
                lowerResult.includes('took too long') ||
                lowerResult.includes('failed')) {
                return res.status(422).json({ 
                    error: result, 
                    code: 'unreachable'
                });
            }
            
            res.json({ 
                success: true, 
                message: result || `Searching for ${entityType}` 
            });
        } catch (error) {
            this.handleError(res, error, 'searchForEntity');
        }
    }

    async handleCollect(req, res) {
        try {
            const { block, quantity = 1 } = req.body;
            
            if (!block) {
                return res.status(400).json({ error: 'block parameter required' });
            }

            const command = `!collectBlocks("${block}", ${quantity})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'not_found' });
            }
            
            res.json({ success: true, message: result || `Collected ${quantity} ${block}` });
        } catch (error) {
            this.handleError(res, error, 'collect');
        }
    }

    /**
     * Place a block at specified coordinates with optional orientation modifiers
     * 
     * POST /api/agent/place
     * 
     * Request body:
     * {
     *   "material": STRING (required) - Block type to place (e.g., "oak_stairs", "torch", "oak_bed")
     *   "x": NUMBER (required) - X coordinate (integer)
     *   "y": NUMBER (required) - Y coordinate (integer)
     *   "z": NUMBER (required) - Z coordinate (integer)
     *   "placeOn": STRING (optional, default: "top") - Which surface of adjacent block to place on
     *              Valid: "top", "bottom", "north", "south", "east", "west", "side"
     *   "facing": STRING (optional) - Direction block faces (for stairs, doors, slabs)
     *             Valid: "north", "south", "east", "west"
     *   "rotation": NUMBER (optional) - Block rotation (for beds, logs, chains)
     *              Valid: 0 (north), 1 (east), 2 (south), 3 (west)
     * }
     * 
     * Response on success (200):
     * { "success": true, "message": "Placed [material] at x, y, z" }
     * 
     * Response on failure (4xx/5xx):
     * { "error": "error message", "code": "error_code" }
     * 
     * Error codes:
     * - "invalid_coordinates" - x, y, z are not valid integers or out of range
     * - "placement_failed" - Block could not be placed at location
     * - "bot_unavailable" - Bot is not connected or initialized
     * 
     * Examples:
     * 
     * 1. Place regular block:
     * POST /api/agent/place
     * { "material": "cobblestone", "x": 0, "y": -60, "z": 0 }
     * 
     * 2. Place stairs with facing direction:
     * POST /api/agent/place
     * { "material": "oak_stairs", "x": 0, "y": -60, "z": 0, "facing": "east" }
     * 
     * 3. Place bed with rotation:
     * POST /api/agent/place
     * { "material": "oak_bed", "x": 1, "y": -59, "z": 0, "rotation": 2 }
     * 
     * 4. Place torch on wall surface:
     * POST /api/agent/place
     * { "material": "torch", "x": 2, "y": -58, "z": 0, "placeOn": "north" }
     * 
     * @param {Object} req - Express request object
     * @param {Object} req.body - Request body with material and coordinates
     * @param {Object} res - Express response object
     * @returns {void} Sends JSON response with success status or error
     */
    async handlePlace(req, res) {
        try {
            const { material, x, y, z, placeOn = 'top', facing, rotation } = req.body;
            
            if (!material) {
                return res.status(400).json({ error: 'material parameter required' });
            }

            let result;
            
            if (x === undefined || y === undefined || z === undefined || 
                x === null || y === null || z === null ||
                isNaN(x) || isNaN(y) || isNaN(z)) {
                const command = `!placeHere("${material}")`;
                result = await executeCommand(this.agent, command);

            } else {
                const coordValidation = this.validateAndRoundCoordinates(x, y, z);
                if (typeof coordValidation === 'string') {
                    return res.status(400).json({ 
                        error: coordValidation,
                        code: 'invalid_coordinates'
                    });
                }

                const bot = this.getBotSafely();
                if (bot) {
                    const botPos = bot.entity.position;
                    const atCurrentLocation = Math.abs(botPos.x - coordValidation.x) < 1 && 
                                            Math.abs(botPos.y - coordValidation.y) < 1 && 
                                            Math.abs(botPos.z - coordValidation.z) < 1;
                    
                    if (atCurrentLocation) {
                        const command = `!placeHere("${material}")`;
                        result = await executeCommand(this.agent, command);
                    } else {
                        const skills = await import('./library/skills.js');
                        
                        console.log(`[handlePlace] Calling placeBlock with:`, {
                            material: material,
                            x: coordValidation.x,
                            y: coordValidation.y,
                            z: coordValidation.z,
                            placeOn: placeOn,
                            facing: facing,
                            rotation: rotation
                        });
                        // Pass: bot, material, x, y, z, placeOn, dontCheat, facing, rotation
                        const success = await skills.placeBlock(this.agent.bot, material, coordValidation.x, coordValidation.y, coordValidation.z, placeOn, false, facing, rotation);
                        console.log(`[handlePlace] placeBlock returned:`, success);
                        if (success) {
                            result = `Placed ${material} at ${coordValidation.x}, ${coordValidation.y}, ${coordValidation.z}`;
                        } else {
                            return res.status(422).json({ 
                                error: `Failed to place ${material} at ${coordValidation.x}, ${coordValidation.y}, ${coordValidation.z}`, 
                                code: 'placement_failed' 
                            });
                        }
                    }
                } else {
                    return res.status(503).json({
                        error: 'Bot not available',
                        code: 'bot_unavailable'
                    });
                }
            }

            res.json({ success: true, message: result || `Placed ${material}` });
        } catch (error) {
            this.handleError(res, error, 'place');
        }
    }

    // âœ… FIXED handleBreak
    async handleBreak(req, res) {
        try {
            const { x, y, z } = req.body;
            
            const coordValidation = this.validateAndRoundCoordinates(x, y, z);
            if (typeof coordValidation === 'string') {
                return res.status(400).json({ 
                    error: coordValidation,
                    code: 'invalid_coordinates'
                });
            }

            const command = `!newAction("Break block at ${coordValidation.x}, ${coordValidation.y}, ${coordValidation.z}")`;
            const result = await executeCommand(this.agent, command);
            
            res.json({ 
                success: true, 
                message: result || `Breaking block at ${coordValidation.x}, ${coordValidation.y}, ${coordValidation.z}` 
            });
        } catch (error) {
            this.handleError(res, error, 'break');
        }
    }

    // âœ… FIXED handleUseDoor
    async handleUseDoor(req, res) {
        try {
            const { x, y, z } = req.body;
            
            let command;
            if (x !== undefined && y !== undefined && z !== undefined) {
                const coordValidation = this.validateAndRoundCoordinates(x, y, z);
                if (typeof coordValidation === 'string') {
                    return res.status(400).json({ 
                        error: coordValidation,
                        code: 'invalid_coordinates'
                    });
                }
                command = `!newAction("Use door at ${coordValidation.x}, ${coordValidation.y}, ${coordValidation.z}")`;
            } else {
                command = `!newAction("Use nearest door")`;
            }
            
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || 'Using door' });
        } catch (error) {
            this.handleError(res, error, 'useDoor');
        }
    }

    async handleDigDown(req, res) {
        try {
            const { distance = 3 } = req.body;
            
            if (typeof distance !== 'number' || distance <= 0) {
                return res.status(400).json({ error: 'distance must be a positive number' });
            }

            const command = `!digDown(${distance})`;
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || `Digging down ${distance} blocks` });
        } catch (error) {
            this.handleError(res, error, 'digDown');
        }
    }

    async handleActivate(req, res) {
        try {
            const { blockType } = req.body;
            
            if (!blockType) {
                return res.status(400).json({ error: 'blockType parameter required' });
            }

            const command = `!activate("${blockType}")`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'block_not_found' });
            }
            
            res.json({ success: true, message: result || `Activated ${blockType}` });
        } catch (error) {
            this.handleError(res, error, 'activate');
        }
    }

    async handleEquip(req, res) {
        try {
            const { item } = req.body;
            
            if (!item) {
                return res.status(400).json({ error: 'item parameter required' });
            }

            // Check if bot is in creative mode: the bot's inventory isn't automatically populated. 
            // You need to explicitly give items to the bot before equipping them 
            const bot = this.getBotSafely();
            if (bot && bot.game.gameMode === 1) { // 1 = Creative
                // In creative mode, give the item first
                try {
                    await bot.creative.setInventorySlot(36, new bot.Item(bot.registry.itemsByName[item], 64));
                    console.log(`[Equip] Creative mode: gave ${item} to inventory`);
                } catch (e) {
                    console.warn(`[Equip] Failed to give creative item: ${e.message}`);
                }
            }
            

            const command = `!equip("${item}")`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('do not have')) {
                return res.status(404).json({ error: result, code: 'item_not_found' });
            }
            
            res.json({ success: true, message: result || `Equipped ${item}` });
        } catch (error) {
            this.handleError(res, error, 'equip');
        }
    }

    async handleDiscard(req, res) {
        try {
            const { item, quantity = -1 } = req.body;
            
            if (!item) {
                return res.status(400).json({ error: 'item parameter required' });
            }

            const command = `!discard("${item}", ${quantity})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('do not have')) {
                return res.status(404).json({ error: result, code: 'item_not_found' });
            }
            
            res.json({ success: true, message: result || `Discarded ${item}` });
        } catch (error) {
            this.handleError(res, error, 'discard');
        }
    }

    async handleConsume(req, res) {
        try {
            const { item } = req.body;
            
            if (!item) {
                return res.status(400).json({ error: 'item parameter required' });
            }

            const command = `!consume("${item}")`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('do not have')) {
                return res.status(404).json({ error: result, code: 'item_not_found' });
            }
            
            res.json({ success: true, message: result || `Consumed ${item}` });
        } catch (error) {
            this.handleError(res, error, 'consume');
        }
    }

    async handleFish(req, res) {
        try {
            let { count = 1 } = req.body;
            
            // Support old 'timeout' or 'duration' parameters for backwards compatibility
            // If they're provided, just catch 1 fish with that timeout logic (not ideal but maintains compatibility)
            if (req.body.timeout !== undefined || req.body.duration !== undefined) {
                count = 1;
            }
            
            if (typeof count !== 'number' || count < 1 || count > 50) {
                return res.status(400).json({ 
                    error: 'count must be a number between 1 and 50',
                    code: 'invalid_count'
                });
            }

            const command = `!fish(${count})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('do not have')) {
                return res.status(404).json({ error: result, code: 'no_fishing_rod' });
            }
            
            if (result && result.includes('No water nearby')) {
                return res.status(404).json({ error: result, code: 'no_water_nearby' });
            }
            
            if (result && result.includes('timed out')) {
                return res.status(408).json({ error: result, code: 'fishing_timeout' });
            }
            
            res.json({ success: true, message: result || 'Fishing completed' });
        } catch (error) {
            this.handleError(res, error, 'fish');
        }
    }

    async handleCatchFish(req, res) {
        try {
            const { fishType = 'cod', count = 1 } = req.body;
            
            const validFish = ['cod', 'salmon', 'tropical_fish', 'pufferfish'];
            if (!validFish.includes(fishType)) {
                return res.status(400).json({ 
                    error: `fishType must be one of: ${validFish.join(', ')}`,
                    code: 'invalid_fish_type'
                });
            }
            
            if (typeof count !== 'number' || count < 1 || count > 20) {
                return res.status(400).json({ 
                    error: 'count must be a number between 1 and 20',
                    code: 'invalid_count'
                });
            }

            const command = `!catchFishWithBucket("${fishType}", ${count})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('do not have')) {
                return res.status(404).json({ error: result, code: 'no_water_bucket' });
            }
            
            if (result && result.includes('not found nearby')) {
                return res.status(404).json({ error: result, code: 'no_fish_nearby' });
            }
            
            res.json({ success: true, message: result || `Caught ${fishType}` });
        } catch (error) {
            this.handleError(res, error, 'catchFish');
        }
    }

    async handleShear(req, res) {
        try {
            const { count = 1 } = req.body;
            
            if (typeof count !== 'number' || count < 1 || count > 20) {
                return res.status(400).json({ 
                    error: 'count must be a number between 1 and 20',
                    code: 'invalid_count'
                });
            }

            const command = `!shearSheep(${count})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('do not have')) {
                return res.status(404).json({ error: result, code: 'no_shears' });
            }
            
            if (result && result.includes('No unsheared sheep')) {
                return res.status(404).json({ error: result, code: 'no_sheep_nearby' });
            }
            
            res.json({ success: true, message: result || 'Shearing completed' });
        } catch (error) {
            this.handleError(res, error, 'shear');
        }
    }

    async handleGivePlayer(req, res) {
        try {
            const { player, item, quantity = 1 } = req.body;
            
            if (!player || !item) {
                return res.status(400).json({ error: 'player and item parameters required' });
            }

            const command = `!givePlayer("${player}", "${item}", ${quantity})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'player_not_found' });
            }
            
            if (result && result.includes('do not have')) {
                return res.status(404).json({ error: result, code: 'item_not_found' });
            }
            
            res.json({ success: true, message: result || `Gave ${quantity} ${item} to ${player}` });
        } catch (error) {
            this.handleError(res, error, 'givePlayer');
        }
    }

    async handlePutInChest(req, res) {
        try {
            const { item, quantity = -1 } = req.body;
            
            if (!item) {
                return res.status(400).json({ error: 'item parameter required' });
            }

            const command = `!putInChest("${item}", ${quantity})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'chest_not_found' });
            }
            
            if (result && result.includes('do not have')) {
                return res.status(404).json({ error: result, code: 'item_not_found' });
            }
            
            res.json({ success: true, message: result || `Put ${item} in chest` });
        } catch (error) {
            this.handleError(res, error, 'putInChest');
        }
    }

    async handleTakeFromChest(req, res) {
        try {
            const { item, quantity = -1 } = req.body;
            
            if (!item) {
                return res.status(400).json({ error: 'item parameter required' });
            }

            const command = `!takeFromChest("${item}", ${quantity})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'chest_not_found' });
            }
            
            res.json({ success: true, message: result || `Took ${item} from chest` });
        } catch (error) {
            this.handleError(res, error, 'takeFromChest');
        }
    }

    async handleViewChest(req, res) {
        try {
            const command = '!viewChest';
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'chest_not_found' });
            }
            
            res.json({ success: true, chest_contents: result });
        } catch (error) {
            this.handleError(res, error, 'viewChest');
        }
    }

    async handleChat(req, res) {
        try {
            const { message } = req.body;
            
            if (!message) {
                return res.status(400).json({ error: 'message parameter required' });
            }

            await this.agent.openChat(message);
            
            res.json({ success: true, message: `Sent: ${message}` });
        } catch (error) {
            this.handleError(res, error, 'chat');
        }
    }

    async handleStatus(req, res) {
        try {
            const statsCommand = getCommand('!stats');
            const result = await statsCommand.perform(this.agent);
            
            // Parse bot status
            const bot = this.agent.bot;
            const pos = bot.entity.position;
            
            const status = {
                name: bot.username,
                position: { x: pos.x, y: pos.y, z: pos.z },
                health: bot.health,
                hunger: bot.food,
                gamemode: bot.game.gameMode,
                current_action: this.agent.actions.currentActionLabel || 'Idle',
                is_busy: this.agent.actions.executing,
                time_of_day: bot.time.timeOfDay,
                weather: bot.rainState > 0 ? 'rain' : 'clear',
                raw_stats: result
            };
            
            res.json(status);
        } catch (error) {
            this.handleError(res, error, 'status');
        }
    }

    async handleInventory(req, res) {
        try {
            const inventoryCommand = getCommand('!inventory');
            const result = await inventoryCommand.perform(this.agent);
            
            res.json({ inventory: result, raw: result });
        } catch (error) {
            this.handleError(res, error, 'inventory');
        }
    }



    async handleCraft(req, res) {
        try {
            const { item, quantity = 1 } = req.body;
            
            if (!item) {
                return res.status(400).json({ error: 'item parameter required' });
            }

            const command = `!craftRecipe("${item}", ${quantity})`;
            const result = await executeCommand(this.agent, command);

            // Extract the actual message if result is stringified JSON
            let errorMessage = result;
            try {
                const parsed = JSON.parse(result);
                errorMessage = parsed.error || result;
            } catch (e) {
                // Not JSON, use as-is
            }

            
            if (result && (result.includes('do not have') || result.includes('requires:'))) {
                return res.status(422).json({ error: result, code: 'insufficient_materials' });
            }
            
            if (result && result.includes('Error')) {
                return res.status(500).json({ error: result, code: 'craft_error' });
            }
            
            res.json({ success: true, message: result || `Crafted ${quantity} ${item}` });
        } catch (error) {
            this.handleError(res, error, 'craft');
        }
    }

    async handleSmelt(req, res) {
        try {
            const { item, quantity = 1 } = req.body;
            
            if (!item) {
                return res.status(400).json({ error: 'item parameter required' });
            }

            const command = `!smeltItem("${item}", ${quantity})`;
            console.log(`[handleSmelt] Executing command: ${command}`); 
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('Cannot smelt')) {
                return res.status(400).json({ error: result, code: 'not_smeltable' });
            }
            
            if (result && result.includes('do not have')) {
                return res.status(404).json({ error: result, code: 'item_not_found' });
            }
            
            res.json({ success: true, message: result || `Smelted ${quantity} ${item}` });
        } catch (error) {
            this.handleError(res, error, 'smelt');
        }
    }

    async handleClearFurnace(req, res) {
        try {
            const command = '!clearFurnace';
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'furnace_not_found' });
            }
            
            res.json({ success: true, message: result || 'Cleared furnace' });
        } catch (error) {
            this.handleError(res, error, 'clearFurnace');
        }
    }

    async handleAttackPlayer(req, res) {
        try {
            const { player } = req.body;
            
            if (!player) {
                return res.status(400).json({ error: 'player parameter required' });
            }

            const command = `!attackPlayer("${player}")`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('Could not find')) {
                return res.status(404).json({ error: result, code: 'player_not_found' });
            }
            
            res.json({ success: true, message: result || `Attacking ${player}` });
        } catch (error) {
            this.handleError(res, error, 'attackPlayer');
        }
    }

    async handleDefendSelf(req, res) {
        try {
            const { range = 9 } = req.body;
            
            const command = `!newAction("Defend myself from nearby threats within ${range} blocks")`;
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || 'Defending myself' });
        } catch (error) {
            this.handleError(res, error, 'defendSelf');
        }
    }

    async handleRememberHere(req, res) {
        try {
            const { name } = req.body;
            
            if (!name) {
                return res.status(400).json({ error: 'name parameter required' });
            }

            const command = `!rememberHere("${name}")`;
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || `Saved location as ${name}` });
        } catch (error) {
            this.handleError(res, error, 'rememberHere');
        }
    }

    async handleGoToRememberedPlace(req, res) {
        try {
            const { name } = req.body;
            
            if (!name) {
                return res.status(400).json({ error: 'name parameter required' });
            }

            const command = `!goToRememberedPlace("${name}")`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('No location')) {
                return res.status(404).json({ error: result, code: 'location_not_found' });
            }
            
            res.json({ success: true, message: result || `Going to ${name}` });
        } catch (error) {
            this.handleError(res, error, 'goToRememberedPlace');
        }
    }

    async handleSavedPlaces(req, res) {
        try {
            const command = '!savedPlaces';
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, saved_places: result });
        } catch (error) {
            this.handleError(res, error, 'savedPlaces');
        }
    }

    async handleNearbyBlocks(req, res) {
        try {
            const command = '!nearbyBlocks';
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, nearby_blocks: result });
        } catch (error) {
            this.handleError(res, error, 'nearbyBlocks');
        }
    }

    async handleCraftable(req, res) {
        try {
            const command = '!craftable';
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, craftable_items: result });
        } catch (error) {
            this.handleError(res, error, 'craftable');
        }
    }

    async handleEntities(req, res) {
        try {
            const command = '!entities';
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, nearby_entities: result });
        } catch (error) {
            this.handleError(res, error, 'entities');
        }
    }

    async handleModes(req, res) {
        try {
            const command = '!modes';
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, modes: result });
        } catch (error) {
            this.handleError(res, error, 'modes');
        }
    }

    async handleGetCraftingPlan(req, res) {
        try {
            const { item, quantity = 1 } = req.query;
            
            if (!item) {
                return res.status(400).json({ error: 'item parameter required' });
            }

            const command = `!getCraftingPlan("${item}", ${quantity})`;
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, crafting_plan: result });
        } catch (error) {
            this.handleError(res, error, 'getCraftingPlan');
        }
    }

    async handleGetPlayerPosition(req, res) {
        try {
            const { playerName } = req.query;
            
            if (!playerName) {
                return res.status(400).json({ error: 'playerName query parameter required' });
            }

            const player = this.agent.bot.players[playerName];
            
            if (!player || !player.entity) {
                return res.status(404).json({ 
                    error: `Player ${playerName} not found or not loaded`,
                    code: 'player_not_found'
                });
            }

            // Get bot's current status for context
            const bot = this.agent.bot;
            const statsCommand = getCommand('!stats');
            const rawStats = await statsCommand.perform(this.agent);

            res.json({
                success: true,
                playerName: playerName,
                position: {
                    x: player.entity.position.x,
                    y: player.entity.position.y,
                    z: player.entity.position.z
                },
                health: player.entity.health || 0,
                hunger: bot.food,
                gamemode: bot.game.gameMode,
                current_action: this.agent.actions.currentActionLabel || 'Idle',
                is_busy: this.agent.actions.executing,
                time_of_day: bot.time.timeOfDay,
                weather: bot.rainState > 0 ? 'rain' : 'clear',
                raw_stats: rawStats
            });
        } catch (error) {
            this.handleError(res, error, 'getPlayerPosition');
        }
    }

    async handleIdentifyEntity(req, res) {
        try {
            const { name, count } = req.query;
            const targetCount = count ? parseInt(count) : 1;
            
            if (!name) {
                return res.status(400).json({ error: 'name query parameter required' });
            }

            const bot = this.agent.bot;
            const searchName = name.toLowerCase();

            // Check if worker spawned by this bot FIRST
            if (this.orchestration && this.orchestration.workers.has(name)) {
                const workerInfo = this.orchestration.workers.get(name);
                return res.json({
                    success: true,
                    name: name,
                    type: 'worker',
                    foundOn: 'current',
                    port: workerInfo.port,
                    status: workerInfo.status,
                    pid: workerInfo.process.pid
                });
            }

            console.log(`[API] Searching for ${targetCount > 1 ? targetCount + ' ' : ''}${name}`);
            console.log(`[API] Found entities:`, Object.entries(bot.entities).map(([id, entity]) => ({ 
                id: id, 
                name: entity.username || entity.name || 'unknown',
                type: entity.type || 'unknown' 
            })));

            // Search through all entities by name/displayName
            const matches = [];
            for (const [id, entity] of Object.entries(bot.entities)) {
                if (entity.name?.toLowerCase() === searchName || 
                    entity.displayName?.toLowerCase() === searchName ||
                    entity.username?.toLowerCase() === searchName) {
                    matches.push({
                        id: id,
                        name: entity.username || entity.name || 'unknown',  // Use entity.name instead of displayName
                        displayName: entity.displayName || entity.username,  // Store displayName separately
                        type: entity.type,
                        position: entity.position,
                        health: entity.health
                    });
                    
                    // Stop if we've found enough
                    if (matches.length === targetCount) break;
                }
            }

            if (matches.length === 0) {
                return res.status(200).json({
                    success: false,
                    error: `${name} not found.`,
                    code: 'entity_not_found'
                });
            }

            // Return single or multiple results based on count
            if (targetCount === 1) {
                return res.json({
                    success: true,
                    ...matches[0]
                });
            } else {
                return res.json({
                    success: true,
                    targetCount: targetCount,
                    found: matches.length,
                    entities: matches
                });
            }
        } catch (error) {
            this.handleError(res, error, 'identifyEntity');
        }
    }

    classifyMobType(entity) {
        if (!entity) return 'unknown';

        const name = entity.name?.toLowerCase() || '';

        const animals = ['cow', 'pig', 'sheep', 'horse', 'chicken', 'duck', 'rabbit', 'fox', 'cat', 'dog'];
        if (animals.some(a => name.includes(a))) return 'animal';

        const hostileMobs = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'ghast', 'wither'];
        if (hostileMobs.some(m => name.includes(m))) return 'mob_hostile';

        const neutralMobs = ['bee', 'dolphin', 'wolf', 'iron_golem', 'snow_golem'];
        if (neutralMobs.some(m => name.includes(m))) return 'mob_neutral';

        return 'mob_other';
    }

    async handleSetMode(req, res) {
        try {
            const { mode, enabled } = req.body;
            
            if (!mode || typeof enabled !== 'boolean') {
                return res.status(400).json({ error: 'mode and enabled parameters required' });
            }

            const command = `!setMode("${mode}", ${enabled})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('does not exist')) {
                return res.status(404).json({ error: result, code: 'mode_not_found' });
            }
            
            res.json({ success: true, message: result || `Set ${mode} to ${enabled}` });
        } catch (error) {
            this.handleError(res, error, 'setMode');
        }
    }

    async handleStay(req, res) {
        try {
            const { seconds = 30 } = req.body;
            
            if (typeof seconds !== 'number') {
                return res.status(400).json({ error: 'seconds must be a number' });
            }

            const command = `!stay(${seconds})`;
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || `Staying for ${seconds} seconds` });
        } catch (error) {
            this.handleError(res, error, 'stay');
        }
    }

    async handleGoToBed(req, res) {
        try {
            const command = '!goToBed';
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'bed_not_found' });
            }
            
            res.json({ success: true, message: result || 'Going to bed' });
        } catch (error) {
            this.handleError(res, error, 'goToBed');
        }
    }


    async handleNewAction(req, res) {
        try {
            const { prompt, callbackWebhookUrl, conversationId, sessionId, taskId } = req.body;
            
            if (!prompt) {
                return res.status(400).json({ error: 'prompt parameter required' });
            }

            console.log(`[API] Received newAction: ${prompt.substring(0, 50)}...`);


            // Return 200 immediately - don't wait for task to complete
            res.json({ 
                success: true, 
                message: 'Task queued for execution',
                taskId: Date.now(),
                status: 'queued'
            });

            // Execute task in background (fire and forget)
            setImmediate(async () => {
                try {
                    const taskStartTime = Date.now();
                    
                    const originalBrainMode = settings.brain_mode;
                    const originalHistory = this.agent.history;
                    const originalCoder = this.agent.coder;
                    
                    try {
                        settings.brain_mode = 'internal';
                        this.agent._forceInternalMode = true;
                        
                        this.agent.history = new History(this.agent);
                        this.agent.coder = new Coder(this.agent);
                        this.agent.history.add('user', prompt);
                        
                        const command = `!newAction("${prompt}")`;
                        //console.log(`[API Background newAction] Command to execute:`, command);  // ✅ ADD THIS
                        //console.log(`[API Background newAction] Command length:`, command.length);  // ✅ ADD THIS
                        
                        try {
                            const result = await executeCommand(this.agent, command);
                            console.log(`[API Background newAction] Execute result:`, result);
                        } catch (err) {
                            console.error(`[API Background newAction] Command execution error:`, err);
                            console.error(`[API Background newAction] Stack trace:`, err.stack);
                        }
                        
                        
                        const taskDuration = Date.now() - taskStartTime;
                        const webhookUrl = callbackWebhookUrl || global.workerConfig?.callbackWebhookUrl;
                        //console.log(`[API] Task executed successfully (${taskDuration}ms)`);
                        
                        // Call completion callback
                        if (global.reportTaskCompletion) {
                            console.log(`[API] 📞 Reporting completion...`);
                            await global.reportTaskCompletion({
                                conversationId: conversationId,  // ← Return it!,
                                sessionId: sessionId,
                                taskId: taskId,
                                taskCompleted: prompt.substring(0, 100),
                                blocksPlaced: 100,
                                timeSpent: taskDuration,
                                status: 'success'
                            },
                            webhookUrl
                            );
                        }
                    } finally {
                        settings.brain_mode = originalBrainMode;
                        this.agent.history = originalHistory;
                        this.agent.coder = originalCoder;
                        delete this.agent._forceInternalMode;
                    }
                } catch (error) {
                    console.error(`[API] Background task error:`, error);
                    
                    // Try to report error via callback
                    if (global.reportTaskCompletion) {
                        await global.reportTaskCompletion({
                            taskCompleted: prompt.substring(0, 100),
                            conversationId: conversationId,  // ← Return it!
                            status: 'error',
                            error: error.message
                        });
                    }
                }
            });

        } catch (error) {
            console.error(`[External API] newAction error:`, error);
            this.handleError(res, error, 'newAction');
        }
    }

    async handleStartConversation(req, res) {
        try {
            const { player, message } = req.body;
            
            if (!player || !message) {
                return res.status(400).json({ error: 'player and message parameters required' });
            }

            const command = `!startConversation("${player}", "${message}")`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not a bot')) {
                return res.status(400).json({ error: result, code: 'not_a_bot' });
            }
            
            res.json({ success: true, message: result || `Started conversation with ${player}` });
        } catch (error) {
            this.handleError(res, error, 'startConversation');
        }
    }

    async handleEndConversation(req, res) {
        try {
            const { player } = req.body;
            
            if (!player) {
                return res.status(400).json({ error: 'player parameter required' });
            }

            const command = `!endConversation("${player}")`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('Not in conversation')) {
                return res.status(400).json({ error: result, code: 'not_in_conversation' });
            }
            
            res.json({ success: true, message: result || `Ended conversation with ${player}` });
        } catch (error) {
            this.handleError(res, error, 'endConversation');
        }
    }

    async handleRestart(req, res) {
        try {
            const command = '!restart';
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || 'Restarting agent' });
        } catch (error) {
            this.handleError(res, error, 'restart');
        }
    }

    async handleClearChat(req, res) {
        try {
            const command = '!clearChat';
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || 'Chat history cleared' });
        } catch (error) {
            this.handleError(res, error, 'clearChat');
        }
    }

    async handleLookAtPlayer(req, res) {
        try {
            const { player, direction = 'at' } = req.body;
            
            if (!player) {
                return res.status(400).json({ error: 'player parameter required' });
            }

            if (direction !== 'at' && direction !== 'with') {
                return res.status(400).json({ error: 'direction must be "at" or "with"' });
            }

            const command = `!lookAtPlayer("${player}", "${direction}")`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'player_not_found' });
            }
            
            res.json({ success: true, vision_result: result });
        } catch (error) {
            this.handleError(res, error, 'lookAtPlayer');
        }
    }

    async handleLookAtPosition(req, res) {
        try {
            const { x, y, z } = req.body;
            
            if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
                return res.status(400).json({ error: 'x, y, z coordinates must be numbers' });
            }

            const command = `!lookAtPosition(${x}, ${y}, ${z})`;
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, vision_result: result });
        } catch (error) {
            this.handleError(res, error, 'lookAtPosition');
        }
    }

    async handleEndGoal(req, res) {
        try {
            const command = '!endGoal';
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || 'Goal ended' });
        } catch (error) {
            this.handleError(res, error, 'endGoal');
        }
    }

    async handleAttack(req, res) {
        try {
            const { target } = req.body;
            
            if (!target) {
                return res.status(400).json({ error: 'target parameter required' });
            }

            // Check if target is a player or entity type
            const command = this.agent.bot.players[target] ? 
                `!attackPlayer("${target}")` : 
                `!attack("${target}")`;
                
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('Could not find')) {
                return res.status(200).json({ success: false, error: result, code: 'target_not_found' });
            }
            
            res.json({ success: true, message: result || `Attacking ${target}` });
        } catch (error) {
            this.handleError(res, error, 'attack');
        }
    }



    async handleFollowPlayer(req, res) {
        try {
            const { player, distance = 3 } = req.body;
            
            if (!player) {
                return res.status(400).json({ error: 'player parameter required' });
            }

            // Don't await - just queue the command
            const command = `!followPlayer("${player}", ${distance})`;
            executeCommand(this.agent, command).catch(error => {
                console.error(`Background follow error:`, error);
            });
            
            // Return immediately
            res.json({ 
                success: true, 
                message: `Following ${player}`,
                status: 'queued'
            });
        } catch (error) {
            this.handleError(res, error, 'followPlayer');
        }
    }
    
    async handleKickBot(req, res) {
        try {
            console.log(`[ExternalAPI] Bot kicking itself`);
            
            // Stop all workers before disconnecting
            try {
                await this.orchestration.kickAllWorkers();
                console.log(`✅ All workers stopped before leader disconnect`);
            } catch (error) {
                console.error(`❌ Error stopping workers:`, error);
            }
            
            this.agent.cleanKill('User kicked bot from game', 0);
            res.json({ success: true, message: 'Bot disconnected' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
 
    async handleStop(req, res) {
        try {
            const command = '!stop';
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || 'Stopped all actions' });
        } catch (error) {
            this.handleError(res, error, 'stop');
        }
    }

    async handleVision(req, res) {
        try {
            const { x, y, z, player, direction } = req.body;
            
            let command;
            if (player && direction) {
                command = `!lookAtPlayer("${player}", "${direction}")`;
            } else if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') {
                command = `!lookAtPosition(${x}, ${y}, ${z})`;
            } else {
                return res.status(400).json({ 
                    error: 'Either provide x,y,z coordinates or player + direction' 
                });
            }
            
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, vision_result: result });
        } catch (error) {
            this.handleError(res, error, 'vision');
        }
    }

    async handleGoal(req, res) {
        try {
            const { prompt, action } = req.body;
            
            let command;
            if (action === 'end') {
                command = '!endGoal';
            } else if (prompt) {
                command = `!goal("${prompt}")`;
            } else {
                return res.status(400).json({ 
                    error: 'Either provide prompt to set goal or action: "end" to stop goal' 
                });
            }
            
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result });
        } catch (error) {
            this.handleError(res, error, 'goal');
        }
    }



    handleError(res, error, action) {
        console.error(`External API error in ${action}:`, error);
        
        // Check if agent is busy
        if (this.agent.actions && this.agent.actions.executing) {
            return res.status(409).json({ 
                error: 'Agent is busy with another action', 
                code: 'busy',
                current_action: this.agent.actions.currentActionLabel 
            });
        }
        
        // Handle external brain mode specific errors
        if (error.message && error.message.includes('coder')) {
            return res.status(400).json({
                error: 'External brain mode: complex actions should be handled by the workflow AI brain',
                code: 'external_brain_required',
                details: 'This action requires the external AI brain to break it down into simpler commands'
            });
        }
        
        // Generic error response
        res.status(500).json({ 
            error: 'Internal server error', 
            code: 'internal_error',
            action: action,
            details: error.message 
        });
    }

    // Multi-bot management handlers (Updated to use OrchestrationAPI)

    // this one can still be used it user requests to deploy workers without specifying a task
    async handleSpawnWorkers(req, res) {
        try {
            const { count, basePort = settings.worker_base_port, sessionId } = req.body;
            
            if (!count || typeof count !== 'number' || count <= 0) {
                return res.status(400).json({ 
                    error: 'count parameter must be a positive number' 
                });
            }
            
            if (count > 10) {
                return res.status(400).json({ 
                    error: 'Maximum 10 workers allowed per request' 
                });
            }
            
            const spawnResults = [];

            // Simply spawn workers - spawnWorker handles port auto-finding
            for (let i = 0; i < count; i++) {
                this.orchestration.workerCounter++;
                const workerName = `${this.agent.name}_W${i + 1}`;
                const requestedPort = basePort + i;
                
                console.log(`[API] Spawning ${workerName}, requesting port ${requestedPort}`);

                const result = await this.orchestration.spawnWorker(
                    workerName,
                    requestedPort,
                    sessionId || `session_${Date.now()}`,
                    settings.n8n_callback_url
                );
                
                spawnResults.push(result);

                if (!result.success) {
                    console.error(`[API] Failed to spawn ${workerName}:`, result.error);
                }
            }
            
            const successCount = spawnResults.filter(r => r.success).length;
            const status = this.orchestration.getStatus();
            
            // HTTP status codes
            const responseStatus = successCount === count ? 202 : (successCount > 0 ? 207 : 500);
            
            res.status(responseStatus).json({
                success: successCount === count,
                totalRequested: count,
                successfulSpawns: successCount,
                results: spawnResults,
                message: `Spawned ${successCount}/${count} workers`,
                ports: {
                    requested: spawnResults.map(r => r.requestedPort),
                    assigned: spawnResults.map(r => r.assignedPort)
                }
            });
            
        } catch (error) {
            console.error('[API] Error in handleSpawnWorkers:', error);
            this.handleError(res, error, 'spawnWorkers');
        }
}

    async handleCoordinateBuild(req, res) {
        try {
            const { buildRequest, workerCount, sessionId } = req.body;
            
            if (!buildRequest || typeof buildRequest !== 'string') {
                return res.status(400).json({ 
                    error: 'buildRequest parameter required' 
                });
            }
            
            if (!workerCount || typeof workerCount !== 'number' || workerCount <= 0) {
                return res.status(400).json({ 
                    error: 'workerCount parameter must be a positive number' 
                });
            }
            
            // Create a build session using OrchestrationAPI
            const sessionResult = this.orchestration.createTaskSession(
                sessionId || `build_${Date.now()}`,
                buildRequest,
                workerCount
            );
            
            res.status(201).json({
                success: true,
                ...sessionResult,
                message: `Build session created. Next: spawn workers and register them to this session.`,
                nextSteps: [
                    `1. Spawn ${workerCount} workers using /api/orchestration/spawn-worker`,
                    `2. Wait for workers using /api/orchestration/wait-workers`,
                    `3. Register workers using /api/orchestration/register-workers`,
                    `4. Reserve location using /api/orchestration/reserve-location`,
                    `5. Teleport workers using /api/orchestration/teleport-workers`,
                    `6. Send tasks using /api/orchestration/send-task`
                ]
            });
            
        } catch (error) {
            this.handleError(res, error, 'coordinateBuild');
        }
    }

    async handleAssignTasks(req, res) {
        try {
            const { sessionId, taskBreakdown } = req.body;
            
            if (!sessionId) {
                return res.status(400).json({ 
                    error: 'sessionId parameter required' 
                });
            }
            
            if (!taskBreakdown || !Array.isArray(taskBreakdown)) {
                return res.status(400).json({ 
                    error: 'taskBreakdown parameter must be an array of tasks' 
                });
            }
            
            // Get session and workers
            const session = this.orchestration.buildSessions.get(sessionId);
            if (!session) {
                return res.status(404).json({
                    error: `Build session ${sessionId} not found`
                });
            }
            
            if (!session.workers || session.workers.length === 0) {
                return res.status(400).json({
                    error: `No workers registered for session ${sessionId}. Register workers first.`
                });
            }
            
            // Assign tasks to workers (round-robin)
            const assignments = [];
            for (let i = 0; i < taskBreakdown.length; i++) {
                const task = taskBreakdown[i];
                const worker = session.workers[i % session.workers.length];
                
                const result = await this.orchestration.sendTaskToWorker(
                    worker.port,
                    task.prompt || task.description || task
                );
                
                assignments.push({
                    taskIndex: i,
                    task: task,
                    assignedTo: worker.name,
                    workerPort: worker.port,
                    success: result.success,
                    result: result
                });
            }
            
            const successCount = assignments.filter(a => a.success).length;
            
            res.json({
                success: true,
                sessionId: sessionId,
                assignments: assignments,
                tasksAssigned: successCount,
                totalTasks: taskBreakdown.length,
                message: `Assigned ${successCount}/${taskBreakdown.length} tasks to ${session.workers.length} workers`
            });
            
        } catch (error) {
            this.handleError(res, error, 'assignTasks');
        }
    }

    async handleTeleport(req, res) {
        try {
            const { x, y, z } = req.body;
            
            const coordValidation = this.validateAndRoundCoordinates(x, y, z);
            if (typeof coordValidation === 'string') {
                return res.status(400).json({ 
                    error: coordValidation,
                    code: 'invalid_coordinates'
                });
            }

            const bot = this.getBotSafely();
            if (!bot) {
                return res.status(503).json({ 
                    error: 'Bot not available',
                    code: 'bot_unavailable'
                });
            }

            // Use goToCoordinates command to actually move the bot
            const command = `!goToCoordinates(${coordValidation.x}, ${coordValidation.y}, ${coordValidation.z}, 1)`;
            const result = await executeCommand(this.agent, command);

            res.json({ 
                success: true, 
                message: result || `Teleported to ${coordValidation.x}, ${coordValidation.y}, ${coordValidation.z}`,
                position: coordValidation
            });
        } catch (error) {
            this.handleError(res, error, 'teleport');
        }
    }


    /**
     * Teleport workers to a player's location
     * POST /api/orchestration/teleport-to-player
     * Body: { sessionId, playerName }
     */
    async handleOrchestrationTeleportToPlayer(req, res) {
        try {
            const { sessionId, playerName } = req.body;

            if (!sessionId || !playerName) {
                return res.status(400).json({
                    error: 'sessionId and playerName parameters required'
                });
            }

            const result = await this.orchestration.teleportWorkersToPlayer(
                sessionId,
                playerName,
                this.agent
            );

            if (result.success) {
                res.json(result);
            } else {
                res.status(404).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationTeleportToPlayer');
        }
    }

    async handleMultiBotStatus(req, res) {
        try {
            const status = this.orchestration.getStatus();
            
            res.json({
                success: true,
                ...status
            });
            
        } catch (error) {
            this.handleError(res, error, 'multiBotStatus');
        }
    }

    async handleStopWorkers(req, res) {
        try {
            const result = await this.orchestration.stopAllWorkers();
            
            res.json({
                success: true,
                ...result
            });
            
        } catch (error) {
            this.handleError(res, error, 'stopWorkers');
        }
    }
    // ===================================================================
    // ORCHESTRATION API HANDLERS (n8n Integration)
    // ===================================================================

    /**
     * Spawn a single worker bot
     * POST /api/orchestration/spawn-worker
     * Body: { name, port, sessionId, callbackWebhookUrl }
     */
    async handleOrchestrationSpawnWorker(req, res) {
        try {
            const { name, port, sessionId, callbackWebhookUrl } = req.body;

            if (!name || !port) {
                return res.status(400).json({
                    error: 'name and port parameters required'
                });
            }

            const result = await this.orchestration.spawnWorker(
                name,
                port,
                sessionId || `session_${Date.now()}`,
                callbackWebhookUrl || settings.n8n_callback_url
            );

            if (result.success) {
                res.status(202).json(result); // 202 Accepted
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationSpawnWorker');
        }
    }
    // For multiple workers
    async handleOrchestrationSpawnWorkers(req, res) {
        try {
            const count = Number(req.body.count);  // ← Convert to number
            const { basePort = settings.worker_base_port, sessionId, callbackWebhookUrl } = req.body;

            if (!count || typeof count !== 'number' || count <= 0) {
                return res.status(400).json({ 
                    error: 'count parameter must be a positive number' 
                });
            }

            const spawnResults = [];
            let currentPort = basePort;
            
            for (let i = 0; i < count; i++) {
                const workerName = `${this.agent.name}_W${i + 1}`;
                
                const result = await this.orchestration.spawnWorker(
                    workerName,
                    currentPort,
                    sessionId || `session_${Date.now()}`,
                    callbackWebhookUrl || settings.n8n_callback_url
                );
                
                spawnResults.push(result);
                if (result.success) {
                    currentPort = result.port + 1; // Next port
                }
        }

        const successCount = spawnResults.filter(r => r.success).length;
        res.status(202).json({
            success: true,
            spawned: successCount,
            totalRequested: count,
            results: spawnResults
        });
        
    } catch (error) {
        this.handleError(res, error, 'orchestrationSpawnWorkers');
    }
    }

    /**
     * Wait for workers to be ready
     * POST /api/orchestration/wait-workers
     * Body: { workers: [ { name, port }, ... ], timeoutMs: 30000 }
     */
    async handleOrchestrationWaitWorkers(req, res) {
        try {
            const { workers, timeoutMs = 30000 } = req.body;

            if (!workers || !Array.isArray(workers)) {
                return res.status(400).json({
                    error: 'workers array parameter required'
                });
            }

            const result = await this.orchestration.waitForWorkersReady(workers, timeoutMs);

            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'orchestrationWaitWorkers');
        }
    }

    /**
     * Create a new build session
     * POST /api/orchestration/create-session
     * Body: { sessionId, buildRequest, workerCount }
     */
    async handleOrchestrationCreateSession(req, res) {
        try {
            const { sessionId, taskRequest, workerCount } = req.body;

            if (!sessionId || !taskRequest) {
                return res.status(400).json({
                    error: 'sessionId and taskRequest parameters required'
                });
            }

            const result = this.orchestration.createTaskSession(
                sessionId,
                taskRequest,
                workerCount || 0
            );

            res.status(201).json(result); // 201 Created
        } catch (error) {
            this.handleError(res, error, 'orchestrationCreateSession');
        }
    }

    /**
     * Register workers for a session
     * POST /api/orchestration/register-workers
     * Body: { sessionId, workers: [ { name, port }, ... ] }
     */
    async handleOrchestrationRegisterWorkers(req, res) {
        try {
            const { sessionId, workers } = req.body;

            if (!sessionId || !workers) {
                return res.status(400).json({
                    error: 'sessionId and workers parameters required'
                });
            }

            const result = this.orchestration.registerWorkersForSession(sessionId, workers);

            if (result.success) {
                res.json(result);
            } else {
                res.status(404).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationRegisterWorkers');
        }
    }

    /**
     * Reserve a build location
     * POST /api/orchestration/reserve-location
     * Body: { sessionId, preferredLocation: { x, y, z }, minDistance: 30 }
     */
    async handleOrchestrationReserveLocation(req, res) {
        try {
            const { sessionId, preferredLocation: pref, minDistance = 30 } = req.body;

            let preferredLocation = typeof pref === 'string' ? JSON.parse(pref) : pref; 
            if (!sessionId || !preferredLocation) {
                return res.status(400).json({
                    error: 'sessionId and preferredLocation parameters required'
                });
            }


            if (typeof preferredLocation.x !== 'number' || 
                typeof preferredLocation.y !== 'number' || 
                typeof preferredLocation.z !== 'number') {
                return res.status(400).json({
                    error: 'preferredLocation must have x, y, z as numbers'
                });
            }
            // Optional: minY can be included but isn't required
            if (preferredLocation.minY !== undefined && typeof preferredLocation.minY !== 'number') {
                return res.status(400).json({
                    error: 'preferredLocation.minY must be a number if provided'
                });
        }

            const result = this.orchestration.reserveBuildLocation(
                sessionId,
                preferredLocation,
                minDistance
            );

            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'orchestrationReserveLocation');
        }
    }

    // Teleport a specific worker to location
    async handleOrchestrationTeleportWorker(req, res) {
        try {
            const { sessionId, workerName, taskLocation } = req.body;

            if (!sessionId || !workerName || !taskLocation) {
                return res.status(400).json({
                    error: 'sessionId, workerName and taskLocation parameters required'
                });
            }

            if (typeof taskLocation.x !== 'number' || 
                typeof taskLocation.y !== 'number' || 
                typeof taskLocation.z !== 'number') {
                return res.status(400).json({
                    error: 'taskLocation must have x, y, z as numbers'
                });
            }

            const result = await this.orchestration.teleportWorker(sessionId, workerName, taskLocation);

            if (result.success) {
                res.json(result);
            } else {
                res.status(404).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationTeleportWorker');
        }
}

    /**
     * Teleport all workers in the session to task location
     * POST /api/orchestration/teleport-workers
     * Body: { sessionId, buildLocation: { x, y, z } }
     */
    async handleOrchestrationTeleportWorkers(req, res) {
        try {
            const { sessionId, taskLocation } = req.body;

            if (!sessionId || !taskLocation) {
                return res.status(400).json({
                    error: 'sessionId and taskLocation parameters required'
                });
            }

            if (typeof taskLocation.x !== 'number' || 
                typeof taskLocation.y !== 'number' || 
                typeof taskLocation.z !== 'number') {
                return res.status(400).json({
                    error: 'buildLocation must have x, y, z as numbers'
                });
            }

            const result = await this.orchestration.teleportWorkers(sessionId, taskLocation);

            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'orchestrationTeleportWorkers');
        }
    }

    /**
     * Send a task to a worker
     * POST /api/orchestration/send-task
     * Body: { workerPort, taskPrompt }
     */
    async handleOrchestrationSendTask(req, res) {
        try {
            const { workerPort, taskPrompt, conversationId, callbackWebhookUrl, taskId} = req.body;

            if (!workerPort || !taskPrompt) {
                return res.status(400).json({
                    error: 'workerPort and taskPrompt parameters required'
                });
            }

            const result = await this.orchestration.sendTaskToWorker(workerPort, 
                                            taskPrompt, 
                                            conversationId,
                                            callbackWebhookUrl || settings.n8n_callback_url,
                                            taskId || null);

            if (result.success) {
                res.json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationSendTask');
        }
    }

 
    // This is a NEW webhook endpoint (not the same as the worker callback)

    /**
     * Handle stage task completion callback from worker
     * Called by worker when a stage task completes (via n8n webhook trigger)
     * 
     * This endpoint receives the taskId and correlates it back to the original request
     * 
     * POST /api/orchestration/task-complete
     * Body: {
     *   taskId: "task_build_123_stage1_Worker1_...",
     *   sessionId: "build_123",
     *   stageNumber: 1,
     *   worker: "Worker1",
     *   status: "completed",
     *   result: { ... },
     *   completionTime: "2025-11-19T..."
     * }
     */
    async handleOrchestrationTaskComplete(req, res) {
        try {
            const { taskId, sessionId, stageNumber, worker, status, result, completionTime } = req.body;

            if (!taskId || !sessionId || !stageNumber || !worker) {
            return res.status(400).json({
                error: 'Missing required parameters: taskId, sessionId, stageNumber, worker',
                code: 'missing_parameters'
            });
            }

            console.log(`[API] Received task-complete callback`);
            console.log(`   Task ID: ${taskId}`);
            console.log(`   Session: ${sessionId}`);
            console.log(`   Stage: ${stageNumber}`);
            console.log(`   Worker: ${worker}`);
            console.log(`   Status: ${status}`);

            // Update task metadata in orchestration API
            const updateResult = await this.orchestration.handleTaskStageComplete(taskId, {
            status: status,
            result: result,
            completionTime: completionTime
            });

            if (updateResult.success) {
            console.log(`✅ Task ${taskId} marked as complete`);
            
            res.json({
                success: true,
                taskId: taskId,
                sessionId: sessionId,
                stageNumber: stageNumber,
                worker: worker,
                message: `Task ${taskId} completion recorded`,
                duration: updateResult.duration
            });
            } else {
            console.warn(`⚠️  Task ${taskId} completion recorded but metadata update failed`);
            
            res.status(404).json({
                error: `Task ${taskId} not found in tracking`,
                code: 'task_not_found'
            });
            }
        } catch (error) {
            console.error(`[API] Error in task-complete:`, error);
            this.handleError(res, error, 'orchestrationTaskComplete');
        }
        }


    // Add this handler to the ExternalAPI class in external_api.js
// Place it in the "ORCHESTRATION API HANDLERS" section

/**
 * Send a task for a specific stage to a worker
 * POST /api/orchestration/send-task-stage
 * Body: { sessionId, stageNumber, worker, port, taskPrompt, callbackWebhookUrl }
 */
    async handleOrchestrationSendTaskStage(req, res) {
        try {
            const { sessionId, stageNumber, worker, port, taskPrompt, callbackWebhookUrl, conversationId } = req.body;

            // Validate required parameters
            if (!sessionId || !stageNumber || !worker || !port || !taskPrompt) {
            return res.status(400).json({
                error: 'Missing required parameters: sessionId, stageNumber, worker, port, taskPrompt',
                code: 'missing_parameters'
            });
            }

            // Validate types
            if (typeof stageNumber !== 'number' || stageNumber < 1) {
            return res.status(400).json({
                error: 'stageNumber must be a positive integer',
                code: 'invalid_stage'
            });
            }

            if (typeof port !== 'number' || port < 1024 || port > 65535) {
            return res.status(400).json({
                error: 'port must be a valid port number (1024-65535)',
                code: 'invalid_port'
            });
            }

            if (typeof taskPrompt !== 'string' || taskPrompt.length === 0) {
            return res.status(400).json({
                error: 'taskPrompt must be a non-empty string',
                code: 'invalid_prompt'
            });
            }

            console.log(`[API] Received send-task-stage request:`);
            console.log(`   Session: ${sessionId}`);
            console.log(`   Stage: ${stageNumber}`);
            console.log(`   Worker: ${worker}`);
            console.log(`   Port: ${port}`);
            console.log(`   Prompt length: ${taskPrompt.length}`);

            // Send task via orchestration API
            const result = await this.orchestration.sendTaskStage(
                sessionId,
                stageNumber,
                worker,
                port,
                taskPrompt,
                conversationId,
                callbackWebhookUrl || settings.n8n_callback_url
            );

            if (result.success) {
            res.status(202).json(result); // 202 Accepted
            } else {
            res.status(500).json(result);
            }
        } catch (error) {
            console.error(`[API] Error in send-task-stage:`, error);
            this.handleError(res, error, 'orchestrationSendTaskStage');
        }
    }

/**
 * Get stage task metadata and status
 * GET /api/orchestration/task-status/:taskId
 */
    async handleOrchestrationTaskStatus(req, res) {
        try {
            const { taskId } = req.params;

            if (!taskId) {
            return res.status(400).json({
                error: 'taskId parameter required',
                code: 'missing_parameter'
            });
            }

            const metadata = this.orchestration.getTaskMetadata(taskId);

            if (!metadata) {
            return res.status(404).json({
                error: `Task ${taskId} not found`,
                code: 'task_not_found'
            });
            }

            res.json({
            success: true,
            task: metadata
            });
        } catch (error) {
            console.error(`[API] Error in task-status:`, error);
            this.handleError(res, error, 'orchestrationTaskStatus');
        }
    }

/**
 * Get all tasks for a session
 * GET /api/orchestration/session-tasks/:sessionId
 */
async handleOrchestrationSessionTasks(req, res) {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        error: 'sessionId parameter required',
        code: 'missing_parameter'
      });
    }

    const tasks = this.orchestration.getSessionTasks(sessionId);

    res.json({
      success: true,
      sessionId: sessionId,
      totalTasks: tasks.length,
      tasks: tasks
    });
  } catch (error) {
    console.error(`[API] Error in session-tasks:`, error);
    this.handleError(res, error, 'orchestrationSessionTasks');
  }
}

    /**
    * Get all tasks for a specific stage
    * GET /api/orchestration/stage-tasks/:sessionId/:stageNumber
    */
    async handleOrchestrationStageTasks(req, res) {
        try {
            const { sessionId, stageNumber } = req.params;

            if (!sessionId || !stageNumber) {
            return res.status(400).json({
                error: 'sessionId and stageNumber parameters required',
                code: 'missing_parameters'
            });
            }

            const stageNum = parseInt(stageNumber);
            if (isNaN(stageNum) || stageNum < 1) {
            return res.status(400).json({
                error: 'stageNumber must be a positive integer',
                code: 'invalid_stage'
            });
            }

            const tasks = this.orchestration.getStageTasks(sessionId, stageNum);

            res.json({
            success: true,
            sessionId: sessionId,
            stageNumber: stageNum,
            totalTasks: tasks.length,
            tasks: tasks,
            allComplete: tasks.length > 0 && tasks.every(t => t.status === 'completed')
            });
        } catch (error) {
            console.error(`[API] Error in stage-tasks:`, error);
            this.handleError(res, error, 'orchestrationStageTasks');
        }
        }

    /**
     * Get orchestration status
     * GET /api/orchestration/status
     */
    async handleOrchestrationStatus(req, res) {
        try {
            const status = this.orchestration.getStatus();
            res.json(status);
        } catch (error) {
            this.handleError(res, error, 'orchestrationStatus');
        }
    }


    async handleMoveWorkerToPlayer(req, res) {
        const { workerName, playerName, distance = 1 } = req.body;
        if (workerName === 'all') {
            const results = [];
            for (const [name, worker] of this.orchestration.workers) {
                const result = await this.orchestration.moveWorkerToPlayer(name, playerName, distance);
                results.push({ workerName: name, ...result });
            }
            return res.json({ 
                success: true, 
                movedWorkers: results.length,
                results: results
             }); 
        }
        const result = await this.orchestration.moveWorkerToPlayer(workerName, playerName, distance);
        res.json(result);
    }

    async handleMoveWorkerTo(req, res) {
        const { workerName, x, y, z } = req.body;
        if (workerName === 'all') {
            const results = [];
            for (const [name, worker] of this.orchestration.workers) {
                const result = await this.orchestration.moveWorkerToCoordinates(name, x, y, z);
                results.push({ workerName: name, ...result });
            }
            return res.json({ 
                success: true, 
                movedWorkers: results.length,
                results: results 
            });
        }

        const result = await this.orchestration.moveWorkerToCoordinates(workerName, x, y, z);
        res.json(result);
    }


    /**
     * Arm all workers in a session with equipment
     * POST /api/orchestration/arm-workers
     * Body: { 
     *   sessionId: "combat_123",
     *   equipment: {
     *     weapon: "diamond_sword",        // optional, default: iron_sword
     *     armor: ["iron_helmet", ...],    // optional, default: full iron
     *     offhand: "shield",              // optional, default: shield
     *     extras: ["golden_apple", ...]   // optional, additional items
     *   }
     * }
     */
    async handleOrchestrationArmWorkers(req, res) {
        try {
            const { sessionId, equipment } = req.body;

            if (!sessionId) {
                return res.status(400).json({
                    error: 'sessionId parameter required'
                });
            }

            const result = await this.orchestration.armWorkers(sessionId, equipment || {});

            if (result.success) {
                res.json(result);
            } else {
                res.status(404).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationArmWorkers');
        }
    }

    /**
     * Arm a single worker with equipment
     * POST /api/orchestration/arm-worker
     * Body: { 
     *   workerName: "Soldier1",
     *   equipment: { weapon: "diamond_sword", ... }
     * }
     */
    async handleOrchestrationArmWorker(req, res) {
        try {
            const { workerName, equipment } = req.body;

            if (!workerName) {
                return res.status(400).json({
                    error: 'workerName parameter required'
                });
            }

            const result = await this.orchestration.armWorker(workerName, equipment || {});

            if (result.success) {
                res.json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationArmWorker');
        }
    }

    /**
     * Stop a specific worker
     * POST /api/orchestration/stop-worker
     * Body: { workerName }
     */
    async handleOrchestrationStopWorker(req, res) {
        try {
            const { workerName } = req.body;

            if (!workerName) {
                return res.status(400).json({
                    error: 'workerName parameter required'
                });
            }

            const result = await this.orchestration.stopWorker(workerName);

            if (result.success) {
                res.json(result);
            } else {
                res.status(404).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationStopWorker');
        }
    }

    /**
     * Stop all workers and clean up
     * POST /api/orchestration/stop-all
     */
    async handleOrchestrationStopAll(req, res) {
        try {
            const result = await this.orchestration.stopAllWorkers();
            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'orchestrationStopAll');
        }
    }

    async handleOrchestrationKickAll(req, res) {
        try {
            const result = await this.orchestration.kickAllWorkers();
            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'orchestrationKickAll');
        }
    }

    // Mark a worker as ready (available for new tasks)

    async handleOrchestrationWorkerReady(req, res) {
        try {
            const { workerName } = req.body;
            if (!workerName) {
                return res.status(400).json({ error: 'workerName required' });
            }
            const result = this.orchestration.markWorkerReady(workerName);
            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'orchestrationWorkerReady');
        }
    }

    // Check if specific workers are available

    async handleOrchestrationCheckWorkers(req, res) {
        try {
            const { workerNames } = req.body;
            if (!Array.isArray(workerNames)) {
                return res.status(400).json({ error: 'workerNames array required' });
            }
            const result = this.orchestration.checkWorkersAvailable(workerNames);
            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'orchestrationCheckWorkers');
        }
    }

    async handleOrchestrationVerifyPermissions(req, res) {
        try {
            const { sessionId } = req.body;

            if (!sessionId) {
                return res.status(400).json({ error: 'sessionId required' });
            }

            const result = await this.orchestration.verifyWorkerRegistration(sessionId);
            
            res.json(result);
        } catch (error) {
            this.handleError(res, error, 'verifyPermissions');
        }
    }

    start(port = settings.api_gateway_port) {
        return new Promise((resolve) => {
            this.server = this.app.listen(port, () => {
                console.log(`API server running on port ${port}`);
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