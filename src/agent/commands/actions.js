import * as skills from '../library/skills.js';
import settings from '../settings.js';
import convoManager from '../conversation.js';
import { Vec3 } from 'vec3'


// Helper function for autoBuild to check if a block position is isolated
async function isBlockIsolated(bot, x, y, z) {
    const directions = [
        [0, -1, 0],  // below
        [0, 1, 0],   // above
        [0, 0, -1],  // north
        [0, 0, 1],   // south
        [1, 0, 0],   // east
        [-1, 0, 0]   // west
    ];
    
    for (const [dx, dy, dz] of directions) {
        const adjacent = bot.blockAt(x + dx, y + dy, z + dz);
        //console.log(`[isIsolated] Checking (${x+dx},${y+dy},${z+dz}): ${adjacent?.name || 'null'}`);
        if (adjacent && adjacent.type !== 0) {
            console.log(`[isIsolated] Found solid block, NOT isolated`);
            return false;
        }
    }
    
    //console.log(`[isIsolated] All air, IS isolated`);
    return true;
}


function runAsAction (actionFn, resume = false, timeout = -1) {
    let actionLabel = null;  // Will be set on first use
    
    const wrappedAction = async function (agent, ...args) {
        // Set actionLabel only once, when the action is first created
        if (!actionLabel) {
            const actionObj = actionsList.find(a => a.perform === wrappedAction);
            actionLabel = actionObj.name.substring(1); // Remove the ! prefix
        }

        const actionFnWithAgent = async () => {
            await actionFn(agent, ...args);
        };

        const code_return = await agent.actions.runAction(`action:${actionLabel}`, actionFnWithAgent, { timeout, resume });

        if (!code_return) {
            console.warn(`[runAsAction] ${actionLabel} returned undefined`);
            return '';
        }

        if (code_return.interrupted && !code_return.timedout) {
            console.log(`[runAsAction] ${actionLabel} was interrupted`);
            return code_return.message || '';
        }
        let message = code_return.message || '';
        if (message.includes('returnsOnly')) {
            try {
                const parsed = JSON.parse(message);
                if (parsed.returnsOnly) {
                    return parsed.returnsOnly;
                }
            } catch (e) {
                // Not JSON, continue normally
            }
        }

        return message;
    }

    return wrappedAction;
}

