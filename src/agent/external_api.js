// REST API server for n8n integration when BRAIN_MODE=external

import express from 'express';
import axios from 'axios';
import { getCommand, executeCommand } from './commands/index.js';
import settings from '../../settings.js';
import { MultiBotManager } from './multibot_manager.js';
import { distributeCode } from './code_distributor.js';
import { makeCompartment } from './library/lockdown.js';
import * as skills from './library/skills.js';
import * as world from './library/world.js';
import { Vec3 } from 'vec3';

export class ExternalAPI {
    constructor(agent) {
        this.agent = agent;
        this.app = express();
        this.app.use(express.json());
        
        // Initialize multi-bot manager
        this.multiBotManager = new MultiBotManager(agent);
        
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
        this.app.post('/api/agent/executeCode', this.handleExecuteCode.bind(this));
        
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

        // Multi-bot management endpoints (Solution A: Centralized Code Generation)
        this.app.post('/api/multibot/collaborativeBuild', this.handleCollaborativeBuild.bind(this));
        this.app.post('/api/multibot/stop', this.handleStopWorkers.bind(this));
        
        // Health check & debugging
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'ok' });
        });
        this.app.get('/api/agent/debug', this.handleDebug.bind(this));
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

            let modifiedPrompt = prompt;
            // if (prompt.toLowerCase().includes('build') || prompt.toLowerCase().includes('place') || prompt.toLowerCase().includes('construct')) {
            //     console.log('[API] Building request detected - using coordinate replacement');
            //     modifiedPrompt = prompt.replace(/at \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
            //     modifiedPrompt = modifiedPrompt.replace(/at coordinates? \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
            //     modifiedPrompt = modifiedPrompt.replace(/at position \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
            //     modifiedPrompt = modifiedPrompt.replace(/at location \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
            //     if (!modifiedPrompt.toLowerCase().includes('current position')) {
            //         modifiedPrompt += ' at my current position';
            //     }
            //     console.log(`[API] Modified prompt: ${modifiedPrompt}`);
            // }

            // console.log(`Executing newAction with prompt length: ${modifiedPrompt.length}`);
            // console.log(`Prompt preview: ${modifiedPrompt.substring(0, 100)}...`);
            // console.log(`Agent has coder: ${!!this.agent.coder}`);
            // console.log(`Agent has history: ${!!this.agent.history}`);
            
            // Add the prompt to history to provide context for code generation
            this.agent.history.add('user', `Please ${modifiedPrompt}`);
            
            // Force internal mode for API calls to bypass external brain restrictions
            const originalForceInternalMode = this.agent._forceInternalMode;
            this.agent._forceInternalMode = true;
            
            console.log(`Calling newAction command directly...`);
            try {
                // Call the newAction command directly instead of using executeCommand
                // to avoid quote escaping issues with very long prompts
                const newActionCommand = getCommand('!newAction');
                if (!newActionCommand) {
                    throw new Error('newAction command not found');
                }
                
                const result = await newActionCommand.perform(this.agent, modifiedPrompt);
                console.log(`executeCommand result: ${result ? result.substring(0, 100) : 'null'}`);
                
                if (result && result.includes('newAction not allowed')) {
                    return res.status(403).json({
                        error: 'newAction is disabled',
                        code: 'newaction_disabled',
                        hint: 'Check allow_insecure_coding setting in settings.js'
                    });
                }

                if (result && (result.includes('Error generating code') || result.includes('Code generation failed'))) {
                    console.error(`Code generation failed: ${result}`);
                    return res.status(500).json({
                        error: 'Code generation failed',
                        details: result,
                        code: 'code_generation_failed'
                    });
                }

                console.log(`newAction completed successfully`);
                res.json({
                    success: true,
                    message: result || 'Custom action executed successfully',
                    original_prompt: prompt,
                    modified_prompt: modifiedPrompt,
                    prompt_modified: modifiedPrompt !== prompt,
                    brain_mode_used: 'internal_forced'
                });
            } finally {
                // Always restore original force internal mode setting
                this.agent._forceInternalMode = originalForceInternalMode;
            }
        } catch (error) {
            console.error(`newAction error:`, error);
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



    async handleCollaborativeBuild(req, res) {
        try {
            const { 
                prompt,           // n8n sends 'prompt' instead of 'buildRequest'
                buildRequest,     // Keep backward compatibility
                workerCount = 3, 
                sessionId = null, // n8n sends sessionId for tracking
                leaderPosition = null, 
                buildCoordinates = null,
                singleWorkerMode = false 
            } = req.body;
            
            // Use prompt or buildRequest (n8n compatibility)
            const actualBuildRequest = prompt || buildRequest;
            
            if (!actualBuildRequest) {
                return res.status(400).json({ error: 'prompt or buildRequest parameter required' });
            }

            console.log(`Collaborative build request: ${actualBuildRequest.substring(0, 50)}... (${workerCount} workers, session: ${sessionId || 'auto'})`);

            // For single worker mode or workerCount=1, use regular newAction
            if (singleWorkerMode || workerCount === 1) {
                console.log(`Single worker mode detected, using newAction instead`);
                return this.handleNewAction({ body: { prompt: actualBuildRequest } }, res);
            }

            // Get leader's actual position if not provided
            let actualLeaderPosition = leaderPosition;
            if (!actualLeaderPosition && this.agent.bot && this.agent.bot.entity) {
                actualLeaderPosition = {
                    x: Math.floor(this.agent.bot.entity.position.x),
                    y: Math.floor(this.agent.bot.entity.position.y),
                    z: Math.floor(this.agent.bot.entity.position.z)
                };
                console.log(`Using leader's current position:`, actualLeaderPosition);
            }

            // Define build area
            const buildArea = buildCoordinates || {
                minX: (actualLeaderPosition?.x || 0),
                maxX: (actualLeaderPosition?.x || 0) + 20,
                minY: (actualLeaderPosition?.y || 64),
                maxY: (actualLeaderPosition?.y || 64) + 10,
                minZ: (actualLeaderPosition?.z || 0),
                maxZ: (actualLeaderPosition?.z || 0) + 20
            };

            console.log(`Build area:`, buildArea);

            // Step 1: Leader generates master code using AI (WITHOUT EXECUTING IT)
            console.log(`Leader generating master code (not executing).`);
            const codeGenStart = Date.now();

            if (!this.agent.coder) {
                throw new Error('Leader bot does not have coder module available');
            }
            if (!this.agent.history) {
                throw new Error('Leader bot does not have history module available');
            }

            // Prepare code generation context - add to agent history
            const codePrompt = `${actualBuildRequest}\n\nBuild in the area: x[${buildArea.minX} to ${buildArea.maxX}], y[${buildArea.minY} to ${buildArea.maxY}], z[${buildArea.minZ} to ${buildArea.maxZ}]`;
            
            // Add prompt to history for context
            this.agent.history.add('user', `Please ${codePrompt}`);
            
            // Generate code using leader's AI WITHOUT executing it
            const masterCode = await this.agent.coder.generateCodeOnly(this.agent.history);
            const codeGenTime = Date.now() - codeGenStart;
            
            if (!masterCode) {
                throw new Error('Failed to generate master code');
            }
            console.log(`Master code generated in ${codeGenTime}ms (${masterCode.length} chars)`);
            console.log(`Master code preview: ${masterCode.substring(0, 150)}...`);

            // Step 2: Extract actual build dimensions from generated code
            const actualBuildArea = this.extractBuildDimensions(masterCode, buildArea);
            console.log(`Actual build dimensions:`, actualBuildArea);

            // Step 3: Distribute code to workers with coordinate filtering
            console.log(`Distributing code to ${workerCount} workers...`);
            const workerPrefix = `${this.agent.name}Worker`;
            
            const distribution = distributeCode(masterCode, workerCount, actualBuildArea, workerPrefix);
            
            console.log(`Code distributed to ${distribution.workers.length} workers using ${distribution.strategy} strategy`);
            
            // Step 4: Spawn workers
            console.log(`Spawning ${workerCount} workers for session ${sessionId || 'auto-generated'}`);
            const spawnResult = await this.multiBotManager.spawnWorkers(workerCount, sessionId);
            
            if (!spawnResult.success) {
                console.error(`Worker spawn failed:`, spawnResult.error);
                return res.status(500).json({ 
                    error: 'Failed to spawn workers',
                    details: spawnResult.error,
                    code: 'worker_spawn_failed'
                });
            }

            console.log(`Successfully spawned ${spawnResult.spawnedCount}/${workerCount} workers`);

            // Create worker name to port mapping
            const workerPortMap = {};
            for (const worker of spawnResult.workers) {
                workerPortMap[worker.name] = worker.port;
            }
            console.log(`Worker port mapping:`, workerPortMap);

            // Wait for workers to initialize
            console.log(`Waiting 5 seconds for worker initialization...`);
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Step 5: Send executable code to workers via /api/agent/executeCode
            console.log(`Sending executable code to ${distribution.workers.length} workers...`);
            const executionPromises = [];
            const executionResults = [];

            // Stagger worker starts to reduce initial pathfinding conflicts
            let workerIndex = 0;
            for (const workerAssignment of distribution.workers) {
                // Add delay between worker starts (0ms, 2s, 4s, etc.)
                const startDelay = workerIndex * 2000;
                workerIndex++;
                const workerPort = workerPortMap[workerAssignment.workerId];
                
                if (!workerPort) {
                    console.error(`No port found for ${workerAssignment.workerId}`);
                    executionResults.push({
                        workerId: workerAssignment.workerId,
                        success: false,
                        bounds: workerAssignment.bounds,
                        error: 'Worker port not found'
                    });
                    continue;
                }
                
                const workerUrl = `http://localhost:${workerPort}/api/agent/executeCode`;
                
                console.log(`Sending code to ${workerAssignment.workerId} (port ${workerPort}) after ${startDelay}ms delay, bounds:`, workerAssignment.bounds);
                
                // Wrap in promise with delay
                const promise = new Promise(resolve => setTimeout(resolve, startDelay))
                .then(() => axios.post(workerUrl, {
                    code: workerAssignment.code,
                    bounds: workerAssignment.bounds,
                    description: `Collaborative build: ${actualBuildRequest.substring(0, 40)}...`
                }))
                .then(response => {
                    console.log(`${workerAssignment.workerId} execution started successfully`);
                    executionResults.push({
                        workerId: workerAssignment.workerId,
                        success: true,
                        bounds: workerAssignment.bounds,
                        response: response.data
                    });
                })
                .catch(error => {
                    console.error(`${workerAssignment.workerId} execution failed:`, error.message);
                    executionResults.push({
                        workerId: workerAssignment.workerId,
                        success: false,
                        bounds: workerAssignment.bounds,
                        error: error.message
                    });
                });
                
                executionPromises.push(promise);
            }

            // Wait for all workers to start executing
            await Promise.all(executionPromises);

            const successCount = executionResults.filter(r => r.success).length;
            const failureCount = executionResults.filter(r => !r.success).length;

            console.log(`Execution dispatch complete: ${successCount} succeeded, ${failureCount} failed`);

            // Success response with detailed metrics
            res.json({ 
                success: true, 
                message: `Collaborative build completed with ${spawnResult.spawnedCount} workers.`,
                approach: 'Centralized Code Generation',
                sessionId: spawnResult.sessionId,
                workersSpawned: spawnResult.spawnedCount,
                workersRequested: workerCount,
                workersExecuting: successCount,
                workersFailed: failureCount,
                buildRequest: actualBuildRequest,
                buildArea: buildArea,
                strategy: distribution.strategy,
                codeGenerationTimeMs: codeGenTime,
                masterCodeLength: masterCode.length,
                executionResults: executionResults,
                workers: spawnResult.workers.map((w, i) => ({
                    ...w,
                    bounds: distribution.workers[i]?.bounds,
                    codeLength: distribution.workers[i]?.code.length
                }))
            });

        } catch (error) {
            console.error(`Collaborative build error:`, error);
            // Cleanup workers on error
            if (this.multiBotManager) {
                await this.multiBotManager.stopWorkers().catch(console.error);
            }
            this.handleError(res, error, 'collaborativeBuild');
        }
    }


     // Extract actual build dimensions from generated code
     // Pares startX, startZ, width, depth, height from the code
     
    extractBuildDimensions(code, fallbackArea) {
        try {
            // Try to extract dimensions from code using regex
            const startXMatch = code.match(/const\s+startX\s*=\s*(-?\d+)/);
            const startYMatch = code.match(/const\s+startY\s*=\s*(-?\d+)/);
            const startZMatch = code.match(/const\s+startZ\s*=\s*(-?\d+)/);
            const widthMatch = code.match(/const\s+width\s*=\s*(\d+)/);
            const depthMatch = code.match(/const\s+depth\s*=\s*(\d+)/);
            const heightMatch = code.match(/const\s+height\s*=\s*(\d+)/);

            if (startXMatch && widthMatch && startZMatch && depthMatch) {
                const startX = parseInt(startXMatch[1]);
                const startZ = parseInt(startZMatch[1]);
                const width = parseInt(widthMatch[1]);
                const depth = parseInt(depthMatch[1]);
                const startY = startYMatch ? parseInt(startYMatch[1]) : fallbackArea.minY;
                const height = heightMatch ? parseInt(heightMatch[1]) : (fallbackArea.maxY - fallbackArea.minY);

                return {
                    minX: startX,
                    maxX: startX + width - 1,
                    minY: startY,
                    maxY: startY + height - 1,
                    minZ: startZ,
                    maxZ: startZ + depth - 1
                };
            }
        } catch (error) {
            console.warn(`Failed to extract build dimensions from code:`, error.message);
        }

        // Fallback to original build area
        console.log(`Using fallback build area`);
        return fallbackArea;
    }

    // Add missing multibot management endpoints


    async handleStopWorkers(req, res) {
        try {
            console.log(`Stopping all workers`);
            const result = await this.multiBotManager.stopWorkers();
            
            if (result.success) {
                res.json(result);
            } else {
                res.status(500).json({ 
                    error: 'Failed to stop workers',
                    details: result.errors,
                    code: 'stop_failed'
                });
            }
        } catch (error) {
            this.handleError(res, error, 'stopWorkers');
        }
    }

    async handleExecuteCode(req, res) {
        try {
            const { code, bounds, metadata } = req.body;
            
            if (!code) {
                return res.status(400).json({ error: 'code parameter required' });
            }

            const workerName = this.agent.name || 'Worker';
            console.log(`[${workerName}] Executing pre-generated code`);
            
            if (metadata?.buildRequest) {
                console.log(`[${workerName}] Build request: ${metadata.buildRequest.substring(0, 50)}...`);
            }
            
            if (bounds) {
                console.log(`[${workerName}] Assigned bounds:`, 
                    `X(${bounds.minX}-${bounds.maxX})`,
                    `Y(${bounds.minY}-${bounds.maxY})`, 
                    `Z(${bounds.minZ}-${bounds.maxZ})`);
            }

            // Log bot status for debugging
            if (this.agent.bot && this.agent.bot.modes) {
                const isCheatMode = this.agent.bot.modes.isOn('cheat');
                console.log(`[${workerName}] Game mode: ${this.agent.bot.game.gameMode}`);
                console.log(`[${workerName}] Cheat mode: ${isCheatMode ? 'ON (instant /setblock)' : 'OFF (physical placement)'}`);
                console.log(`[${workerName}] Starting position: (${Math.floor(this.agent.bot.entity.position.x)}, ${Math.floor(this.agent.bot.entity.position.y)}, ${Math.floor(this.agent.bot.entity.position.z)})`);
            }

            // Create filtered skills object if bounds are provided
            let filteredSkills = skills;
            if (bounds) {
                const originalPlaceBlock = skills.placeBlock;
                filteredSkills = {
                    ...skills,
                    placeBlock: async function(bot, blockType, x, y, z, ...args) {
                        // Check if coordinates are within worker's bounds
                        if (x >= bounds.minX && x <= bounds.maxX &&
                            y >= bounds.minY && y <= bounds.maxY &&
                            z >= bounds.minZ && z <= bounds.maxZ) {
                            // Coordinates are in range - place the block
                            const result = await originalPlaceBlock(bot, blockType, x, y, z, ...args);
                            
                            // Add small delay to reduce pathfinding conflicts between workers
                            // This allows time for navigation to complete before next block
                            await new Promise(resolve => setTimeout(resolve, 300));
                            
                            return result;
                        }
                        // Coordinates are outside range - skip silently
                        return false;
                    }
                };
            }

            // Execute code in sandboxed environment
            const compartment = makeCompartment({
                skills: filteredSkills,
                world,
                Vec3,
                log: (bot, msg) => {
                    // Reduce log spam - only log important messages or periodically
                    const shouldLog = msg.includes('Worker initialized') || 
                                     msg.includes('Worker completed') ||
                                     msg.includes('Error') ||
                                     Math.random() < 0.02; // 2% of other logs
                    if (shouldLog) {
                        console.log(`[${workerName}]`, msg);
                    }
                }
            });

            console.log(`[${workerName}] Starting code execution...`);
            const startTime = Date.now();
            
            const mainFn = compartment.evaluate(code);
            await mainFn(this.agent.bot);

            const duration = Date.now() - startTime;
            console.log(`[${workerName}] Code execution complete in ${(duration / 1000).toFixed(1)}s`);
            
            res.json({ 
                success: true,
                worker: workerName,
                bounds,
                metadata,
                executionTime: duration,
                message: 'Code executed successfully'
            });
            
        } catch (error) {
            const workerName = this.agent.name || 'Worker';
            console.error(`[${workerName}] Code execution failed:`, error.message);
            console.error(`[${workerName}] Stack:`, error.stack);
            
            res.status(500).json({ 
                success: false, 
                error: error.message,
                worker: workerName,
                stack: error.stack
            });
        }
    }

    async handleDebug(req, res) {
        try {
            const botPos = this.agent.bot?.entity?.position;
            
            res.json({
                name: this.agent.name,
                isWorker: this.agent.isWorkerBot || false,
                hasCoder: !!this.agent.coder,
                hasHistory: !!this.agent.history,
                cheatMode: this.agent.bot?.modes?.isOn('cheat') || false,
                currentAction: this.agent.actions?.currentActionLabel || 'idle',
                isExecuting: this.agent.actions?.executing || false,
                position: botPos ? {
                    x: Math.floor(botPos.x),
                    y: Math.floor(botPos.y),
                    z: Math.floor(botPos.z)
                } : null,
                health: this.agent.bot?.health,
                gameMode: this.agent.bot?.game?.gameMode,
                status: 'operational'
            });
        } catch (error) {
            this.handleError(res, error, 'debug');
        }
    }

    async start(port) {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(port, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Server started on port ${port}`);
                    resolve();
                }
            });
        });
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

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}