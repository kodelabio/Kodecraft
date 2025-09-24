import * as skills from '../library/skills.js';
import settings from '../settings.js';
import convoManager from '../conversation.js';
import { hierarchicalActions } from './hierarchical_actions.js';


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
    name: '!shareFoundationLocation',
    description: 'Share the exact coordinates of the completed foundation.',
    params: {},
    perform: async function(agent) {
        const pos = agent.bot.entity.position;
        const message = `Foundation completed at coordinates: X=${Math.floor(pos.x)}, Y=${Math.floor(pos.y-1)}, Z=${Math.floor(pos.z)}. The base spans from X=${Math.floor(pos.x-9)} to X=${Math.floor(pos.x)} and Z=${Math.floor(pos.z)} to Z=${Math.floor(pos.z+9)}.`;
        agent.bot.chat(message);
        return message;
    }
},

{
    name: '!announceCompletion',
    description: 'Announce task completion with current location details.',
    params: {
        'taskDescription': { type: 'string', description: 'Description of completed task' }
    },
    perform: async function(agent, taskDescription) {
        const pos = agent.bot.entity.position;
        const message = `${taskDescription} complete at coordinates X=${Math.floor(pos.x)}, Y=${Math.floor(pos.y)}, Z=${Math.floor(pos.z)}`;
        agent.bot.chat(message);
        console.log(`[${agent.name}] Announced: ${message}`);
        return message;
    }
},
{
    name: '!waitForAnnouncement',
    description: 'Wait and listen for specific announcement from another bot.',
    params: {
        'keyword': { type: 'string', description: 'Keyword to listen for in chat' },
        'timeout': { type: 'float', description: 'Seconds to wait', domain: [10, 120] }
    },
    perform: async function(agent, keyword, timeout = 30) {
        return new Promise((resolve) => {
            let timeoutId;
            const chatHandler = (username, message) => {
                if (message.toLowerCase().includes(keyword.toLowerCase())) {
                    agent.bot.removeListener('chat', chatHandler);
                    clearTimeout(timeoutId);
                    resolve(`Heard announcement: ${message}`);
                }
            };
            
            agent.bot.on('chat', chatHandler);
            
            timeoutId = setTimeout(() => {
                agent.bot.removeListener('chat', chatHandler);
                resolve(`Timeout waiting for announcement containing: ${keyword}`);
            }, timeout * 1000);
        });
    }
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
    name: '!spawnAndDelegateTask',
    description: 'Spawn workers and assign them a coordinated task',
    params: {
        'taskDescription': { type: 'string', description: 'The task to be performed' },
        'workerCount': { type: 'int', description: 'Number of workers to spawn', domain: [1, 10] },
        'workerType': { type: 'string', description: 'Type of worker to spawn (e.g., builder, miner, gatherer)' }
    },
    perform: async function(agent, taskDescription, workerCount = 2, workerType = "builder") {
        try {
            console.log('[SpawnAndDelegateTask] Called by:', agent.name);

            // Use API call instead of global variable
            const response = await fetch(`http://localhost:8080/api/hierarchical/spawn-and-delegate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    supervisorName: agent.name,
                    taskDescription: taskDescription,
                    workerCount: workerCount,
                    workerType: workerType
                })
            });

            const result = await response.json();

            if (result.success) {
                return `Successfully spawned ${result.workersAssigned?.length || workerCount} workers for task: "${taskDescription}". Workers: ${result.workersAssigned?.join(', ') || 'spawning...'}`;
            } else {
                return `Failed to spawn and delegate task: ${result.message || result.reason}`;
            }
        } catch (error) {
            return `Error spawning and delegating task: ${error.message}`;
        }
    }
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
    name: '!announceLocation',
    description: 'Announce current location in chat for team coordination.',
    params: {
        'message': { type: 'string', description: 'Message to announce with location' }
    },
    perform: async function(agent, message) {
        const pos = agent.bot.entity.position;
        const locationMessage = `${message} - I'm at coordinates (${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)})`;
        agent.bot.chat(locationMessage);
        return `Announced location: ${locationMessage}`;
    }
},
{
    name: '!findNearbyPlayers',
    description: 'Find and list nearby players within a certain range.',
    params: {
        'range': { type: 'float', description: 'Search range in blocks', domain: [5, 100] }
    },
    perform: async function(agent, range = 50) {
        const myPos = agent.bot.entity.position;
        const nearbyPlayers = [];
        
        for (const [playerName, player] of Object.entries(agent.bot.players)) {
            if (playerName === agent.name) continue;
            
            if (player.entity) {
                const playerPos = player.entity.position;
                const distance = myPos.distanceTo(playerPos);
                
                if (distance <= range) {
                    nearbyPlayers.push({
                        name: playerName,
                        distance: Math.round(distance),
                        position: {
                            x: Math.floor(playerPos.x),
                            y: Math.floor(playerPos.y),
                            z: Math.floor(playerPos.z)
                        }
                    });
                }
            }
        }
        
        if (nearbyPlayers.length === 0) {
            return `No players found within ${range} blocks.`;
        }
        
        const playerList = nearbyPlayers.map(p => 
            `${p.name} at (${p.position.x}, ${p.position.y}, ${p.position.z}) - ${p.distance} blocks away`
        ).join(', ');
        
        return `Found ${nearbyPlayers.length} nearby player(s): ${playerList}`;
    }
},
    {
        name: '!shareWorkspaceCoords',
        description: 'Share current coordinates with team members in a workspace for coordination.',
        params: {
            'workspace_id': { type: 'string', description: 'The workspace ID to share coordinates with' }
        },
        perform: async function(agent, workspace_id) {
            const pos = agent.bot.entity.position;
            const coordMessage = `WORKSPACE_${workspace_id}_COORDS:${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
            agent.bot.chat(coordMessage);

            // Also update the hierarchical bot manager if available
            if (global.kodecraftHierarchicalBotManager) {
                global.kodecraftHierarchicalBotManager.updateWorkspaceCoordinationPoint(workspace_id, {
                    x: Math.floor(pos.x),
                    y: Math.floor(pos.y),
                    z: Math.floor(pos.z)
                });
            }

            return `Shared coordinates (${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}) with workspace ${workspace_id}`;
        }
    },
    {
        name: '!waitForWorkspaceCoords',
        description: 'Wait for workspace coordinates to be shared by the lead worker.',
        params: {
            'workspace_id': { type: 'string', description: 'The workspace ID to wait for coordinates from' },
            'timeout_seconds': { type: 'int', description: 'Maximum time to wait in seconds', domain: [10, 300] }
        },
        perform: async function(agent, workspace_id, timeout_seconds = 30) {
            return new Promise((resolve) => {
                const startTime = Date.now();
                const coordPattern = new RegExp(`WORKSPACE_${workspace_id}_COORDS:([-\\d]+),([-\\d]+),([-\\d]+)`);

                const messageHandler = (username, message) => {
                    const match = message.match(coordPattern);
                    if (match) {
                        const x = parseInt(match[1]);
                        const y = parseInt(match[2]);
                        const z = parseInt(match[3]);

                        agent.bot.removeListener('chat', messageHandler);
                        resolve(`Received workspace coordinates: ${x}, ${y}, ${z}. Use !goToCoordinates(${x}, ${y}, ${z}) to go there.`);
                    }
                };

                agent.bot.on('chat', messageHandler);

                // Timeout handler
                setTimeout(() => {
                    agent.bot.removeListener('chat', messageHandler);
                    resolve(`Timeout waiting for workspace ${workspace_id} coordinates after ${timeout_seconds} seconds.`);
                }, timeout_seconds * 1000);
            });
        }
    },
    {
        name: '!announceWorkspaceStatus',
        description: 'Announce current status to workspace team members.',
        params: {
            'workspace_id': { type: 'string', description: 'The workspace ID' },
            'status_message': { type: 'string', description: 'Status message to announce' }
        },
        perform: async function(agent, workspace_id, status_message) {
            const message = `WORKSPACE_${workspace_id}_STATUS: ${agent.name}: ${status_message}`;
            agent.bot.chat(message);
            return `Announced status to workspace ${workspace_id}: ${status_message}`;
        }
    },
    {
        name: '!checkWorkspaceTeam',
        description: 'Check which team members are online and nearby in the workspace.',
        params: {
            'workspace_id': { type: 'string', description: 'The workspace ID to check' }
        },
        perform: async function(agent, workspace_id) {
            if (!global.kodecraftHierarchicalBotManager) {
                return "Workspace management not available.";
            }

            const coordination = await global.kodecraftHierarchicalBotManager.checkWorkspaceCoordination(workspace_id);

            if (!coordination.coordinated) {
                return `Workspace ${workspace_id} coordination status: ${coordination.reason || 'Not all team members are coordinated'}. Coordinated: ${coordination.coordinatedWorkers?.join(', ') || 'none'}. Uncoordinated: ${coordination.uncoordinatedWorkers?.map(w => `${w.name} (${w.distance})`).join(', ') || 'none'}.`;
            } else {
                return `Workspace ${workspace_id} is fully coordinated! All team members are at the work site: ${coordination.coordinatedWorkers.join(', ')}.`;
            }
        }
    },

    {
        name: '!completePhase',
        description: 'Signal completion of a building phase to trigger the next phase for coordinated workers',
        params: {
            'phase': { type: 'string', description: 'The phase that was completed (e.g., "foundation", "walls", "roof")' },
            'description': { type: 'string', description: 'Brief description of what was completed' }
        },
        perform: async function(agent, phase, description = '') {
            try {
                // Notify the hierarchical bot manager about phase completion
                const completionMessage = `${phase} phase complete: ${description}`;

                // Call the hierarchical bot manager's completion handler
                if (global.kodecraftHierarchicalBotManager) {
                    await global.kodecraftHierarchicalBotManager.handleTaskCompletion(agent.name, completionMessage);
                }

                // Also announce in chat for coordination
                agent.bot.chat(`✅ ${phase.toUpperCase()} COMPLETE: ${description}`);

                return `Phase "${phase}" marked as complete. Coordinated workers have been notified to proceed with next phase.`;
            } catch (error) {
                return `Error signaling phase completion: ${error.message}`;
            }
        }
    }
];

// Add hierarchical actions to the main actions list
 actionsList.push(...hierarchicalActions);