export const actionsList = [
    {
        name: '!newAction',
        description: 'Perform new and unknown custom behaviors that are not available as a command.', 
        params: {
            'prompt': { type: 'string', description: 'A natural language prompt to guide code generation. Make a detailed step-by-step plan.' }
        },
        perform: async function(agent, prompt) {
            // Check if coding is allowed
            if (!settings.allow_insecure_coding) { 
                agent.openChat('newAction is disabled. Enable with allow_insecure_coding=true in settings.js');
                return "newAction not allowed! Code writing is disabled in settings. Notify the user.";
            }

            // In external brain mode, newAction should NOT generate code locally
            // Unless forced by API call (via _forceInternalMode flag)
            if (settings.brain_mode === 'external' && !agent._forceInternalMode) {
                return `EXTERNAL_BRAIN_TASK: ${prompt}`;
            }

            // Extract ABSOLUTE COORDINATES from prompt
            const coordMatch = prompt.match(/ABSOLUTE COORDINATES FOR THIS WORKER:([\s\S]*?)(?=\n\nScope:|$)/);
            if (coordMatch) {
                const coordSection = coordMatch[1];
                const xRange = coordSection.match(/- X range:\s*([-\d]+)\s*to\s*([-\d]+)/);
                const zRange = coordSection.match(/- Z range:\s*([-\d]+)\s*to\s*([-\d]+)/);
                const yRange = coordSection.match(/- Y range:\s*([-\d]+)\s*to\s*([-\d]+)/);
                
                agent.taskCoordinates = {
                    xMin: xRange ? parseInt(xRange[1]) : null,
                    xMax: xRange ? parseInt(xRange[2]) : null,
                    zMin: zRange ? parseInt(zRange[1]) : null,
                    zMax: zRange ? parseInt(zRange[2]) : null,
                    yMin: yRange ? parseInt(yRange[1]) : null,
                    yMax: yRange ? parseInt(yRange[2]) : null
                };
                console.log('[newAction] Extracted task coordinates:', agent.taskCoordinates);
            }

            // Internal mode: standard code generation process
            let result = "";
            const actionFn = async () => {
                try {
                    if (!agent.coder) {
                        throw new Error('Coder component not available');
                    }
                    result = await agent.coder.generateCode(agent.history);
                    console.log("[Kodelab] Example of generated code:", result)
                } catch (e) {
                    result = 'Error generating code: ' + e.toString();
                }
            };
            await agent.actions.runAction('action:newAction', actionFn, {timeout: settings.code_timeout_mins});
            return result;
        }
    },
    {
        name: '!stop',
        description: 'Force stop all actions and commands that are currently executing.',
        perform: async function (agent) {
            await agent.actions.stop();
            agent.clearBotLogs();
            agent.actions.cancelResume();
            agent.bot.emit('idle');
            let msg = 'Agent stopped.';
            if (agent.self_prompter.isActive())
                msg += ' Self-prompting still active.';
            return msg;
        }
    },
    {
        name: '!stfu',
        description: 'Stop all chatting and self prompting, but continue current action.',
        perform: async function (agent) {
            agent.openChat('Shutting up.');
            agent.shutUp();
            return;
        }
    },
    {
        name: '!restart',
        description: 'Restart the agent process.',
        perform: async function (agent) {
            agent.cleanKill();
        }
    },
    {
        name: '!clearChat',
        description: 'Clear the chat history.',
        perform: async function (agent) {
            agent.history.clear();
            return agent.name + "'s chat history was cleared, starting new conversation from scratch.";
        }
    },
    {
        name: '!goToPlayer',
        description: 'Go to the given player.',
        params: {
            'player_name': {type: 'string', description: 'The name of the player to go to.'},
            'closeness': {type: 'float', description: 'How close to get to the player.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, player_name, closeness) => {
            await skills.goToPlayer(agent.bot, player_name, closeness);
        })
    },
    {
        name: '!teleport',
        description: 'Teleport to specific coordinates.',
        params: {
            'x': { type: 'int', description: 'X coordinate' },
            'y': { type: 'int', description: 'Y coordinate' },
            'z': { type: 'int', description: 'Z coordinate' }
        },
        perform: runAsAction(async (agent, x, y, z) => {
            const success = await skills.teleport(agent.bot, x, y, z);
            return success ? `Teleported to ${x}, ${y}, ${z}` : `Failed to teleport to ${x}, ${y}, ${z}`;
        })
    },
    {
        name: '!teleportToPlayer',
        description: 'Teleport to a player by name.',
        params: {
            'player_name': { type: 'string', description: 'The player name to teleport to.' }
        },
        perform: runAsAction(async (agent, player_name) => {
            const success = await skills.teleportToPlayer(agent.bot, player_name);
            return success ? `Teleported to ${player_name}` : `Failed to teleport to ${player_name}`;
        })
    },
    {
        name: '!teleportWorker',
        description: 'Teleport a worker to specific coordinates.',
        params: {
            'worker_name': {type: 'string', description: 'The name of the worker to teleport.'},
            'x': {type: 'string', description: 'X coordinate'},  // Changed to string
            'y': {type: 'string', description: 'Y coordinate'},  // Changed to string
            'z': {type: 'string', description: 'Z coordinate'}   // Changed to string
        },
        perform: runAsAction(async (agent, worker_name, x, y, z) => {
            const success = await skills.teleportWorker(agent.bot, worker_name, parseFloat(x), parseFloat(y), parseFloat(z));
            return success ? `Teleported ${worker_name}` : `Failed to teleport ${worker_name}`;
        })
    },
    {
        name: '!followPlayer',
        description: 'Endlessly follow the given player.',
        params: {
            'player_name': {type: 'string', description: 'name of the player to follow.'},
            'follow_dist': {type: 'float', description: 'The distance to follow from.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, player_name, follow_dist) => {
            await skills.followPlayer(agent.bot, player_name, follow_dist);
        }, true)
    },
    {
        name: '!goToCoordinates',
        description: 'Go to the given x, y, z location.',
        params: {
            'x': {type: 'float', description: 'The x coordinate.', domain: [-Infinity, Infinity]},
            'y': {type: 'float', description: 'The y coordinate.', domain: [-64, 320]},
            'z': {type: 'float', description: 'The z coordinate.', domain: [-Infinity, Infinity]},
            'closeness': {type: 'float', description: 'How close to get to the location.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, x, y, z, closeness) => {
            await skills.goToPosition(agent.bot, x, y, z, closeness);
        })
    },
    {
        name: '!searchForBlock',
        description: 'Find and go to the nearest block of a given type in a given range.',
        params: {
            'type': { type: 'BlockName', description: 'The block type to go to.' },
            'search_range': { type: 'float', description: 'The range to search for the block. Minimum 32.', domain: [10, 512] }
        },
        perform: runAsAction(async (agent, block_type, range) => {
            if (range < 32) {
                log(agent.bot, `Minimum search range is 32.`);
                range = 32;
            }
            await skills.goToNearestBlock(agent.bot, block_type, 4, range);
        })
    },
    {
        name: '!searchForEntity',
        description: 'Find and go to the nearest entity of a given type in a given range.',
        params: {
            'type': { type: 'string', description: 'The type of entity to go to.' },
            'search_range': { type: 'float', description: 'The range to search for the entity.', domain: [32, 512] }
        },
        perform: runAsAction(async (agent, entity_type, range) => {
            await skills.goToNearestEntity(agent.bot, entity_type, 4, range);
        })
    },
    {
        name: '!moveAway',
        description: 'Move away from the current location in any direction by a given distance.',
        params: {'distance': { type: 'float', description: 'The distance to move away.', domain: [0, Infinity] }},
        perform: runAsAction(async (agent, distance) => {
            await skills.moveAway(agent.bot, distance);
        })
    },
    {
        name: '!rememberHere',
        description: 'Save the current location with a given name.',
        params: {'name': { type: 'string', description: 'The name to remember the location as.' }},
        perform: async function (agent, name) {
            const pos = agent.bot.entity.position;
            agent.memory_bank.rememberPlace(name, pos.x, pos.y, pos.z);
            return `Location saved as "${name}".`;
        }
    },
    {
        name: '!goToRememberedPlace',
        description: 'Go to a saved location.',
        params: {'name': { type: 'string', description: 'The name of the location to go to.' }},
        perform: runAsAction(async (agent, name) => {
            const pos = agent.memory_bank.recallPlace(name);
            if (!pos) {
            skills.log(agent.bot, `No location named "${name}" saved.`);
            return;
            }
            await skills.goToPosition(agent.bot, pos[0], pos[1], pos[2], 1);
        })
    },
    {
        name: '!givePlayer',
        description: 'Give the specified item to the given player.',
        params: { 
            'player_name': { type: 'string', description: 'The name of the player to give the item to.' }, 
            'item_name': { type: 'ItemName', description: 'The name of the item to give.' },
            'num': { type: 'int', description: 'The number of items to give.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, player_name, item_name, num) => {
            await skills.giveToPlayer(agent.bot, item_name, player_name, num);
        })
    },
    {
        name: '!consume',
        description: 'Eat/drink the given item.',
        params: {'item_name': { type: 'ItemName', description: 'The name of the item to consume.' }},
        perform: runAsAction(async (agent, item_name) => {
            await skills.consume(agent.bot, item_name);
        })
    },
    {
        name: '!fish',
        description: 'Fish using a fishing rod to catch fish items. Bot must have a fishing rod and be near water.',
        params: {
            'count': { type: 'int', description: 'Number of fish to catch. Defaults to 1.', domain: [1, 50] }
        },
        perform: runAsAction(async (agent, count = 1) => {
            await skills.fish(agent.bot, count);
        })
    },
    {
        name: '!catchFishWithBucket',
        description: 'Catch live fish with a water bucket. Bot must have water buckets.',
        params: {
            'fish_type': { type: 'string', description: 'Type of fish to catch: cod, salmon, tropical_fish, or pufferfish. Defaults to cod.' },
            'count': { type: 'int', description: 'Number of fish to catch. Defaults to 1.', domain: [1, 20] }
        },
        perform: runAsAction(async (agent, fish_type = 'cod', count = 1) => {
            await skills.catchFishWithBucket(agent.bot, fish_type, count);
        })
    },
    {
        name: '!shearSheep',
        description: 'Shear nearby sheep to collect wool. Bot must have shears.',
        params: {
            'count': { type: 'int', description: 'Number of sheep to shear. Defaults to 1.', domain: [1, 20] }
        },
        perform: runAsAction(async (agent, count = 1) => {
            await skills.shearSheep(agent.bot, count);
        })
    },
    {
        name: '!equip',
        description: 'Equip the given item.',
        params: {'item_name': { type: 'ItemName', description: 'The name of the item to equip.' }},
        perform: runAsAction(async (agent, item_name) => {
            await skills.equip(agent.bot, item_name);
        })
    },
    {
        name: '!putInChest',
        description: 'Put the given item in the nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to put in the chest.' },
            'num': { type: 'int', description: 'The number of items to put in the chest.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            await skills.putInChest(agent.bot, item_name, num);
        })
    },
    {
        name: '!takeFromChest',
        description: 'Take the given items from the nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to take.' },
            'num': { type: 'int', description: 'The number of items to take.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            await skills.takeFromChest(agent.bot, item_name, num);
        })
    },
    {
        name: '!viewChest',
        description: 'View the items/counts of the nearest chest.',
        params: { },
        perform: runAsAction(async (agent) => {
            await skills.viewChest(agent.bot);
        })
    },
    {
        name: '!discard',
        description: 'Discard the given item from the inventory.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to discard.' },
            'num': { type: 'int', description: 'The number of items to discard.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            const start_loc = agent.bot.entity.position;
            await skills.moveAway(agent.bot, 5);
            await skills.discard(agent.bot, item_name, num);
            await skills.goToPosition(agent.bot, start_loc.x, start_loc.y, start_loc.z, 0);
        })
    },
    {
        name: '!collectBlocks',
        description: 'Collect the nearest blocks of a given type.',
        params: {
            'type': { type: 'BlockName', description: 'The block type to collect.' },
            'num': { type: 'int', description: 'The number of blocks to collect.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, type, num) => {
            try {
                console.log(`[collectBlocks] Starting collection of ${num} ${type}`);
                const result = await Promise.race([
                    skills.collectBlock(agent.bot, type, num),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('collectBlock timeout after 5 minutes')), 300000)
                    )
                ]);
                console.log(`[collectBlocks] Collection completed`);
                return result;
            } catch (error) {
                console.error(`[collectBlocks] Error:`, error.message);
                throw error;
            }
        }, false, 10) // 10 minute timeout
    },
    {
        name: '!craftRecipe',
        description: 'Craft the given recipe a given number of times.',
        params: {
            'recipe_name': { type: 'ItemName', description: 'The name of the output item to craft.' },
            'num': { type: 'int', description: 'The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, recipe_name, num) => {
            await skills.craftRecipe(agent.bot, recipe_name, num);
        })
    },
    {
        name: '!smeltItem',
        description: 'Smelt the given item the given number of times.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the input item to smelt.' },
            'num': { type: 'int', description: 'The number of times to smelt the item.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            let success = await skills.smeltItem(agent.bot, item_name, num);
            
            if (success) {
                // Don't auto-restart on success in creative mode
                if (agent.bot.game.gameMode !== 'creative') {
                    setTimeout(() => {
                        agent.cleanKill('Safely restarting to update inventory.');
                    }, 500);
                }
            }
        })
    },
    {
        name: '!clearFurnace',
        description: 'Take all items out of the nearest furnace.',
        params: { },
        perform: runAsAction(async (agent) => {
            await skills.clearNearestFurnace(agent.bot);
        })
    },
        {
        name: '!placeHere',
        description: 'Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches.',
        params: {'type': { type: 'BlockOrItemName', description: 'The block type to place.' }},
        perform: runAsAction(async (agent, type) => {
            let pos = agent.bot.entity.position;
            await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
        })
    },
    /**
     * Universal !autoBuild action - works with both block-based and grid-based blueprints
     * Directly places blocks without intermediate command generation
     * Replaces both the old !autoBuild and !autoBuildBlocks actions
     */
    {
        name: '!autoBuild',
        description: 'Automatically build the blueprint structure using nearest-neighbor placement',
        params: {},
        perform: runAsAction(async (agent) => {
            console.log('[autoBuild] Starting nearest-neighbor auto-build...');
            
            try {
                if (!agent.task || !agent.task.blueprint) {
                    return 'No blueprint available for this task';
                }
                // This prevennts unstuck from interruprint autoBuild and start a self-prompt loop
                agent.bot.modes.pause('unstuck');

                const blueprint = agent.task.blueprint;
                const levels = blueprint.data.levels;
                const taskLocation = agent.task.taskLocation;
                const offsetX = taskLocation?.x || 0;
                const offsetZ = taskLocation?.z || 0;
                const dontCheat = agent.task?.dontCheat ?? true;
                console.log(`[autoBuild] Building in ${dontCheat ? 'normal' : 'cheat'} mode.`);
                
                let totalBlocks = 0;
                let blocksPlaced = 0;
                let blocksPlacedNormal = 0;
                let blocksPlacedSetblock = 0;
                let totalBlocksFailed = 0;
                
                // Count total blocks
                for (const level of levels) {
                    if (level.blocks) {
                        totalBlocks += level.blocks.length;
                    }
                }
                
                // Import skills module
                let skillsModule;
                try {
                    skillsModule = await import('../library/skills.js');
                } catch (err) {
                    console.error('[autoBuild] Failed to import skills module:', err);
                    return `Error: Could not load skills module`;
                }
                             
                // Place blocks level by level
                for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
                    const level = levels[levelIdx];
                    const baseX = level.coordinates[0];
                    const baseY = level.coordinates[1];
                    const baseZ = level.coordinates[2];
                    
                    console.log(`[autoBuild] Processing level ${level.level} (${levelIdx + 1}/${levels.length})`);
                    
                    if (!level.blocks || level.blocks.length === 0) {
                        console.log(`[autoBuild] Level ${level.level} has no blocks, skipping`);
                        continue;
                    }
                    
                    // Track placed blocks for this level
                    const placedBlockIndices = new Set();
                    const attemptedBlocks = new Map(); // Track attempts per block
                    let blocksFailed = 0;  // Level-specific
                    
                    // Greedy nearest-neighbor placement loop
                    while (placedBlockIndices.size < level.blocks.length) {
                        const botPos = agent.bot.entity.position;
                        
                        // Find unplaced blocks
                        const unplacedBlocks = level.blocks
                            .map((block, idx) => ({ block, idx }))
                            .filter(({ idx }) => !placedBlockIndices.has(idx));
                        
                        if (unplacedBlocks.length === 0) break;
                        
                        // Sort by distance from current bot position, removed for performance - we will just iterate through all unplaced blocks and place the first one we can place, then re-check distances after each placement
                        /*
                        unplacedBlocks.sort((a, b) => {
                            const ax = baseX + a.block.x + offsetX;
                            const ay = baseY;
                            const az = baseZ + a.block.z + offsetZ;
                            const distA = (ax - botPos.x) ** 2 + (ay - botPos.y) ** 2 + (az - botPos.z) ** 2;
                            
                            const bx = baseX + b.block.x + offsetX;
                            const by = baseY;
                            const bz = baseZ + b.block.z + offsetZ;
                            const distB = (bx - botPos.x) ** 2 + (by - botPos.y) ** 2 + (bz - botPos.z) ** 2;
                            
                            return distA - distB;
                        });
                        */
                        
                        // Try placing blocks in order of distance
                        let placedThisIteration = false;
                        
                        for (const { block, idx } of unplacedBlocks) {
                            // Skip if we've tried this block too many times
                            if ((attemptedBlocks.get(idx) || 0) >= 3) continue; 
                            
                            const x = baseX + block.x + offsetX;
                            const y = baseY;
                            const z = baseZ + block.z + offsetZ;
                            const blockType = block.material;
                            
                            // Check if already placed
                            const existing = agent.bot.blockAt(x, y, z);
                            if (existing && existing.name === blockType) {
                                placedBlockIndices.add(idx);
                                placedThisIteration = true;
                                break;
                            }
                            // Try to place the block
                            try {
                                const success = await skillsModule.placeBlock(
                                    agent.bot,
                                    blockType,
                                    x, y, z,
                                    'bottom',
                                    dontCheat //
                                );
                                
                                if (success) {
                                    blocksPlaced++;
                                    blocksPlacedNormal++;
                                    placedBlockIndices.add(idx);
                                    placedThisIteration = true;
                                    // Progress update
                                    if ((blocksPlaced + blocksFailed) % 50 === 0) {
                                        console.log(`[autoBuild] Progress: ${blocksPlaced}/${totalBlocks} placed, ${blocksFailed} failed`);
                                    }
                                    
                                    await new Promise(r => setTimeout(r, 200));
                                    break; // Re-sort from new position
                                } else {
                                    attemptedBlocks.set(idx, (attemptedBlocks.get(idx) || 0) + 1);
                                    if (attemptedBlocks.get(idx) === 2) {
                                        // Normal placement failed, check if isolated
                                        // This checl might be too strict
                                        //const isIsolated = await isBlockIsolated(agent.bot, x, y, z);
                                        //if (isIsolated) {
                                            // Retry with setblock for isolated blocks
                                            console.log(`[autoBuild] Retrying isolated block with setblock at (${x},${y},${z})`);
                                            const retrySuccess = await skillsModule.placeBlock(
                                                agent.bot,
                                                blockType,
                                                x, y, z,
                                                'bottom',
                                                false  // use setblock
                                            );
                                        
                                            if (retrySuccess) {
                                                blocksPlaced++;
                                                blocksPlacedSetblock++;
                                                placedBlockIndices.add(idx);
                                                placedThisIteration = true;
                                                await new Promise(r => setTimeout(r, 200));
                                                break;
                                            }
                                        //}
                                    }
                                    blocksFailed++;
                                    totalBlocksFailed++;
                                }
                                
                            } catch (err) {
                                console.error(`[autoBuild] Error placing ${blockType} at (${x},${y},${z}): ${err.message}`);
                                blocksFailed++;
                                await new Promise(r => setTimeout(r, 100));
                            }
                        }
                                              
                        // If nothing placed this iteration, all remaining blocks are unreachable
                        if (!placedThisIteration) {
                            console.log(`[autoBuild] No blocks placeable at level ${level.level}, moving on`);
                            break;
                        }
                    }
                    
                    
                    // Level validation with smart retry, only if we made some progress placing blocks
                    // Simplified validation - just ensure level is reasonably complete before moving on
                    const completionThreshold = 0.99;
                    const levelValidation = agent.task.validator.validateLevel(level.level, completionThreshold);
                     // 99% complete - strict because setblock fallback exists

                    if (!levelValidation.valid) {
                        const levelRetries = attemptedBlocks.get(`level_${level.level}`) || 0;
                        
                        if (levelRetries < 1) {
                            console.log(`[autoBuild] Level ${level.level} at ${levelValidation.score.toFixed(1)}% - retrying`);
                            attemptedBlocks.set(`level_${level.level}`, levelRetries + 1);
                            levelIdx--;  // Retry this level
                        } else {
                            console.log(`[autoBuild] Level ${level.level} already retried, moving on at ${levelValidation.score.toFixed(1)}%`);
                        }
                    } else {
                        console.log(`[autoBuild] Level ${level.level} complete (${levelValidation.score.toFixed(1)}%)`);
                    }
                }

                // Final repair stage - fix any broken blocks that have air instead of the correct block
                console.log(`[autoBuild] Starting final validation & repair stage...`);
                const validationResult = agent.task.validator.blueprint.check(agent.bot);
                const missingBlocks = validationResult.mismatches.filter(block => block.actual === "air");
                if (missingBlocks.length > 0) {
                console.log(`[autoBuild] Found ${missingBlocks.length} missing blocks, repairing...`);
                
                for (const block of missingBlocks) {
                    try {
                    const [x, y, z] = block.coordinates;
                    await skillsModule.placeBlock(
                        agent.bot,
                        block.expected,
                        x, y, z,
                        'bottom',
                        false  // use setblock
                    );
                    } catch (error) {
                    console.error(`[autoBuild] Failed to place ${block.expected} at ${block.coordinates}:`, error);
                    }
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                console.log(`[autoBuild] Repair complete. Placed ${missingBlocks.length} blocks`);
                } else {
                console.log(`[autoBuild] Validation passed - no missing blocks`);
                }
                
                console.log(`[autoBuild] Completed! Placed ${blocksPlaced}/${totalBlocks} blocks`);
                console.log(`   Normal: ${blocksPlacedNormal}, Setblock: ${blocksPlacedSetblock}`);
                return `Auto-build complete! Placed ${blocksPlaced}/${totalBlocks} blocks`;
                
            } catch (error) {
                console.error('[autoBuild] Fatal error:', error);
                return `Error: ${error.message}`;
            } finally {
                agent.bot.modes.unpause('unstuck');
            }
        })
        },
        {
        name: '!quickBuild',
        description: 'Ultra-fast setblock-only build for verification',
        params: {},
        perform: runAsAction(async (agent) => {
            try {
                if (!agent.task?.blueprint) {
                    return 'No blueprint available';
                }

                agent.bot.modes.pause('unstuck');
                
                const blueprint = agent.task.blueprint;
                const levels = blueprint.levels;
                const taskLocation = agent.task.taskLocation;
                const offsetX = taskLocation?.x || 0;
                const offsetZ = taskLocation?.z || 0;
                
                let blocksPlaced = 0;
                let blocksFailed = 0;
                
                // Import skills
                const skillsModule = await import('../library/skills.js');
                
                // Place blocks WITHOUT movement logic - just iterate all blocks
                for (const level of levels) {
                    const baseX = level.coordinates[0];
                    const baseY = level.coordinates[1];
                    const baseZ = level.coordinates[2];
                    
                    if (!level.blocks) continue;
                    
                    for (const block of level.blocks) {
                        try {
                            const x = baseX + block.x + offsetX;
                            const y = baseY;
                            const z = baseZ + block.z + offsetZ;
                            
                            // Skip if already correct
                            //const existing = agent.bot.blockAt(x, y, z);
                            //if (existing?.name === block.material) {
                            //    blocksPlaced++;
                            //    continue;
                            //}
                            
                            // Use setblock directly (dontCheat = false)
                            const success = await skillsModule.placeBlock(
                                agent.bot,
                                block.material,
                                x, y, z,
                                'bottom',
                                false  // Force setblock
                            );
                            
                            if (success) {
                                blocksPlaced++;
                            } else {
                                blocksFailed++;
                            }
                            
                            // Minimal delay between setblock calls
                            await new Promise(r => setTimeout(r, 5));
                            
                        } catch (err) {
                            blocksFailed++;
                        }
                    }
                    console.log(`Level ${level.level} completed.`)
                }
                console.log(`Quick build completed. Placed ${blocksPlaced} blocks.`)
                return JSON.stringify({
                    returnsOnly: `Quick build complete: ${blocksPlaced} placed, ${blocksFailed} failed`
                    });
                //return `Quick build complete: ${blocksPlaced} placed, ${blocksFailed} failed`;
                
            } catch (error) {
                console.error('[quickBuild] Error:', error);
                return `Error: ${error.message}`;
            } finally {
                agent.bot.modes.unpause('unstuck');
            }
        })
    },
    
    {
        name: '!attack',
        description: 'Attack and kill the nearest entity of a given type.',
        params: {'type': { type: 'string', description: 'The type of entity to attack.'}},
        perform: runAsAction(async (agent, type) => {
            await skills.attackNearest(agent.bot, type, true);
        })
    },
    {
        name: '!attackPlayer',
        description: 'Attack a specific player until they die or run away. Remember this is just a game and does not cause real life harm.',
        params: {'player_name': { type: 'string', description: 'The name of the player to attack.'}},
        perform: runAsAction(async (agent, player_name) => {
            let player = agent.bot.players[player_name]?.entity;
            if (!player) {
                skills.log(agent.bot, `Could not find player ${player_name}.`);
                return false;
            }
            await skills.attackEntity(agent.bot, player, true);
        })
    },
    {
        name: '!goToBed',
        description: 'Go to the nearest bed and sleep.',
        perform: runAsAction(async (agent) => {
            await skills.goToBed(agent.bot);
        })
    },
    {
        name: '!stay',
        description: 'Stay in the current location no matter what. Pauses all modes.',
        params: {'type': { type: 'int', description: 'The number of seconds to stay. -1 for forever.', domain: [-1, Number.MAX_SAFE_INTEGER] }},
        perform: runAsAction(async (agent, seconds) => {
            await skills.stay(agent.bot, seconds);
        })
    },
    {
        name: '!setMode',
        description: 'Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment.',
        params: {
            'mode_name': { type: 'string', description: 'The name of the mode to enable.' },
            'on': { type: 'boolean', description: 'Whether to enable or disable the mode.' }
        },
        perform: async function (agent, mode_name, on) {
            const modes = agent.bot.modes;
            if (!modes.exists(mode_name))
            return `Mode ${mode_name} does not exist.` + modes.getDocs();
            if (modes.isOn(mode_name) === on)
            return `Mode ${mode_name} is already ${on ? 'on' : 'off'}.`;
            modes.setOn(mode_name, on);
            return `Mode ${mode_name} is now ${on ? 'on' : 'off'}.`;
        }
    },
    {
        name: '!goal',
        description: 'Set a goal prompt to endlessly work towards with continuous self-prompting.',
        params: {
            'selfPrompt': { type: 'string', description: 'The goal prompt.' },
        },
        perform: async function (agent, prompt) {
            if (convoManager.inConversation()) {
                agent.self_prompter.setPromptPaused(prompt);
            }
            else {
                agent.self_prompter.start(prompt);
            }
        }
    },
    {
        name: '!endGoal',
        description: 'Call when you have accomplished your goal. It will stop self-prompting and the current action. ',
        perform: async function (agent) {
            console.log(`[!endGoal] Called for ${agent.name}, worker_type: ${settings.worker_type}`);
            agent.self_prompter.stop();
            console.log(`[!endGoal] Finished for ${agent.name}`);
            return 'Self-prompting stopped.';
        }
    },
    {
        name: '!showVillagerTrades',
        description: 'Show trades of a specified villager.',
        params: {'id': { type: 'int', description: 'The id number of the villager that you want to trade with.' }},
        perform: runAsAction(async (agent, id) => {
            await skills.showVillagerTrades(agent.bot, id);
        })
    },
    {
        name: '!tradeWithVillager',
        description: 'Trade with a specified villager.',
        params: {
            'id': { type: 'int', description: 'The id number of the villager that you want to trade with.' },
            'index': { type: 'int', description: 'The index of the trade you want executed (1-indexed).', domain: [1, Number.MAX_SAFE_INTEGER] },
            'count': { type: 'int', description: 'How many times that trade should be executed.', domain: [1, Number.MAX_SAFE_INTEGER] },
        },
        perform: runAsAction(async (agent, id, index, count) => {
            await skills.tradeWithVillager(agent.bot, id, index, count);
        })
    },
    {
        name: '!startConversation',
        description: 'Start a conversation with a bot. (FOR OTHER BOTS ONLY)',
        params: {
            'player_name': { type: 'string', description: 'The name of the player to send the message to.' },
            'message': { type: 'string', description: 'The message to send.' },
        },
        perform: async function (agent, player_name, message) {
            if (!convoManager.isOtherAgent(player_name))
                return player_name + ' is not a bot, cannot start conversation.';
            if (convoManager.inConversation() && !convoManager.inConversation(player_name)) 
                convoManager.forceEndCurrentConversation();
            else if (convoManager.inConversation(player_name))
                agent.history.add('system', 'You are already in conversation with ' + player_name + '. Don\'t use this command to talk to them.');
            convoManager.startConversation(player_name, message);
        }
    },
    {
        name: '!endConversation',
        description: 'End the conversation with the given bot. (FOR OTHER BOTS ONLY)',
        params: {
            'player_name': { type: 'string', description: 'The name of the player to end the conversation with.' }
        },
        perform: async function (agent, player_name) {
            if (!convoManager.inConversation(player_name))
                return `Not in conversation with ${player_name}.`;
            convoManager.endConversation(player_name);
            return `Converstaion with ${player_name} ended.`;
        }
    },
    {
        name: '!lookAtPlayer',
        description: 'Capture and analyze an image of a specific player or their view direction. Useful when interacting with other players or inspecting their surroundings.',
        params: {
            'player_name': { type: 'string', description: 'Name of the target player' },
            'direction': {
                type: 'string',
                description: 'How to look ("at": look at the player, "with": look in the same direction as the player)',
            }
        },
        perform: async function(agent, player_name, direction) {
            if (direction !== 'at' && direction !== 'with') {
                return "Invalid direction. Use 'at' or 'with'.";
            }
            let result = "";
            const actionFn = async () => {
                result = await agent.vision_interpreter.lookAtPlayer(player_name, direction);
            };
            await agent.actions.runAction('action:lookAtPlayer', actionFn);
            return result;
        }
    },
    {
        name: '!lookAtPosition',
        description: '!lookAtPosition: !!!IMPORTANT COMMAND!!! This command is incredibly powerful, and will give you real visual data on what the bot is looking at. \n!lookAtPosition: Take a screenshot of a specific location and analyze the environment. Use this to scout terrain, check for hazards, or assess structures and blocks.',
        params: {
            'x': { type: 'int', description: 'x coordinate' },
            'y': { type: 'int', description: 'y coordinate' },
            'z': { type: 'int', description: 'z coordinate' }
        },
        perform: async function(agent, x, y, z) {
            let result = "";
            const actionFn = async () => {
                result = await agent.vision_interpreter.lookAtPosition(x, y, z);
            };
            await agent.actions.runAction('action:lookAtPosition', actionFn);
            return result;
        }
    },
    {
        name: '!digDown',
        description: 'Digs down a specified distance. Will stop if it reaches lava, water, or a fall of >=4 blocks below the bot.',
        params: {'distance': { type: 'int', description: 'Distance to dig down', domain: [1, Number.MAX_SAFE_INTEGER] }},
        perform: runAsAction(async (agent, distance) => {
            await skills.digDown(agent.bot, distance)
        })
    },
    {
        name: '!goToSurface',
        description: 'Moves the bot to the highest block above it (usually the surface).',
        params: {},
        perform: runAsAction(async (agent) => {
            await skills.goToSurface(agent.bot);
        })
    },
    {
        name: '!useOn',
        description: 'Use (right click) the given tool on the nearest target of the given type.',
        params: {
            'tool_name': { type: 'string', description: 'Name of the tool to use, or "hand" for no tool.' },
            'target': { type: 'string', description: 'The target as an entity type, block type, or "nothing" for no target.' }
        },
        perform: runAsAction(async (agent, tool_name, target) => {
            await skills.useToolOn(agent.bot, tool_name, target);
        })
    },
];
