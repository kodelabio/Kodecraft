import * as skills from '../library/skills.js';
import settings from '../settings.js';
import convoManager from '../conversation.js';


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
        if (code_return.interrupted && !code_return.timedout)
            return;
        return code_return.message;
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
            // just ignore prompt - it is now in context in chat history
            if (!settings.allow_insecure_coding) { 
                agent.openChat('newAction is disabled. Enable with allow_insecure_coding=true in settings.js');
                return "newAction not allowed! Code writing is disabled in settings. Notify the user.";
            }
            let result = "";
            const actionFn = async () => {
                try {
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
        name: '!repairAction',
        description: 'Perform building actions with automatic repair for broken blocks.',
        params: {
            'buildPlan': { type: 'string', description: 'Detailed building plan with coordinates and materials' }
        },
        perform: async function(agent, buildPlan) {
            if (!settings.allow_insecure_coding) { 
                return "Coding is disabled in settings.";
            }
            
            let result = "";
            const actionFn = async () => {
                try {
                    // Add simplified building instructions for better execution
                    const enhancedPrompt = `SIMPLE BUILDING TASK: ${buildPlan}

CRITICAL REQUIREMENTS:
1. Generate ONLY simple for loops - NO functions, NO objects, NO complex code
2. Use await skills.placeBlock(bot, 'material', x, y, z) ONLY
3. NO try-catch blocks, NO variables except loop counters
4. NO functions, NO async functions, NO complex logic
5. Generate code that can execute immediately

EXAMPLE PATTERN - Copy this style exactly:
for (let x = 36; x <= 46; x++) {
    for (let z = -171; z <= -161; z++) {
        await skills.placeBlock(bot, 'stone', x, -60, z);
    }
}

for (let x = 36; x <= 46; x++) {
    for (let y = -59; y <= -57; y++) {
        if (x === 41 && y !== -57) continue;
        await skills.placeBlock(bot, 'oak_planks', x, y, -171);
    }
}

await skills.placeBlock(bot, 'oak_door', 41, -59, -171);
await skills.placeBlock(bot, 'glass', 38, -58, -171);

RESPOND WITH CODE ONLY - no explanations, no functions, no extra text.`;
                    
                    // Set the enhanced prompt in context
                    agent.history.add('system', enhancedPrompt);
                    
                    result = await agent.coder.generateCode(agent.history);
                    console.log("[Kodelab] Generated repair-aware building code:", result);
                } catch (e) {
                    result = 'Error generating repair code: ' + e.toString();
                }
            };
            await agent.actions.runAction('action:repairAction', actionFn, {timeout: settings.code_timeout_mins * 2});
            return result;
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
            'search_range': { type: 'float', description: 'The range to search for the block.', domain: [32, 512] }
        },
        perform: runAsAction(async (agent, block_type, range) => {
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
            await skills.collectBlock(agent.bot, type, num);
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
                setTimeout(() => {
                    agent.cleanKill('Safely restarting to update inventory.');
                }, 500);
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
        params: {'type': { type: 'BlockName', description: 'The block type to place.' }},
        perform: runAsAction(async (agent, type) => {
            let pos = agent.bot.entity.position;
            await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
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
        name: '!activate',
        description: 'Activate the nearest object of a given type.',
        params: {'type': { type: 'BlockName', description: 'The type of object to activate.' }},
        perform: runAsAction(async (agent, type) => {
            await skills.activateNearestBlock(agent.bot, type);
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
            agent.self_prompter.stop();
            return 'Self-prompting stopped.';
        }
    },
    {
        name: '!startConversation',
        description: 'Start a conversation with a player. Use for bots only.',
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
        description: 'End the conversation with the given player.',
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
        name: '!collaborativeBuild',
        description: 'Coordinate multiple worker bots to build structures collaboratively. Use this when users request building with multiple workers.',
        params: {
            'structure_type': { type: 'string', description: 'Type of structure to build: house, tower, wall, bridge, castle, etc.' },
            'worker_count': { type: 'int', description: 'Number of worker bots to spawn and coordinate', domain: [1, 10] },
            'description': { type: 'string', description: 'Natural language description of the collaborative building task' },
            'dimensions': { type: 'string', optional: true, description: 'Dimensions like "5 blocks length, 2 blocks height"' },
            'material': { type: 'string', optional: true, description: 'Building material like cobblestone, oak_planks, etc.' }
        },
        perform: async function(agent, structure_type, worker_count, description, dimensions = 'default dimensions', material = 'default materials') {
            try {
                // prevent workers from using collaborative build
                if (agent.name && agent.name.startsWith('Worker')) {
                    agent.openChat(`I'm a worker bot - I can only build, not coordinate other workers. I'll use !newAction instead.`);
                    return 'Workers cannot use !collaborativeBuild - only coordinators can. Workers must use !newAction.';
                }
                
                // Handle default values and parse dimensions
                if (dimensions === 'default dimensions' || dimensions === 'default') {
                    dimensions = structure_type === 'house' ? '10 blocks length, 10 blocks width, 3 blocks height' :
                                structure_type === 'wall' ? '20 blocks length, 3 blocks height' :
                                structure_type === 'tower' ? '5 blocks length, 5 blocks width, 10 blocks height' :
                                '10 blocks length, 3 blocks height';
                }
                
                if (material === 'default materials' || material === 'default') {
                    material = structure_type === 'house' ? 'oak_planks' :
                              structure_type === 'wall' ? 'cobblestone' :
                              'oak_planks';
                }
                
                // Parse dimensions and ask for missing information
                let parsedDimensions = null;
                if (dimensions) {
                    // Parse dimensions like "5 blocks length, 2 blocks height"
                    const lengthMatch = dimensions.match(/(\d+)\s*blocks?\s*length/i);
                    const widthMatch = dimensions.match(/(\d+)\s*blocks?\s*width/i);
                    const heightMatch = dimensions.match(/(\d+)\s*blocks?\s*height/i);
                    
                    parsedDimensions = {
                        length: lengthMatch ? parseInt(lengthMatch[1]) : null,
                        width: widthMatch ? parseInt(widthMatch[1]) : null, 
                        height: heightMatch ? parseInt(heightMatch[1]) : null
                    };
                }
                
                // Ask for missing dimensions for wall structures
                if (structure_type === 'wall') {
                    if (!parsedDimensions || !parsedDimensions.length || !parsedDimensions.height) {
                        agent.openChat(`I need more details for the wall. Please specify: What length and height should the wall be? For example: "5 blocks length, 2 blocks height"`);
                        return 'Missing wall dimensions - please specify length and height';
                    }
                }
                
                // Ask for material if not specified
                if (!material && structure_type === 'wall') {
                    agent.openChat(`What material should I use for the wall? (e.g., cobblestone, stone, oak_planks, etc.)`);
                    return 'Missing material - please specify what to build with';
                }
                
                // Check if collaborative manager is available
                const isAvailable = await agent.getCollaborativeManager();
                if (!isAvailable) {
                    return 'Collaborative building not available - not connected to coordination system';
                }
                
                // Check for existing workers and prioritize using them
                const status = await agent.sendCollaborativeCommand('getStatus', { leaderName: agent.name });
                const existingWorkers = status ? status.workers || [] : [];
                
                console.log(`${agent.name} checking existing workers:`, existingWorkers.map(w => `${w.name}(${w.status})`));
                
                let workersToUse = [];
                let workersToSpawn = 0;
                
                // ALWAYS try to use existing workers first
                if (existingWorkers.length > 0) {
                    const availableWorkers = existingWorkers.filter(w => 
                        w.status === 'ready' || w.status === 'idle' || w.status === 'completed' || w.status === 'spawned'
                    );
                    const workersNeeded = Math.min(worker_count, availableWorkers.length);
                    
                    if (workersNeeded > 0) {
                        workersToUse = availableWorkers.slice(0, workersNeeded).map(w => ({ name: w.name }));
                        agent.openChat(`Using ${workersNeeded} existing workers: ${workersToUse.map(w => w.name).join(', ')}`);
                        console.log(`♻️  ${agent.name} reusing ${workersNeeded} workers, need to spawn ${worker_count - workersNeeded} more`);
                        
                        // Only spawn additional workers if we need more than what's available
                        if (worker_count > workersNeeded) {
                            workersToSpawn = worker_count - workersNeeded;
                        }
                    } else {
                        workersToSpawn = worker_count;
                        console.log(`${agent.name} has no available workers, spawning ${workersToSpawn} new ones`);
                    }
                } else {
                    workersToSpawn = worker_count;
                }
                
                agent.openChat(`I'll coordinate ${worker_count} workers to build a ${structure_type}. ${workersToSpawn > 0 ? `Spawning ${workersToSpawn} new workers.` : 'Using existing workers.'}`);
                
                // Spawn only the needed workers (if any)
                let spawnedWorkers = [];
                if (workersToSpawn > 0) {
                    const currentPos = agent.bot.entity.position;
                    const spawnResult = await agent.sendCollaborativeCommand('spawn', { 
                        count: workersToSpawn, 
                        baseSettings: settings,
                        spawnLocation: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
                        leaderName: agent.name // Pass the leader bot's name
                    });
                    
                    if (spawnResult.spawnedBots && spawnResult.spawnedBots.length > 0) {
                        spawnedWorkers = spawnResult.spawnedBots;
                    } else if (workersToUse.length === 0) {
                        return 'Failed to spawn worker bots and no existing workers available';
                    }
                }
                
                // Combine existing and newly spawned workers
                const allWorkers = [...workersToUse, ...spawnedWorkers];
                if (allWorkers.length === 0) {
                    return 'No workers available for collaborative building';
                }
                
                const workerNames = allWorkers.map(w => w.name).join(', ');
                agent.openChat(`Using ${allWorkers.length} workers: ${workerNames} ${spawnedWorkers.length > 0 ? `(${spawnedWorkers.length} newly spawned)` : '(existing)'}`);
                
                // Create structure-specific building plan with dimensions and material
                const currentPos = agent.bot.entity.position;
                const buildPlan = await agent._createBuildingPlan(structure_type, currentPos, allWorkers.length, parsedDimensions, material);
                agent.openChat(`Building plan: ${buildPlan.description}`);
                
                // Teleport all workers (existing + newly spawned) to build location
                if (allWorkers.length > 0) {
                    agent.openChat(`Gathering all ${allWorkers.length} workers to build location...`);
                    await agent.sendCollaborativeCommand('teleportWorkers', {
                        workers: allWorkers.map(w => w.name),
                        location: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
                        useRetry: true,
                        leaderName: agent.name
                    });
                }
                
                // Wait longer for workers to be fully ready, then assign tasks  
                setTimeout(async () => {
                    try {
                        agent.openChat('Validating worker readiness and assigning build tasks...');
                        
                        // Check worker status before assigning tasks
                        const collaborativeStatus = await agent.sendCollaborativeCommand('getStatus');
                        agent.openChat(`Workers status: ${collaborativeStatus.readyWorkers} ready, ${collaborativeStatus.totalWorkers} total`);
                        
                        // Assign tasks to workers with delays and validation
                        for (let i = 0; i < buildPlan.tasks.length && i < allWorkers.length; i++) {
                            const worker = allWorkers[i];
                            const task = buildPlan.tasks[i];
                            
                            // Add delay between task assignments to avoid overwhelming workers
                            setTimeout(async () => {
                                try {
                                    const result = await agent.sendCollaborativeCommand('sendMessageToWorker', {
                                        workerName: worker.name,
                                        message: task.instruction,
                                        leaderName: agent.name
                                    });
                                    
                                    if (result !== false){
                                        agent.openChat(`Task assigned to ${worker.name}: ${task.summary}`);
                                    } else {
                                        agent.openChat(`${worker.name} not ready for tasks yet. Will retry...`);
                                        // Retry after additional delay
                                        setTimeout(async () => {
                                            try {
                                                await agent.sendCollaborativeCommand('sendMessageToWorker', {
                                                    workerName: worker.name,
                                                    message: task.instruction,
                                                    leaderName: agent.name
                                                });
                                                agent.openChat(`Retry: Task assigned to ${worker.name}`);
                                            } catch (retryErr) {
                                                agent.openChat(`${worker.name} still not ready after retry`);
                                            }
                                        }, 10000); // 10 second retry delay
                                    }
                                } catch (err) {
                                    console.error(`Error sending task to ${worker.name}:`, err);
                                    agent.openChat(`Failed to assign task to ${worker.name}: ${err.message}`);
                                }
                            }, i * 5000); // Increased to 5 second delay between each worker task
                        }
                    } catch (error) {
                        console.error('Error assigning tasks to workers:', error);
                        agent.openChat(`Error during task assignment: ${error.message}`);
                    }
                }, 40000); // Increased to 40 second delay to ensure full initialization
                
                // Monitor task completion and trigger inspection when all tasks are done
                agent._monitorTaskCompletion(allWorkers.map(w => w.name), buildPlan);
                
                return `Started ${structure_type} construction with ${worker_count} workers. Tasks will be assigned and monitored for completion. Quality inspection will occur once all workers finish.`;
            } catch (error) {
                console.error('Error in collaborative building:', error);
                return `Error coordinating collaborative build: ${error.message}`;
            }
        }
    },
];
