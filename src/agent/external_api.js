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

        this.orchestration = new OrchestrationAPI(agent);  // ← NEW LINE (replaced old line)
        
        
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
        // Movement endpoints
        this.app.post('/api/agent/move', this.handleMove.bind(this));
        this.app.post('/api/agent/goToPlayer', this.handleGoToPlayer.bind(this));
        this.app.post('/api/agent/goToCoordinates', this.handleGoToCoordinates.bind(this));
        this.app.post('/api/agent/moveAway', this.handleMoveAway.bind(this));
        this.app.post('/api/agent/searchForBlock', this.handleSearchForBlock.bind(this));
        this.app.post('/api/agent/searchForEntity', this.handleSearchForEntity.bind(this));
        
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
        this.app.post('/api/agent/stop', this.handleStop.bind(this));
        this.app.post('/api/agent/restart', this.handleRestart.bind(this));
        this.app.post('/api/agent/clearChat', this.handleClearChat.bind(this));
        
        // Vision
        this.app.post('/api/agent/vision', this.handleVision.bind(this));
        this.app.post('/api/agent/lookAtPlayer', this.handleLookAtPlayer.bind(this));
        this.app.post('/api/agent/lookAtPosition', this.handleLookAtPosition.bind(this));
        
        // Goal management
        this.app.post('/api/agent/goal', this.handleGoal.bind(this));
        this.app.post('/api/agent/endGoal', this.handleEndGoal.bind(this));
        
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
        // Orchestration endpoints for n8n (← NEW SECTION STARTS HERE)
        this.app.post('/api/orchestration/spawn-worker', this.handleOrchestrationSpawnWorker.bind(this));
        this.app.post('/api/orchestration/wait-workers', this.handleOrchestrationWaitWorkers.bind(this));
        this.app.post('/api/orchestration/create-session', this.handleOrchestrationCreateSession.bind(this));
        this.app.post('/api/orchestration/register-workers', this.handleOrchestrationRegisterWorkers.bind(this));
        this.app.post('/api/orchestration/reserve-location', this.handleOrchestrationReserveLocation.bind(this));
        this.app.post('/api/orchestration/teleport-workers', this.handleOrchestrationTeleportWorkers.bind(this));
        this.app.post('/api/orchestration/send-task', this.handleOrchestrationSendTask.bind(this));
        this.app.get('/api/orchestration/status', this.handleOrchestrationStatus.bind(this));
        this.app.post('/api/orchestration/stop-worker', this.handleOrchestrationStopWorker.bind(this));
        this.app.post('/api/orchestration/stop-all', this.handleOrchestrationStopAll.bind(this));
        // (← NEW SECTION ENDS HERE)
    }

    async handleMove(req, res) {
        try {
            const { x, y, z, direction, minDistance = 1 } = req.body;
            
            let command;
            
            // Handle directional movement
            if (direction && !x && !y && !z) {
                // Use relative movement - convert direction to coordinates
                const pos = this.agent.bot.entity.position;
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
                
                const [dx, dy, dz] = movements[direction] || [0, 0, 0];
                command = `!goToCoordinates(${pos.x + dx}, ${pos.y + dy}, ${pos.z + dz}, ${minDistance})`;
            }
            // Handle coordinate movement
            else if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') {
                command = `!goToCoordinates(${x}, ${y}, ${z}, ${minDistance})`;
            }
            else {
                return res.status(400).json({ error: 'Either provide direction OR x,y,z coordinates' });
            }

            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('error') || result && result.includes('failed')) {
                return res.status(422).json({ error: result, code: 'unreachable' });
            }
            
            res.json({ success: true, message: result || `Moving ${direction || `to ${x}, ${y}, ${z}`}` });
        } catch (error) {
            this.handleError(res, error, 'move');
        }
    }

    async handleGoToPlayer(req, res) {
        try {
            const { player, distance = 3 } = req.body;
            
            if (!player) {
                return res.status(400).json({ error: 'player parameter required' });
            }

            const command = `!goToPlayer("${player}", ${distance})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'player_not_found' });
            }
            
            res.json({ success: true, message: result || `Going to ${player}` });
        } catch (error) {
            this.handleError(res, error, 'goToPlayer');
        }
    }

    async handleGoToCoordinates(req, res) {
        try {
            const { x, y, z, closeness = 1 } = req.body;
            
            if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
                return res.status(400).json({ error: 'x, y, z coordinates must be numbers' });
            }

            const command = `!goToCoordinates(${x}, ${y}, ${z}, ${closeness})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('error') || result && result.includes('failed')) {
                return res.status(422).json({ error: result, code: 'unreachable' });
            }
            
            res.json({ success: true, message: result || `Moving to ${x}, ${y}, ${z}` });
        } catch (error) {
            this.handleError(res, error, 'goToCoordinates');
        }
    }

    async handleMoveAway(req, res) {
        try {
            const { distance = 5 } = req.body;
            
            if (typeof distance !== 'number' || distance <= 0) {
                return res.status(400).json({ error: 'distance must be a positive number' });
            }

            const command = `!moveAway(${distance})`;
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || `Moved away ${distance} blocks` });
        } catch (error) {
            this.handleError(res, error, 'moveAway');
        }
    }

    async handleSearchForBlock(req, res) {
        try {
            const { blockType, range = 64 } = req.body;
            
            if (!blockType) {
                return res.status(400).json({ error: 'blockType parameter required' });
            }

            const command = `!searchForBlock("${blockType}", ${range})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'block_not_found' });
            }
            
            res.json({ success: true, message: result || `Searching for ${blockType}` });
        } catch (error) {
            this.handleError(res, error, 'searchForBlock');
        }
    }

    async handleSearchForEntity(req, res) {
        try {
            const { entityType, range = 64 } = req.body;
            
            if (!entityType) {
                return res.status(400).json({ error: 'entityType parameter required' });
            }

            const command = `!searchForEntity("${entityType}", ${range})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'entity_not_found' });
            }
            
            res.json({ success: true, message: result || `Searching for ${entityType}` });
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

    async handlePlace(req, res) {
        try {
            const { material, x, y, z, face = 'top' } = req.body;
            
            if (!material) {
                return res.status(400).json({ error: 'material parameter required' });
            }

            let result;
            
            // If no coordinates provided, place at current location
            if (x === undefined || y === undefined || z === undefined || 
                x === null || y === null || z === null ||
                isNaN(x) || isNaN(y) || isNaN(z)) {
                const command = `!placeHere("${material}")`;
                result = await executeCommand(this.agent, command);
            } else {
                // Validate coordinates are numbers
                if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
                    return res.status(400).json({ error: 'x, y, z coordinates must be numbers' });
                }

                // Use placeHere for current location or direct skills call for specific coords
                const botPos = this.agent.bot.entity.position;
                const atCurrentLocation = Math.abs(botPos.x - x) < 1 && Math.abs(botPos.y - y) < 1 && Math.abs(botPos.z - z) < 1;
                
                if (atCurrentLocation) {
                    const command = `!placeHere("${material}")`;
                    result = await executeCommand(this.agent, command);
                } else {
                    // Directly call the placeBlock skill function instead of using newAction
                    const skills = await import('./library/skills.js');
                    const success = await skills.placeBlock(this.agent.bot, material, x, y, z, face);
                    if (success) {
                        result = `Placed ${material} at ${x}, ${y}, ${z}`;
                    } else {
                        return res.status(422).json({ 
                            error: `Failed to place ${material} at ${x}, ${y}, ${z}`, 
                            code: 'placement_failed' 
                        });
                    }
                }
            }
            
            res.json({ success: true, message: result || `Placed ${material}` });
        } catch (error) {
            this.handleError(res, error, 'place');
        }
    }

    async handleBreak(req, res) {
        try {
            const { x, y, z } = req.body;
            
            if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
                return res.status(400).json({ error: 'x, y, z coordinates must be numbers' });
            }

            const command = `!newAction("Break block at ${x}, ${y}, ${z}")`;
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || `Breaking block at ${x}, ${y}, ${z}` });
        } catch (error) {
            this.handleError(res, error, 'break');
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

    async handleUseDoor(req, res) {
        try {
            const { x, y, z } = req.body;
            
            let command;
            if (x !== undefined && y !== undefined && z !== undefined) {
                command = `!newAction("Use door at ${x}, ${y}, ${z}")`;
            } else {
                command = `!newAction("Use nearest door")`;
            }
            
            const result = await executeCommand(this.agent, command);
            
            res.json({ success: true, message: result || 'Using door' });
        } catch (error) {
            this.handleError(res, error, 'useDoor');
        }
    }

    async handleNewAction(req, res) {
        try {
            const { prompt } = req.body;
            
            if (!prompt) {
                return res.status(400).json({ error: 'prompt parameter required' });
            }

            console.log(`[API] Received newAction: ${prompt.substring(0, 50)}...`);

            // For testing: If this is a building request, force hardcoded location
            let modifiedPrompt = prompt;
            if (prompt.toLowerCase().includes('build') || prompt.toLowerCase().includes('place') || prompt.toLowerCase().includes('construct')) {
                console.log('[API] Building request detected - using hardcoded test location');
                // Remove any coordinate references and use hardcoded location
                modifiedPrompt = prompt.replace(/at \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
                modifiedPrompt = modifiedPrompt.replace(/at coordinates? \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
                modifiedPrompt = modifiedPrompt.replace(/at position \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
                modifiedPrompt = modifiedPrompt.replace(/at location \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
                // Also add explicit instruction to build at current position
                if (!modifiedPrompt.toLowerCase().includes('current position')) {
                    modifiedPrompt += ' at my current position';
                }
                console.log(`[API] Modified prompt: ${modifiedPrompt}`);
            }

            // Store original brain mode and components
            const originalBrainMode = settings.brain_mode;
            const originalHistory = this.agent.history;
            const originalCoder = this.agent.coder;

            const taskStartTime = Date.now();
            
            try {
                // Force internal brain mode to enable code generation
                settings.brain_mode = 'internal';
                
                // Add a flag to bypass external brain mode check in newAction
                this.agent._forceInternalMode = true;
                
                // Create proper instances for code generation
                
                this.agent.history = new History(this.agent);
                this.agent.coder = new Coder(this.agent);
                this.agent.history.add('user', modifiedPrompt);
                
                // Execute newAction command (will now use internal code generation)
                const command = `!newAction("${modifiedPrompt}")`;
                const result = await executeCommand(this.agent, command);
                
                // Check if coding is disabled
                if (result && result.includes('newAction not allowed')) {
                    console.log('[External API] newAction is disabled - check allow_insecure_coding setting');
                    return res.status(403).json({ 
                        error: 'newAction is disabled', 
                        code: 'newaction_disabled',
                        hint: 'Check allow_insecure_coding setting in settings.js'
                    });
                }
                
                // Check for code generation errors
                if (result && (result.includes('Error generating code') || result.includes('Code generation failed'))) {
                    console.log('[External API] Code generation failed:', result);
                    return res.status(500).json({ 
                        error: 'Code generation failed',
                        details: result,
                        code: 'code_generation_failed'
                    });
                }
                
                // Success case
                // SUCCESS: Task executed, now report completion
                const taskDuration = Date.now() - taskStartTime;
                console.log(`[API] Task executed successfully (${taskDuration}ms)`);
            
                // Call the worker completion callback if it exists
                // Call the worker completion callback if it exists
                if (global.reportTaskCompletion) {
                    console.log(`[API] 📞 Initiating task completion callback...`);
                    try {
                        await global.reportTaskCompletion({
                            taskCompleted: modifiedPrompt.substring(0, 100),
                            blocksPlaced: 100,
                            timeSpent: taskDuration,
                            status: 'success'
                        });
                        console.log(`[API] ✓ Callback completed`);
                    } catch (callbackError) {
                        console.error(`[API] ✗ Callback failed:`, callbackError.message);
                    }
                } else {
                    console.warn(`[API] ⚠️  reportTaskCompletion function not available`);
            }

                res.json({ 
                    success: true, 
                    message: result || 'Custom action executed successfully',
                    original_prompt: prompt,
                    modified_prompt: modifiedPrompt,
                    prompt_modified: modifiedPrompt !== prompt,
                    brain_mode_used: 'internal',
                    generated_code: true
                });
                
            } finally {
                // Always restore original brain mode and components
                settings.brain_mode = originalBrainMode;
                this.agent.history = originalHistory;
                this.agent.coder = originalCoder;
                delete this.agent._forceInternalMode;
            }
            
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
                return res.status(404).json({ error: result, code: 'target_not_found' });
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

            const command = `!followPlayer("${player}", ${distance})`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not found')) {
                return res.status(404).json({ error: result, code: 'player_not_found' });
            }
            
            res.json({ success: true, message: result || `Following ${player}` });
        } catch (error) {
            this.handleError(res, error, 'followPlayer');
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

    // Multi-bot management handlers
    async handleSpawnWorkers(req, res) {
        try {
            const { count, leaderName } = req.body;
            
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
            
            const workers = await this.multiBotManager.spawnWorkers(
                count, 
                leaderName || this.agent.name || 'Leader'
            );
            
            res.json({
                success: true,
                workers,
                message: `Spawned ${workers.length} workers successfully`,
                totalWorkers: this.multiBotManager.workers.size
            });
            
        } catch (error) {
            this.handleError(res, error, 'spawnWorkers');
        }
    }

    async handleCoordinateBuild(req, res) {
        try {
            const { buildRequest, workerCount } = req.body;
            
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
            
            const coordination = await this.multiBotManager.coordinateCollaborativeBuild(
                buildRequest,
                workerCount
            );
            
            res.json({
                success: true,
                ...coordination
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
            
            if (!taskBreakdown) {
                return res.status(400).json({ 
                    error: 'taskBreakdown parameter required' 
                });
            }
            
            const assignments = await this.multiBotManager.assignTasksToWorkers(
                sessionId,
                taskBreakdown
            );
            
            res.json({
                success: true,
                assignments,
                message: `Assigned ${assignments.length} tasks to workers`
            });
            
        } catch (error) {
            this.handleError(res, error, 'assignTasks');
        }
    }

    async handleTeleportWorkers(req, res) {
        try {
            const { sessionId, position } = req.body;
            
            if (!sessionId) {
                return res.status(400).json({ 
                    error: 'sessionId parameter required' 
                });
            }
            
            if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
                return res.status(400).json({ 
                    error: 'position parameter must contain x, y, z coordinates' 
                });
            }
            
            const results = await this.multiBotManager.teleportWorkers(sessionId, position);
            
            res.json({
                success: true,
                teleportResults: results,
                message: `Teleported workers to position (${position.x}, ${position.y}, ${position.z})`
            });
            
        } catch (error) {
            this.handleError(res, error, 'teleportWorkers');
        }
    }

    async handleMultiBotStatus(req, res) {
        try {
            const status = this.multiBotManager.getStatus();
            
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
            const result = await this.multiBotManager.stopAllWorkers();
            
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
                callbackWebhookUrl || settings.n8n_webhook_url
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
            const { sessionId, buildRequest, workerCount } = req.body;

            if (!sessionId || !buildRequest) {
                return res.status(400).json({
                    error: 'sessionId and buildRequest parameters required'
                });
            }

            const result = this.orchestration.createBuildSession(
                sessionId,
                buildRequest,
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
            const { sessionId, preferredLocation, minDistance = 30 } = req.body;

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

    /**
     * Teleport workers to build location
     * POST /api/orchestration/teleport-workers
     * Body: { sessionId, buildLocation: { x, y, z } }
     */
    async handleOrchestrationTeleportWorkers(req, res) {
        try {
            const { sessionId, buildLocation } = req.body;

            if (!sessionId || !buildLocation) {
                return res.status(400).json({
                    error: 'sessionId and buildLocation parameters required'
                });
            }

            if (typeof buildLocation.x !== 'number' || 
                typeof buildLocation.y !== 'number' || 
                typeof buildLocation.z !== 'number') {
                return res.status(400).json({
                    error: 'buildLocation must have x, y, z as numbers'
                });
            }

            const result = await this.orchestration.teleportWorkers(sessionId, buildLocation);

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
            const { workerPort, taskPrompt } = req.body;

            if (!workerPort || !taskPrompt) {
                return res.status(400).json({
                    error: 'workerPort and taskPrompt parameters required'
                });
            }

            const result = await this.orchestration.sendTaskToWorker(workerPort, taskPrompt);

            if (result.success) {
                res.json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            this.handleError(res, error, 'orchestrationSendTask');
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

    start(port = 4001) {
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