// src/agent/external_api.js
// REST API server for n8n integration when BRAIN_MODE=external

import express from 'express';
import { getCommand, executeCommand } from './commands/index.js';
import settings from '../../settings.js';

export class ExternalAPI {
    constructor(agent) {
        this.agent = agent;
        this.app = express();
        this.app.use(express.json());
        
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
        
        // Building plan execution
        this.app.post('/api/agent/executeBuildingPlan', this.handleExecuteBuildingPlan.bind(this));
        
        // Intelligent code execution
        this.app.post('/api/agent/executeGeneratedCode', this.handleExecuteGeneratedCode.bind(this));
        
        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'ok' });
        });
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

            const command = `!newAction("${prompt}")`;
            const result = await executeCommand(this.agent, command);
            
            if (result && result.includes('not allowed')) {
                return res.status(403).json({ error: result, code: 'newaction_disabled' });
            }

            // Check if this is an external brain task that needs smart handling
            if (result && result.includes('EXTERNAL_BRAIN_TASK:')) {
                return res.json({ 
                    success: true, 
                    message: result,
                    external_brain_task: true,
                    task_prompt: prompt
                });
            }
            
            res.json({ success: true, message: result || 'Executing custom action' });
        } catch (error) {
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

    async handleExecuteBuildingPlan(req, res) {
        try {
            const { userMessage } = req.body;
            
            if (!userMessage) {
                return res.status(400).json({ 
                    error: 'No user message provided' 
                });
            }
            
            console.log(`\n=== BUILDING REQUEST RECEIVED ===`);
            console.log(`Request: ${userMessage}`);
            console.log(`Bot connected: ${this.agent.bot.player ? 'Yes' : 'No'}`);
            console.log(`Bot position: ${this.agent.bot.player ? this.agent.bot.player.position : 'Unknown'}`);
            console.log(`Agent actions executing: ${this.agent.actions ? this.agent.actions.executing : 'Unknown'}`);
            
            // Temporarily override external brain mode to allow smart AI processing
            const originalBrainMode = this.agent.settings?.brain_mode;
            
            try {
                // Switch to internal brain mode temporarily to enable smart AI code generation
                if (this.agent.settings) {
                    console.log('Temporarily switching to internal brain mode for smart AI processing');
                    this.agent.settings.brain_mode = 'internal';
                }
                
                // Add the building request to agent history for AI context
                this.agent.history.add('user', userMessage);
                
                // Use newAction - this allows the AI to be smart about the request
                // The AI can analyze if it's possible, suggest alternatives, choose appropriate skills, etc.
                console.log('Executing smart newAction command...');
                
                const command = `!newAction("${userMessage.replace(/"/g, '\\"')}")`;
                const result = await executeCommand(this.agent, command);
                
                // Restore original brain mode
                if (this.agent.settings) {
                    console.log('Restoring original brain mode:', originalBrainMode);
                    this.agent.settings.brain_mode = originalBrainMode;
                }
                
                console.log('Smart AI result:', result);
                
                console.log('=== SMART AI EXECUTION COMPLETED ===');
                console.log(`Result: ${result}`);
                
                // Check if the AI execution was successful
                const success = result && 
                    !result.includes('Error generating code') && 
                    !result.includes('newAction not allowed') &&
                    !result.includes('Code generation failed') &&
                    result !== 'newAction not allowed! Code writing is disabled in settings. Notify the user.';
                
                // Check if bot is still connected and get current status
                const botStatus = {
                    connected: this.agent.bot.player ? true : false,
                    position: this.agent.bot.player ? this.agent.bot.player.position : null,
                    health: this.agent.bot.player ? this.agent.bot.player.health : null,
                    gamemode: this.agent.bot.player ? this.agent.bot.player.gameMode : null
                };
                
                res.json({
                    success: success,
                    userMessage: userMessage,
                    executionResult: result,
                    botStatus: botStatus,
                    message: success ? 
                        `Smart AI successfully analyzed and executed building request` : 
                        `AI processed request but encountered issues: ${result}`
                });
                
            } catch (executionError) {
                // Always restore original brain mode, even on error
                if (this.agent.settings) {
                    console.log('Restoring brain mode after error:', originalBrainMode);
                    this.agent.settings.brain_mode = originalBrainMode;
                }
                console.error('Error executing building request:', executionError);
                console.error('Stack trace:', executionError.stack);
                res.status(500).json({ 
                    error: 'Failed to execute building request',
                    details: executionError.message,
                    stack: executionError.stack
                });
            }
            
        } catch (error) {
            console.error('Error in building request processing:', error);
            console.error('Stack trace:', error.stack);
            res.status(500).json({ 
                error: 'Failed to process building request',
                details: error.message,
                stack: error.stack
            });
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

    async handleExecuteStructuredPlan(req, res) {
        try {
            const { userMessage } = req.body;
            
            if (!userMessage) {
                return res.status(400).json({ 
                    error: 'No user message provided' 
                });
            }
            
            console.log(`\nExecuting building request via newAction: ${userMessage}`);
            
            // Use the original newAction approach, but bypass external brain mode limitation
            // by temporarily switching to internal mode for code generation
            const originalBrainMode = this.agent.settings?.brain_mode;
            
            try {
                // Temporarily enable internal brain mode to allow code generation
                if (this.agent.settings) {
                    this.agent.settings.brain_mode = 'internal';
                }
                
                // Add the building request to the agent's history for context
                this.agent.history.add('user', userMessage);
                
                // Use the newAction command which will now generate and execute code
                const command = `!newAction("${userMessage.replace(/"/g, '\\"')}")`;
                const result = await executeCommand(this.agent, command);
                
                console.log('NewAction execution result:', result);
                
                // Restore original brain mode
                if (this.agent.settings) {
                    this.agent.settings.brain_mode = originalBrainMode;
                }
                
                // Parse the result to determine success
                const success = result && !result.includes('error') && !result.includes('failed') && !result.includes('Error generating code');
                
                res.json({
                    success: success,
                    userMessage: userMessage,
                    executionResult: result,
                    message: success ? 'Building request executed successfully' : 'Building request encountered issues',
                    brainMode: 'internal_override'
                });
                
            } catch (executionError) {
                // Restore original brain mode even if there was an error
                if (this.agent.settings) {
                    this.agent.settings.brain_mode = originalBrainMode;
                }
                
                console.error('Error executing newAction:', executionError);
                res.status(500).json({ 
                    error: 'Failed to execute building request',
                    details: executionError.message
                });
            }
            
        } catch (error) {
            console.error('Error in building request processing:', error);
            res.status(500).json({ 
                error: 'Failed to process building request',
                details: error.message 
            });
        }
    }

    async handleExecuteGeneratedCode(req, res) {
        try {
            const { 
                userMessage, 
                codeInstructions, 
                analysis, 
                chatId, 
                playerName, 
                source,
                // Legacy support 
                code
            } = req.body;
            
            console.log('=== INTELLIGENT CODE EXECUTION REQUEST ===');
            console.log('User Message:', userMessage);
            console.log('Code Instructions:', typeof codeInstructions === 'string' ? 
                codeInstructions.substring(0, 200) + '...' : 
                JSON.stringify(codeInstructions));
            console.log('Analysis:', analysis);
            console.log('Chat ID:', chatId);
            
            console.log('Full request body:', JSON.stringify(req.body, null, 2));
            
            // Be flexible with userMessage - try to infer from available data
            let finalUserMessage = userMessage;
            if (!finalUserMessage && analysis && analysis.analysis) {
                // Try to extract user intent from the analysis
                finalUserMessage = analysis.analysis;
                console.log('No userMessage provided, using analysis as fallback:', finalUserMessage.substring(0, 100));
            } else if (!finalUserMessage && codeInstructions) {
                // Last resort: use the code instructions to infer the request
                const instructions = Array.isArray(codeInstructions) ? codeInstructions.join(' ') : codeInstructions;
                finalUserMessage = `Execute task: ${instructions.substring(0, 200)}`;
                console.log('No userMessage provided, using codeInstructions as fallback:', finalUserMessage.substring(0, 100));
            }
            
            if (!finalUserMessage) {
                return res.status(400).json({ 
                    error: 'Unable to determine user request - no userMessage, analysis, or codeInstructions provided',
                    receivedBody: req.body,
                    receivedKeys: Object.keys(req.body || {})
                });
            }

            // Use the same intelligent code generation system as internal mode
            // This includes skill selection, prompt building, and code generation
            const result = await this.executeIntelligentCode(finalUserMessage, codeInstructions, analysis);
            
            res.json({ 
                success: true, 
                message: result.message || 'Task completed successfully',
                executionResult: result.output,
                userMessage: finalUserMessage,
                chatId: chatId,
                playerName: playerName,
                source: source
            });
        } catch (error) {
            console.error('Error in intelligent code execution:', error);
            console.error('Error stack:', error.stack);
            res.status(500).json({ 
                success: false,
                error: 'Code execution failed',
                details: error.message,
                userMessage: finalUserMessage || userMessage || req.body.userMessage || 'Unknown request',
                requestBody: req.body
            });
        }
    }

    async executeIntelligentCode(userMessage, codeInstructions, analysis) {
        console.log('=== STARTING INTELLIGENT CODE EXECUTION ===');
        console.log('User Message:', userMessage);
        console.log('Code Instructions:', codeInstructions);
        
        // Temporarily switch to internal mode to enable code execution
        const originalBrainMode = this.agent.settings?.brain_mode;
        const originalCodeExecution = this.agent.settings?.allow_code_execution;
        
        try {
            // Force internal mode temporarily
            if (this.agent.settings) {
                console.log('Switching to internal mode for code execution...');
                this.agent.settings.brain_mode = 'internal';
                this.agent.settings.allow_code_execution = true;
            }
            
            // Add user message to history for context
            if (this.agent.history) {
                this.agent.history.add('user', userMessage);
            }
            
            // Use newAction with forced internal mode
            console.log('Executing newAction command...');
            const command = `!newAction("${userMessage.replace(/"/g, '\\"')}")`;
            const { executeCommand } = await import('./commands/index.js');
            const result = await executeCommand(this.agent, command);
            
            console.log('Code execution result:', result);
            
            // Check if execution was successful
            const success = result && 
                !result.includes('Error') && 
                !result.includes('failed') && 
                !result.includes('not allowed') &&
                result !== 'EXTERNAL_BRAIN_TASK:';
            
            if (success) {
                return {
                    message: `Task executed successfully: ${userMessage}`,
                    output: result || 'Code executed successfully'
                };
            } else {
                // If newAction didn't work, try direct code execution if we have codeInstructions
                if (codeInstructions && typeof codeInstructions === 'string') {
                    console.log('Trying direct code execution...');
                    const directResult = await this.executeGeneratedCode(codeInstructions, userMessage);
                    return {
                        message: `Task executed via direct code: ${userMessage}`,
                        output: directResult.output || 'Code executed directly'
                    };
                } else {
                    return {
                        message: `Task processed: ${userMessage}`,
                        output: result || 'Task completed with limitations'
                    };
                }
            }
            
        } catch (error) {
            console.error('Error in code execution:', error);
            console.error('Error stack:', error.stack);
            
            return {
                message: `Task failed: ${userMessage}`,
                output: `Error: ${error.message}`,
                error: true
            };
            
        } finally {
            // Always restore original settings
            if (this.agent.settings) {
                console.log('Restoring original settings...');
                this.agent.settings.brain_mode = originalBrainMode;
                this.agent.settings.allow_code_execution = originalCodeExecution;
            }
        }
    }

    async executeGeneratedCode(code, userMessage) {
        // Import required modules dynamically
        const { makeCompartment, lockdown } = await import('./library/lockdown.js');
        const skills = await import('./library/skills.js');
        const world = await import('./library/world.js');
        const { Vec3 } = await import('vec3');
        
        lockdown();
        
        // Clean and prepare the code (same as internal coder.js)
        let cleanCode = code.trim();
        
        // Remove code block markers if present
        if (cleanCode.startsWith('```javascript') || cleanCode.startsWith('```js')) {
            cleanCode = cleanCode.split('\n').slice(1, -1).join('\n');
        } else if (cleanCode.startsWith('```')) {
            cleanCode = cleanCode.split('\n').slice(1, -1).join('\n');
        }
        
        // Replace console.log with skills.log
        cleanCode = cleanCode.replaceAll('console.log(', 'log(bot,');
        cleanCode = cleanCode.replaceAll('log("', 'log(bot,"');
        
        // Add interrupt checks (same as internal system)
        cleanCode = cleanCode.replaceAll(';\n', '; if(bot.interrupt_code) {log(bot, "Code interrupted.");return;}\n');
        
        console.log('Clean code to execute:', cleanCode);
        
        // Wrap in execution template (same as execTemplate.js)
        const wrappedCode = `
        (async (bot) => {
            try {
                ${cleanCode}
                log(bot, 'Code execution completed.');
            } catch (error) {
                log(bot, 'Code execution error: ' + error.toString());
                throw error;
            }
        })`;
        
        // Create secure compartment (same as internal mode)
        const compartment = makeCompartment({
            skills: skills,
            log: skills.log,
            world: world,
            Vec3: Vec3,
        });
        
        const mainFn = compartment.evaluate(wrappedCode);
        
        // Execute with action management
        let result = "";
        const actionFn = async () => {
            await mainFn(this.agent.bot);
            result = this.agent.actions.getBotOutputSummary() || 'Code executed successfully';
        };
        
        await this.agent.actions.runAction('action:executeCode', actionFn, {
            timeout: this.agent.settings?.code_timeout_mins || -1
        });
        
        return {
            message: `Executed: ${userMessage}`,
            output: result
        };
    }

    start(port = 3001) {
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