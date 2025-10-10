import { History } from './history.js';
import { Coder } from './coder.js';
import { VisionInterpreter } from './vision/vision_interpreter.js';
import { Prompter } from '../models/prompter.js';
import { initModes } from './modes.js';
import { initBot } from '../utils/mcdata.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage, isAction, blacklistCommands } from './commands/index.js';
import { ActionManager } from './action_manager.js';
import { NPCContoller } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import { SelfPrompter } from './self_prompter.js';
import convoManager from './conversation.js';
import { handleTranslation, handleEnglishTranslation } from '../utils/translator.js';
import { addBrowserViewer } from './vision/browser_viewer.js';
import { serverProxy } from './mindserver_proxy.js';
import settings from './settings.js';
import { Task } from './tasks/tasks.js';
import { say } from './speak.js';

export class Agent {
    async start(load_mem = false, init_message = null, count_id = 0) {
        this.last_sender = null;
        this.count_id = count_id;

        // Initialize components with more detailed error handling
        this.actions = new ActionManager(this);
        this.prompter = new Prompter(this, settings.profile);
        this.name = this.prompter.getName();
        console.log(`Initializing agent ${this.name}...`);
        this.history = new History(this);
        this.coder = new Coder(this);
        this.npc = new NPCContoller(this);
        this.memory_bank = new MemoryBank();
        this.self_prompter = new SelfPrompter(this);
        convoManager.initAgent(this);
        await this.prompter.initExamples();

        // load mem first before doing task
        let save_data = null;
        if (load_mem) {
            save_data = this.history.load();
        }
        let taskStart = null;
        if (save_data) {
            taskStart = save_data.taskStart;
        } else {
            taskStart = Date.now();
        }
        this.task = new Task(this, settings.task, taskStart);
        this.blocked_actions = settings.blocked_actions.concat(this.task.blocked_actions || []);
        blacklistCommands(this.blocked_actions);

        console.log(this.name, 'logging into minecraft...');
        this.bot = initBot(this.name);

        initModes(this);

        this.bot.on('login', () => {
            console.log(this.name, 'logged in!');
            serverProxy.login();

            // Set skin for profile, requires Fabric Tailor. (https://modrinth.com/mod/fabrictailor)
            if (this.prompter.profile.skin)
                this.bot.chat(`/skin set URL ${this.prompter.profile.skin.model} ${this.prompter.profile.skin.path}`);
            else
                this.bot.chat(`/skin clear`);
        });

        const spawnTimeout = setTimeout(() => {
            process.exit(0);
        }, 30000);
        this.bot.once('spawn', async () => {
            try {
                clearTimeout(spawnTimeout);
                addBrowserViewer(this.bot, count_id);
                console.log('Initializing vision intepreter...');
                this.vision_interpreter = new VisionInterpreter(this, settings.allow_vision);

                // wait for a bit so stats are not undefined
                await new Promise((resolve) => setTimeout(resolve, 1000));

                console.log(`${this.name} spawned.`);
                this.clearBotLogs();

                this._setupEventHandlers(save_data, init_message);
                this.startEvents();

                if (!load_mem) {
                    if (settings.task) {
                        this.task.initBotTask();
                        this.task.setAgentGoal();
                    }
                } else {
                    // set the goal without initializing the rest of the task
                    if (settings.task) {
                        this.task.setAgentGoal();
                    }
                }

                await new Promise((resolve) => setTimeout(resolve, 10000));
                this.checkAllPlayersPresent();

            } catch (error) {
                console.error('Error in spawn event:', error);
                process.exit(0);
            }
        });
    }

    async _setupEventHandlers(save_data, init_message) {
        const ignore_messages = [
            "Set own game mode to",
            "Set the time to",
            "Set the difficulty to",
            "Teleported ",
            "Set the weather to",
            "Gamerule "
        ];

        const respondFunc = async (username, message) => {
            if (username === this.name) return;
            if (settings.only_chat_with.length > 0 && !settings.only_chat_with.includes(username)) return;
            try {
                if (ignore_messages.some((m) => message.startsWith(m))) return;

                this.shut_up = false;

                console.log(this.name, 'received message from', username, ':', message);

                if (convoManager.isOtherAgent(username)) {
                    console.warn('received whisper from other bot??')
                }
                else {
                    let translation = await handleEnglishTranslation(message);
                    this.handleMessage(username, translation);
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        }

        this.respondFunc = respondFunc;

        this.bot.on('whisper', respondFunc);

        this.bot.on('chat', (username, message) => {
            if (serverProxy.getNumOtherAgents() > 0) return;
            // only respond to open chat messages when there are no other agents
            respondFunc(username, message);
        });

        // Set up auto-eat
        this.bot.autoEat.options = {
            priority: 'foodPoints',
            startAt: 14,
            bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
        };

        if (save_data?.self_prompt) {
            if (init_message) {
                this.history.add('system', init_message);
            }
            await this.self_prompter.handleLoad(save_data.self_prompt, save_data.self_prompting_state);
        }
        if (save_data?.last_sender) {
            this.last_sender = save_data.last_sender;
            if (convoManager.otherAgentInGame(this.last_sender)) {
                const msg_package = {
                    message: `You have restarted and this message is auto-generated. Continue the conversation with me.`,
                    start: true
                };
                convoManager.receiveFromBot(this.last_sender, msg_package);
            }
        }
        else if (init_message) {
            await this.handleMessage('system', init_message, 2);
        }
        else {
            this.openChat("Hello world! I am " + this.name);
        }
    }

    checkAllPlayersPresent() {
        if (!this.task || !this.task.agent_names) {
            return;
        }

        const missingPlayers = this.task.agent_names.filter(name => !this.bot.players[name]);
        if (missingPlayers.length > 0) {
            console.log(`Missing players/bots: ${missingPlayers.join(', ')}`);
            this.cleanKill('Not all required players/bots are present in the world. Exiting.', 4);
        }
    }

    requestInterrupt() {
        this.bot.interrupt_code = true;
        this.bot.stopDigging();
        this.bot.collectBlock.cancelTask();
        this.bot.pathfinder.stop();
        this.bot.pvp.stop();
    }

    clearBotLogs() {
        this.bot.output = '';
        this.bot.interrupt_code = false;
    }

    shutUp() {
        this.shut_up = true;
        if (this.self_prompter.isActive()) {
            this.self_prompter.stop(false);
        }
        convoManager.endAllConversations();
    }

    async handleMessage(source, message, max_responses = null) {
        await this.checkTaskDone();
        if (!source || !message) {
            console.warn('Received empty message from', source);
            return false;
        }

        // Worker focus system: ignore non-task messages during building
        if (this.name && this.name.startsWith('Worker') && this.isActivelyBuilding()) {
            // Only accept task messages, ignore casual conversation
            if (!this.isTaskMessage(message)) {
                return false; // Silently ignore non-task messages
            }
        }

        let used_command = false;
        if (max_responses === null) {
            max_responses = settings.max_commands === -1 ? Infinity : settings.max_commands;
        }
        if (max_responses === -1) {
            max_responses = Infinity;
        }

        const self_prompt = source === 'system' || source === this.name;
        const from_other_bot = convoManager.isOtherAgent(source);

        if (!self_prompt && !from_other_bot) { // from user, check for forced commands
            // Check for collaborative commands first (but only slash commands, not natural language)
            if (message.trim().startsWith('/') && await this.handleCollaborativeCommands(source, message)) {
                return true;
            }
            
            const user_command_name = containsCommand(message);
            if (user_command_name) {
                if (!commandExists(user_command_name)) {
                    this.routeResponse(source, `Command '${user_command_name}' does not exist.`);
                    return false;
                }
                this.routeResponse(source, `*${source} used ${user_command_name.substring(1)}*`);
                if (user_command_name === '!newAction') {
                    // all user-initiated commands are ignored by the bot except for this one
                    // add the preceding message to the history to give context for newAction
                    this.history.add(source, message);
                }
                let execute_res = await executeCommand(this, message);
                if (execute_res)
                    this.routeResponse(source, execute_res);
                return true;
            }
        }

        if (from_other_bot)
            this.last_sender = source;

        // Now translate the message
        message = await handleEnglishTranslation(message);
        console.log('received message from', source, ':', message);

        const checkInterrupt = () => this.self_prompter.shouldInterrupt(self_prompt) || this.shut_up || convoManager.responseScheduledFor(source);

        let behavior_log = this.bot.modes.flushBehaviorLog().trim();
        if (behavior_log.length > 0) {
            const MAX_LOG = 500;
            if (behavior_log.length > MAX_LOG) {
                behavior_log = '...' + behavior_log.substring(behavior_log.length - MAX_LOG);
            }
            behavior_log = 'Recent behaviors log: \n' + behavior_log;
            await this.history.add('system', behavior_log);
        }

        // Handle other user messages
        await this.history.add(source, message);
        this.history.save();

        for (const item of this.history.getHistory()) {
            console.log(item);
        }

        if (!self_prompt && this.self_prompter.isActive()) // message is from user during self-prompting
            max_responses = 1; // force only respond to this message, then let self-prompting take over
        for (let i = 0; i < max_responses; i++) {
            if (checkInterrupt()) break;
            let history = this.history.getHistory();
            let res = await this.prompter.promptConvo(history);

            console.log(`${this.name} full response to ${source}: ""${res}""`);

            if (res.trim().length === 0) {
                console.warn('no response')
                break; // empty response ends loop
            }

            let command_name = containsCommand(res);

            if (command_name) { // contains query or command
                res = truncCommandMessage(res); // everything after the command is ignored
                this.history.add(this.name, res);

                if (!commandExists(command_name)) {
                    this.history.add('system', `Command ${command_name} does not exist.`);
                    console.warn('Agent hallucinated command:', command_name)
                    continue;
                }

                if (checkInterrupt()) break;
                this.self_prompter.handleUserPromptedCmd(self_prompt, isAction(command_name));

                if (settings.verbose_commands) {
                    this.routeResponse(source, res);
                }
                else { 
                    let message = res.substring(0, res.indexOf(command_name)).trim();
                    this.routeResponse(source, message);
                }

                let execute_res = await executeCommand(this, res);

                console.log('Agent executed:', command_name, 'and got:', execute_res);
                used_command = true;

                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;
            }
            else { // conversation response
                this.history.add(this.name, res);
                this.routeResponse(source, res);
                break;
            }

            this.history.save();
        }

        return used_command;
    }

    async routeResponse(to_player, message) {
        if (this.shut_up) return;
        let self_prompt = to_player === 'system' || to_player === this.name;
        if (self_prompt && this.last_sender) {
            to_player = this.last_sender;
        }

        if (convoManager.isOtherAgent(to_player) && convoManager.inConversation(to_player)) {
            convoManager.sendToBot(to_player, message);
        }
        else {
            this.openChat(message);
        }
    }

    async openChat(message) {
        let to_translate = message;
        let remaining = '';
        let command_name = containsCommand(message);
        let translate_up_to = command_name ? message.indexOf(command_name) : -1;
        if (translate_up_to != -1) {
            to_translate = to_translate.substring(0, translate_up_to);
            remaining = message.substring(translate_up_to);
        }
        message = (await handleTranslation(to_translate)).trim() + " " + remaining;
        message = message.replaceAll('\n', ' ');

        if (serverProxy && serverProxy.connected) {
            serverProxy.getSocket().emit('agent-response', this.name, message);
        }

        if (settings.only_chat_with.length > 0) {
            for (let username of settings.only_chat_with) {
                this.bot.whisper(username, message);
            }
        }
        else {
            if (settings.speak) {
                say(to_translate);
            }
            this.bot.chat(message);
        }
    }

    startEvents() {
        // Custom events
        this.bot.on('time', () => {
            if (this.bot.time.timeOfDay == 0)
                this.bot.emit('sunrise');
            else if (this.bot.time.timeOfDay == 6000)
                this.bot.emit('noon');
            else if (this.bot.time.timeOfDay == 12000)
                this.bot.emit('sunset');
            else if (this.bot.time.timeOfDay == 18000)
                this.bot.emit('midnight');
        });

        let prev_health = this.bot.health;
        this.bot.lastDamageTime = 0;
        this.bot.lastDamageTaken = 0;
        this.bot.on('health', () => {
            if (this.bot.health < prev_health) {
                this.bot.lastDamageTime = Date.now();
                this.bot.lastDamageTaken = prev_health - this.bot.health;
            }
            prev_health = this.bot.health;
        });
        // Logging callbacks
        this.bot.on('error', (err) => {
            console.error('Error event!', err);
        });
        this.bot.on('end', (reason) => {
            console.warn('Bot disconnected! Killing agent process.', reason)
            this.cleanKill('Bot disconnected! Killing agent process.');
        });
        this.bot.on('death', () => {
            this.actions.cancelResume();
            this.actions.stop();
        });
        this.bot.on('kicked', (reason) => {
            console.warn('Bot kicked!', reason);
            this.cleanKill('Bot kicked! Killing agent process.');
        });
        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                let death_pos = this.bot.entity.position;
                this.memory_bank.rememberPlace('last_death_position', death_pos.x, death_pos.y, death_pos.z);
                let death_pos_text = null;
                if (death_pos) {
                    death_pos_text = `x: ${death_pos.x.toFixed(2)}, y: ${death_pos.y.toFixed(2)}, z: ${death_pos.x.toFixed(2)}`;
                }
                let dimention = this.bot.game.dimension;
                this.handleMessage('system', `You died at position ${death_pos_text || "unknown"} in the ${dimention} dimension with the final message: '${message}'. Your place of death is saved as 'last_death_position' if you want to return. Previous actions were stopped and you have respawned.`);
            }
        });
        this.bot.on('idle', () => {
            this.bot.clearControlStates();
            this.bot.pathfinder.stop(); // clear any lingering pathfinder
            this.bot.modes.unPauseAll();
            this.actions.resumeAction();
        });

        // Init NPC controller
        this.npc.init();

        // This update loop ensures that each update() is called one at a time, even if it takes longer than the interval
        const INTERVAL = 300;
        let last = Date.now();
        setTimeout(async () => {
            while (true) {
                let start = Date.now();
                await this.update(start - last);
                let remaining = INTERVAL - (Date.now() - start);
                if (remaining > 0) {
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                }
                last = start;
            }
        }, INTERVAL);

        this.bot.emit('idle');
    }

    async update(delta) {
        await this.bot.modes.update();
        this.self_prompter.update(delta);
        await this.checkTaskDone();
    }

    isIdle() {
        return !this.actions.executing;
    }

    /**
     * Handle collaborative commands like /spawn, /wall, etc.
     * @param {string} source - Message source
     * @param {string} message - The message content
     * @returns {boolean} - True if command was handled
     */
    async handleCollaborativeCommands(source, message) {
        const trimmed = message.trim();
        
        // Handle /spawn command
        const spawnMatch = trimmed.match(/^\/spawn\s+(\d+)$/);
        if (spawnMatch) {
            const count = parseInt(spawnMatch[1]);
            if (count < 1 || count > 10) {
                this.routeResponse(source, `Spawn count must be between 1 and 10. Got: ${count}`);
                return true;
            }
            
            try {
                // Check if collaborative manager is available
                const isAvailable = await this.getCollaborativeManager();
                if (!isAvailable) {
                    this.routeResponse(source, 'Collaborative manager not available - not connected to MindServer');
                    return true;
                }
                
                // Send spawn command to main process with current position
                const currentPos = this.bot.entity.position;
                const result = await this.sendCollaborativeCommand('spawn', { 
                    count, 
                    baseSettings: settings,
                    spawnLocation: { x: currentPos.x, y: currentPos.y, z: currentPos.z }
                });
                
                if (result.spawnedBots && result.spawnedBots.length > 0) {
                    const botNames = result.spawnedBots.map(bot => bot.name).join(', ');
                    this.routeResponse(source, `Successfully spawned ${result.spawnedBots.length} worker bots: ${botNames}`);
                } else {
                    this.routeResponse(source, 'Failed to spawn any worker bots');
                }
            } catch (error) {
                console.error('Error in /spawn command:', error);
                this.routeResponse(source, `Error spawning bots: ${error.message}`);
            }
            return true;
        }
        
        // Handle /wall command for collaborative building
        const wallMatch = trimmed.match(/^\/wall\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\w+))?$/);
        if (wallMatch) {
            const [, x1, y1, z1, x2, y2, z2, material = 'cobblestone'] = wallMatch;
            
            try {
                const isAvailable = await this.getCollaborativeManager();
                if (!isAvailable) {
                    this.routeResponse(source, 'Collaborative manager not available');
                    return true;
                }
                
                const status = await this.sendCollaborativeCommand('getStatus');
                if (status.totalWorkers < 1) {
                    this.routeResponse(source, 'Need at least 1 worker bot for building. Use /spawn first.');
                    return true;
                }
                
                // Kid coordinates the wall building
                const wallStart = { x: parseInt(x1), y: parseInt(y1), z: parseInt(z1) };
                const wallEnd = { x: parseInt(x2), y: parseInt(y2), z: parseInt(z2) };
                
                this.routeResponse(source, `I'll coordinate building a ${material} wall from (${x1},${y1},${z1}) to (${x2},${y2},${z2})`);
                
                // Calculate dimensions and assign to workers
                const availableWorkers = status.workers.slice(0, Math.min(4, status.totalWorkers)); // Use up to 4 workers
                const wallLength = Math.abs(wallEnd.x - wallStart.x) + Math.abs(wallEnd.z - wallStart.z) + 1;
                const sectionsPerWorker = Math.ceil(wallLength / availableWorkers.length);
                
                this.routeResponse(source, `Dividing ${wallLength}-block wall between ${availableWorkers.length} workers...`);
                
                // Assign sections to each worker
                for (let i = 0; i < availableWorkers.length; i++) {
                    const worker = availableWorkers[i];
                    
                    // Calculate section coordinates (simplified for X-axis walls)
                    const sectionStartX = Math.min(wallStart.x, wallEnd.x) + (i * sectionsPerWorker);
                    const sectionEndX = Math.min(wallStart.x, wallEnd.x) + Math.min((i + 1) * sectionsPerWorker - 1, wallLength - 1);
                    
                    const workerTask = `Build wall section from (${sectionStartX},${wallStart.y},${wallStart.z}) to (${sectionEndX},${wallEnd.y},${wallEnd.z}) using ${material}. Part of team wall project!`;
                    
                    await this.sendCollaborativeCommand('sendMessageToWorker', {
                        workerName: worker.name,
                        message: workerTask
                    });
                    
                    this.routeResponse(source, `${worker.name}: Section x=${sectionStartX} to x=${sectionEndX}`);
                }
                
                this.routeResponse(source, `All workers assigned! Wall construction coordinated by me.`);
            } catch (error) {
                console.error('Error in /wall command:', error);
                this.routeResponse(source, `Error coordinating wall: ${error.message}`);
            }
            return true;
        }
        
        // Handle /workers command to list workers
        if (trimmed === '/workers') {
            try {
                const isAvailable = await this.getCollaborativeManager();
                if (!isAvailable) {
                    this.routeResponse(source, 'Collaborative manager not available');
                    return true;
                }
                
                const status = await this.sendCollaborativeCommand('getStatus');
                if (status.totalWorkers === 0) {
                    this.routeResponse(source, 'No worker bots currently active. Use /spawn to create some.');
                } else {
                    const workerList = status.workers.map(w => `${w.name} (${w.status})`).join(', ');
                    this.routeResponse(source, `Active workers (${status.totalWorkers}): ${workerList}`);
                }
            } catch (error) {
                console.error('Error in /workers command:', error);
                this.routeResponse(source, `Error getting worker status: ${error.message}`);
            }
            return true;
        }
        
        // Handle /bringworkers command to teleport workers to current location
        if (trimmed === '/bringworkers') {
            try {
                const isAvailable = await this.getCollaborativeManager();
                if (!isAvailable) {
                    this.routeResponse(source, 'Collaborative manager not available');
                    return true;
                }
                
                const currentPos = this.bot.entity.position;
                const result = await this.sendCollaborativeCommand('teleportWorkers', {
                    location: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
                    useRetry: true
                });
                
                this.routeResponse(source, `Teleporting all workers to my current location (${Math.floor(currentPos.x)}, ${Math.floor(currentPos.y)}, ${Math.floor(currentPos.z)})`);
            } catch (error) {
                console.error('Error in /bringworkers command:', error);
                this.routeResponse(source, `Error teleporting workers: ${error.message}`);
            }
            return true;
        }

        // Handle /stopworkers command
        if (trimmed === '/stopworkers') {
            try {
                const isAvailable = await this.getCollaborativeManager();
                if (!isAvailable) {
                    this.routeResponse(source, 'Collaborative manager not available');
                    return true;
                }
                
                await this.sendCollaborativeCommand('stopAllWorkers');
                this.routeResponse(source, 'Stopped all worker bots');
            } catch (error) {
                console.error('Error in /stopworkers command:', error);
                this.routeResponse(source, `Error stopping workers: ${error.message}`);
            }
            return true;
        }
        
        // Handle /repair command for fixing specific missing blocks
        const repairMatch = trimmed.match(/^\/repair\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\w+))?$/);
        if (repairMatch) {
            const [, x1, y1, z1, x2, y2, z2, material = 'cobblestone'] = repairMatch;
            
            try {
                const status = await this.sendCollaborativeCommand('getStatus');
                if (status.totalWorkers === 0) {
                    this.routeResponse(source, 'No workers available for repairs. Use /spawn first.');
                    return true;
                }
                
                const repairWorker = status.workers[0]; // Use first available worker
                const repairTask = `REPAIR TASK: Fix any missing ${material} blocks in area from (${x1},${y1},${z1}) to (${x2},${y2},${z2}). Check each position and place ${material} where needed. Build foundation blocks if needed.`;
                
                await this.sendCollaborativeCommand('sendMessageToWorker', {
                    workerName: repairWorker.name,
                    message: repairTask
                });
                
                this.routeResponse(source, `${repairWorker.name} assigned to repair area (${x1},${y1},${z1}) to (${x2},${y2},${z2})`);
            } catch (error) {
                console.error('Error in /repair command:', error);
                this.routeResponse(source, `Error during repair: ${error.message}`);
            }
            return true;
        }
        
        // Handle /inspect command for Kid to check wall quality
        const inspectMatch = trimmed.match(/^\/inspect\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\w+))?$/);
        if (inspectMatch) {
            const [, x1, y1, z1, x2, y2, z2, material = 'cobblestone'] = inspectMatch;
            
            try {
                this.routeResponse(source, `I'll inspect the wall from (${x1},${y1},${z1}) to (${x2},${y2},${z2}) for quality control.`);
                
                // Calculate all expected block positions
                const missingBlocks = [];
                const wallStart = { x: parseInt(x1), y: parseInt(y1), z: parseInt(z1) };
                const wallEnd = { x: parseInt(x2), y: parseInt(y2), z: parseInt(z2) };
                
                // Check each position in the wall area
                for (let x = Math.min(wallStart.x, wallEnd.x); x <= Math.max(wallStart.x, wallEnd.x); x++) {
                    for (let y = Math.min(wallStart.y, wallEnd.y); y <= Math.max(wallStart.y, wallEnd.y); y++) {
                        for (let z = Math.min(wallStart.z, wallEnd.z); z <= Math.max(wallStart.z, wallEnd.z); z++) {
                            // Check if block exists at position using !getBlockAtPosition
                            const checkResult = await executeCommand(this, `!getBlockAtPosition(${x}, ${y}, ${z})`);
                            if (checkResult && (checkResult.includes('air') || checkResult.includes('nothing'))) {
                                missingBlocks.push({ x, y, z });
                            }
                        }
                    }
                }
                
                if (missingBlocks.length === 0) {
                    this.routeResponse(source, `Wall inspection complete! All blocks are properly placed. Great work team!`);
                } else {
                    this.routeResponse(source, `Wall inspection found ${missingBlocks.length} missing blocks. Assigning repairs...`);
                    
                    // Get available workers for repairs
                    const status = await this.sendCollaborativeCommand('getStatus');
                    if (status.totalWorkers > 0) {
                        const repairWorker = status.workers[0]; // Use first available worker
                        
                        // Create repair task for missing blocks
                        const repairBlocks = missingBlocks.slice(0, 10);
                        const repairList = repairBlocks.map(b => `(${b.x},${b.y},${b.z})`).join(', ');
                        
                        const repairTask = `Repair wall - place ${material} blocks at these positions: ${repairList}`;
                        
                        await this.sendCollaborativeCommand('sendMessageToWorker', {
                            workerName: repairWorker.name,
                            message: repairTask
                        });
                        
                        this.routeResponse(source, `${repairWorker.name} assigned to repair ${repairBlocks.length} missing blocks.`);
                    }
                }
            } catch (error) {
                console.error('Error in /inspect command:', error);
                this.routeResponse(source, `Error during inspection: ${error.message}`);
            }
            return true;
        }
        
        // Handle /help collaborative command
        if (trimmed === '/help' || trimmed === '/collab') {
            const helpText = `
Kid Leadership Commands - I coordinate my worker team:
• /spawn <count> - I'll spawn worker bots (1-10) near me
• /workers - Check status of my worker team
• /bringworkers - I'll teleport all workers to my location
• /testwall - I'll coordinate a test wall with auto-inspection
• /wall <x1> <y1> <z1> <x2> <y2> <z2> [material] - I'll coordinate wall building
• /inspect <x1> <y1> <z1> <x2> <y2> <z2> [material] - I'll inspect wall quality
• /repair <x1> <y1> <z1> <x2> <y2> <z2> [material] - I'll send worker to fix area
• /stopworkers - I'll stop all my workers
• /collab or /help - Show this help

How I work as team leader:
1. You give me building tasks
2. I divide work with foundation-first building
3. Each worker gets a section of the same structure
4. I auto-inspect work after 30 seconds
5. I assign repairs for any missing blocks
6. Quality control ensures perfect results!

Example workflow:
1. /spawn 2 (I create Worker1, Worker2)
2. /testwall (I coordinate + auto-inspect + repair)
3. Perfect wall with no missing blocks!
            `.trim();
            
            this.routeResponse(source, helpText);
            return true;
        }
        
        // Handle /testwall command for a simple collaborative building test
        if (false && trimmed === '/testwall') {
            // TEMPORARILY DISABLED to prevent duplicate task assignment during collaborative building
            try {
                const isAvailable = await this.getCollaborativeManager();
                if (!isAvailable) {
                    this.routeResponse(source, 'Collaborative manager not available');
                    return true;
                }
                
                // Get worker status first
                const status = await this.sendCollaborativeCommand('getStatus');
                if (status.totalWorkers < 2) {
                    this.routeResponse(source, 'Need at least 2 worker bots for test. Use "/spawn 2" first.');
                    return true;
                }
                
                // Kid acts as coordinator and assigns the task
                const pos = this.bot.entity.position;
                const wallStart = { x: Math.floor(pos.x + 5), y: Math.floor(pos.y), z: Math.floor(pos.z) };
                const wallEnd = { x: Math.floor(pos.x + 15), y: Math.floor(pos.y + 2), z: Math.floor(pos.z) };
                
                this.routeResponse(source, `I'll coordinate the workers to build a wall from (${wallStart.x},${wallStart.y},${wallStart.z}) to (${wallEnd.x},${wallEnd.y},${wallEnd.z})`);
                
                // Calculate wall sections and assign to workers
                const availableWorkers = status.workers.slice(0, 2);
                const wallLength = wallEnd.x - wallStart.x + 1;
                const sectionsPerWorker = Math.ceil(wallLength / availableWorkers.length);
                
                this.routeResponse(source, `Dividing ${wallLength}-block wall between ${availableWorkers.length} workers...`);
                
                // Assign sections to each worker using improved building logic
                for (let i = 0; i < availableWorkers.length; i++) {
                    const worker = availableWorkers[i];
                    const sectionStartX = wallStart.x + (i * sectionsPerWorker);
                    const sectionEndX = Math.min(wallStart.x + ((i + 1) * sectionsPerWorker) - 1, wallEnd.x);
                    
                    const section = {
                        start: { x: sectionStartX, y: wallStart.y, z: wallStart.z },
                        end: { x: sectionEndX, y: wallEnd.y, z: wallEnd.z }
                    };
                    
                    // Use improved build task with foundation first logic
                    await this.sendCollaborativeCommand('sendImprovedBuildTask', {
                        workerName: worker.name,
                        section: section,
                        material: 'cobblestone'
                    });
                    
                    this.routeResponse(source, `${worker.name}: Section x=${sectionStartX} to x=${sectionEndX} (foundation-first method)`);
                }
                
                this.routeResponse(source, `All workers assigned! Building will begin. I'll inspect the results in 30 seconds.`);
                
                // Schedule automatic inspection after workers have had time to build
                setTimeout(async () => {
                    try {
                        this.routeResponse(source, `🔍 Time for quality control inspection!`);
                        
                        // Inspect the wall automatically
                        const inspectMessage = `/inspect ${wallStart.x} ${wallStart.y} ${wallStart.z} ${wallEnd.x} ${wallEnd.y} ${wallEnd.z} cobblestone`;
                        await this.handleCollaborativeCommands(source, inspectMessage);
                    } catch (error) {
                        console.error('Error during automatic inspection:', error);
                        this.routeResponse(source, `Error during automatic inspection: ${error.message}`);
                    }
                }, 30000); // 30 second delay
            } catch (error) {
                console.error('Error in /testwall command:', error);
                this.routeResponse(source, `Error coordinating wall task: ${error.message}`);
            }
            return true;
        }
        
        return false; // Command not handled
    }
    
     // Get the collaborative manager from the MindServer

    async getCollaborativeManager() {
        // Since the agent runs in a separate process, we need to communicate
        // with the main process through the MindServer proxy
        return serverProxy && serverProxy.connected;
    }

    
     // Send collaborative command to the main process

    async sendCollaborativeCommand(command, data = {}) {
        if (!serverProxy || !serverProxy.connected) {
            throw new Error('Not connected to MindServer');
        }

        return new Promise((resolve, reject) => {
            const requestId = `collab_${Date.now()}_${Math.random()}`;
            
            // Set up listener for response
            const timeout = setTimeout(() => {
                serverProxy.getSocket().off(`collab-response-${requestId}`);
                reject(new Error('Collaborative command timeout'));
            }, 10000);

            serverProxy.getSocket().once(`collab-response-${requestId}`, (response) => {
                clearTimeout(timeout);
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response.error));
                }
            });

            // Send command to main process
            serverProxy.getSocket().emit('collaborative-command', {
                requestId,
                command,
                data,
                agentName: this.name
            });
        });
    }
    cleanKill(msg = 'Killing agent process...', code = 1) {
        this.history.add('system', msg);
        this.bot.chat(code > 1 ? 'Restarting.' : 'Exiting.');
        this.history.save();
        process.exit(code);
    }
    async checkTaskDone() {
        if (this.task.data) {
            let res = this.task.isDone();
            if (res) {
                await this.history.add('system', `Task ended with score : ${res.score}`);
                await this.history.save();
                console.log('Task finished:', res.message);
                this.killAll();
            }
        }
    }

    killAll() {
        serverProxy.shutdown();
    }

    
     //Create wall tasks dynamically based on worker count - Improved with foundation and decorations

    _createWallTasks(baseX, baseY, baseZ, workerCount, dimensions = null, material = 'cobblestone') {
        const wallLength = dimensions && dimensions.length ? dimensions.length : 20;
        const wallHeight = dimensions && dimensions.height ? dimensions.height : 4;
        const sectionLength = Math.ceil(wallLength / workerCount);
        const tasks = [];
        
        for (let i = 0; i < workerCount; i++) {
            const startX = baseX + (i * sectionLength);
            const endX = Math.min(baseX + ((i + 1) * sectionLength) - 1, baseX + wallLength - 1);
            
            // Enhanced wall building with proper foundation, crenellations, and lighting
            tasks.push({
                summary: `Enhanced wall section ${i + 1} (x=${startX} to x=${endX})`,
                instruction: `Build enhanced wall section with repair: !repairAction("Step 1: Build foundation by placing stone blocks from x=${startX} to x=${endX} at y=${baseY - 1}, z=${baseZ}. Step 2: Build main wall using ${material} from x=${startX} to x=${endX}, y=${baseY} to y=${baseY + wallHeight - 2}, z=${baseZ}. Step 3: Add battlements (crenellations) at top - place ${material} blocks every other position at y=${baseY + wallHeight - 1}. Step 4: Add arrow slits - create 1-block windows every 3 blocks at y=${baseY + 2}. Step 5: Place torches every 5 blocks for lighting at y=${baseY + wallHeight - 1}. Step 6: Add buttresses for support - place stone blocks extending 2 blocks out every 7 blocks. Use await skills.placeBlock() for each placement. Build foundation first, then walls bottom to top.") When complete, say 'Task complete for enhanced wall section ${i + 1}'.`
            });
        }
        
        return tasks;
    }

    
     // Create house tasks dynamically based on worker count - Now builds a 2-room house with decorations

    _createHouseTasks(baseX, baseY, baseZ, workerCount) {
        // Generate a unique task ID for this building session
        const taskId = `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // New 2-room house design: 16x11 total (Room 1: 7x11, Room 2: 9x11) with shared middle wall
        const allComponents = [
            {
                id: `${taskId}_foundation`,
                name: "foundation",
                summary: "Foundation for 2-room house", 
                instruction: `Build foundation with repair: !repairAction("Build complete foundation by placing stone blocks covering the entire 16x11 area. For x from ${baseX} to ${baseX + 15} and z from ${baseZ} to ${baseZ + 10}, place stone at each coordinate at y=${baseY}. This creates a solid 176-block foundation for our 2-room house. Use await skills.placeBlock(bot, 'stone') for each block placement.") When finished, say 'Task complete for foundation'.`
            },
            {
                id: `${taskId}_exterior_walls`,
                name: "exterior_walls",
                summary: "Exterior walls with front door", 
                instruction: `Build exterior walls with repair: !repairAction("Build North wall (front): place oak_planks from x=${baseX} to x=${baseX + 15}, y=${baseY + 1} to y=${baseY + 3}, z=${baseZ}. Skip exactly 2 blocks at x=${baseX + 7}, y=${baseY + 1} and y=${baseY + 2} for main door. Build South wall (back): place oak_planks from x=${baseX} to x=${baseX + 15}, y=${baseY + 1} to y=${baseY + 3}, z=${baseZ + 10}. Skip single blocks at x=${baseX + 2}, x=${baseX + 8}, x=${baseX + 13}, y=${baseY + 2} for windows. Build East wall: place oak_planks from z=${baseZ} to z=${baseZ + 10}, y=${baseY + 1} to y=${baseY + 3}, x=${baseX + 15}. Skip single block at z=${baseZ + 5}, y=${baseY + 2} for window. Build West wall: place oak_planks from z=${baseZ} to z=${baseZ + 10}, y=${baseY + 1} to y=${baseY + 3}, x=${baseX}. Skip single block at z=${baseZ + 5}, y=${baseY + 2} for window. Use await skills.placeBlock(bot, 'oak_planks') for each wall block placement.") When finished, say 'Task complete for exterior_walls'.`
            },
            {
                id: `${taskId}_room_separator`,
                name: "room_separator",
                summary: "Interior wall separating rooms", 
                instruction: `Build room separator with repair: !repairAction("Build interior wall to separate the rooms: place oak_planks from z=${baseZ + 1} to z=${baseZ + 9}, y=${baseY + 1} to y=${baseY + 3}, x=${baseX + 7}. Skip exactly 2 blocks at z=${baseZ + 5}, y=${baseY + 1} and y=${baseY + 2} for connecting door between rooms. This creates Room 1 (living room) on the left and Room 2 (bedroom) on the right. Use await skills.placeBlock(bot, 'oak_planks') for each wall block placement.") When finished, say 'Task complete for room_separator'.`
            },
            {
                id: `${taskId}_doors_windows`,
                name: "doors_windows",
                summary: "Install doors and windows", 
                instruction: `Install doors and windows with repair: !repairAction("Place oak_door at main entrance (${baseX + 7},${baseY + 1},${baseZ}). Place oak_door between rooms (${baseX + 7},${baseY + 1},${baseZ + 5}). Place glass blocks at all windows: South wall windows (${baseX + 2},${baseY + 2},${baseZ + 10}), (${baseX + 8},${baseY + 2},${baseZ + 10}), (${baseX + 13},${baseY + 2},${baseZ + 10}). East wall window (${baseX + 15},${baseY + 2},${baseZ + 5}). West wall window (${baseX},${baseY + 2},${baseZ + 5}). Use await skills.placeBlock(bot, 'oak_door') for doors and await skills.placeBlock(bot, 'glass') for windows.") When finished, say 'Task complete for doors_windows'.`
            },
            {
                id: `${taskId}_roof`,
                name: "roof",
                summary: "Roof construction", 
                instruction: `Build roof with repair: !repairAction("Build roof by placing oak_planks from x=${baseX} to x=${baseX + 15}, z=${baseZ} to z=${baseZ + 10} at y=${baseY + 4}. This covers both rooms with a unified roof. Use await skills.placeBlock(bot, 'oak_planks') for each roof block.") When finished, say 'Task complete for roof'.`
            },
            {
                id: `${taskId}_lighting`,
                name: "lighting",
                summary: "Interior and exterior wall lighting", 
                instruction: `Install wall lighting with repair: !repairAction("Place wall-mounted torches AWAY from windows: Room 1 (living room) - place torch on north wall at (${baseX + 3},${baseY + 2},${baseZ + 1}) facing south, torch on east interior wall at (${baseX + 6},${baseY + 2},${baseZ + 3}) facing west. Room 2 (bedroom) - place torch on north wall at (${baseX + 9},${baseY + 2},${baseZ + 1}) facing south, torch on west interior wall at (${baseX + 8},${baseY + 2},${baseZ + 7}) facing east. Exterior entrance - place torch on exterior north wall at (${baseX + 6},${baseY + 3},${baseZ}) facing north. Use await skills.placeBlock(bot, 'torch') for wall-mounted torches with proper facing direction.") When finished, say 'Task complete for lighting'.`
            },
            {
                id: `${taskId}_furnishings`,
                name: "furnishings",
                summary: "Furniture and decorations", 
                instruction: `Add furniture and decorations with repair: !repairAction("Room 1 (Living room) furniture: Place crafting_table at (${baseX + 2},${baseY + 1},${baseZ + 2}), furnace at (${baseX + 2},${baseY + 1},${baseZ + 3}), chest at (${baseX + 5},${baseY + 1},${baseZ + 2}), oak_stairs as chairs at (${baseX + 4},${baseY + 1},${baseZ + 6}), (${baseX + 3},${baseY + 1},${baseZ + 6}). Room 2 (Bedroom) furniture: Place red_bed at (${baseX + 10},${baseY + 1},${baseZ + 3}), chest at (${baseX + 13},${baseY + 1},${baseZ + 2}), bookshelf at (${baseX + 10},${baseY + 1},${baseZ + 8}), oak_stairs as desk chair at (${baseX + 12},${baseY + 1},${baseZ + 6}). Use specific furniture block names with await skills.placeBlock() for each furniture placement.") When finished, say 'Task complete for furnishings'.`
            }
        ];
        
        //  distribute work based on worker count for 2-room house
        if (workerCount === 1) {
            return [{
                id: `${taskId}_complete_2room_house`,
                summary: "Complete 2-room house with decorations",
                instruction: `Build complete 2-room house with repair: !repairAction("Step 1: Build foundation covering 16x11 area. For x from ${baseX} to ${baseX + 15} and z from ${baseZ} to ${baseZ + 10}, place stone at y=${baseY}. Step 2: Build exterior walls using oak_planks - North wall from x=${baseX} to x=${baseX + 15}, y=${baseY + 1} to y=${baseY + 3}, z=${baseZ}, skip 2-block door opening at (${baseX + 7},${baseY + 1},${baseZ}) and (${baseX + 7},${baseY + 2},${baseZ}). South wall from x=${baseX} to x=${baseX + 15}, y=${baseY + 1} to y=${baseY + 3}, z=${baseZ + 10}, skip windows at x=${baseX + 2}, x=${baseX + 8}, x=${baseX + 13}. East wall from z=${baseZ} to z=${baseZ + 10}, y=${baseY + 1} to y=${baseY + 3}, x=${baseX + 15}, skip window at z=${baseZ + 5}. West wall from z=${baseZ} to z=${baseZ + 10}, y=${baseY + 1} to y=${baseY + 3}, x=${baseX}, skip window at z=${baseZ + 5}. Step 3: Build room separator at x=${baseX + 7}, from z=${baseZ + 1} to z=${baseZ + 9}, y=${baseY + 1} to y=${baseY + 3} using oak_planks, skip 2-block door opening at (${baseX + 7},${baseY + 1},${baseZ + 5}) and (${baseX + 7},${baseY + 2},${baseZ + 5}). Step 4: Install doors and windows - main door at (${baseX + 7},${baseY + 1},${baseZ}), room door at (${baseX + 7},${baseY + 1},${baseZ + 5}), glass at windows (${baseX + 2},${baseY + 2},${baseZ + 10}), (${baseX + 8},${baseY + 2},${baseZ + 10}), (${baseX + 13},${baseY + 2},${baseZ + 10}), (${baseX + 15},${baseY + 2},${baseZ + 5}), (${baseX},${baseY + 2},${baseZ + 5}). Step 5: Build roof from x=${baseX} to x=${baseX + 15}, z=${baseZ} to z=${baseZ + 10} at y=${baseY + 4} using oak_planks. Step 6: Add wall lighting AWAY from windows - place wall-mounted torches: Room 1 torch on north wall at (${baseX + 3},${baseY + 2},${baseZ + 1}) facing south, Room 1 torch on east interior wall at (${baseX + 6},${baseY + 2},${baseZ + 3}) facing west, Room 2 torch on north wall at (${baseX + 9},${baseY + 2},${baseZ + 1}) facing south, Room 2 torch on west interior wall at (${baseX + 8},${baseY + 2},${baseZ + 7}) facing east, exterior torch at (${baseX + 6},${baseY + 3},${baseZ}) facing north. Step 7: Add furniture - Living room: crafting_table at (${baseX + 2},${baseY + 1},${baseZ + 2}), furnace at (${baseX + 2},${baseY + 1},${baseZ + 3}), chest at (${baseX + 5},${baseY + 1},${baseZ + 2}), oak_stairs chairs at (${baseX + 4},${baseY + 1},${baseZ + 6}), (${baseX + 3},${baseY + 1},${baseZ + 6}). Bedroom: red_bed at (${baseX + 10},${baseY + 1},${baseZ + 3}), chest at (${baseX + 13},${baseY + 1},${baseZ + 2}), bookshelf at (${baseX + 10},${baseY + 1},${baseZ + 8}), oak_stairs chair at (${baseX + 12},${baseY + 1},${baseZ + 6}). Use await skills.placeBlock(bot, 'stone') for foundation, await skills.placeBlock(bot, 'oak_planks') for walls/roof, await skills.placeBlock(bot, 'oak_door') for doors, await skills.placeBlock(bot, 'glass') for windows, await skills.placeBlock(bot, 'torch') for lighting, and specific furniture block names.") When complete, say 'Task complete for complete_2room_house'.`
            }];
            } else if (workerCount === 2) {
            return [
                {
                    id: `${taskId}_foundation_north_south`,
                    summary: "Foundation + North & South walls (balanced workload)",
                    instruction: `Build foundation and major walls with repair: !repairAction("Step 1: Build complete 16x11 foundation by placing stone blocks from x=${baseX} to x=${baseX + 15}, z=${baseZ} to z=${baseZ + 10} at y=${baseY}. Step 2: Build North wall (front) from x=${baseX} to x=${baseX + 15}, y=${baseY + 1} to y=${baseY + 3}, z=${baseZ} using oak_planks, skip 2-block door openings - Room 1: skip (${baseX + 4},${baseY + 1},${baseZ}) and (${baseX + 4},${baseY + 2},${baseZ}), Room 2: skip (${baseX + 11},${baseY + 1},${baseZ}) and (${baseX + 11},${baseY + 2},${baseZ}). Step 3: Build South wall (back) from x=${baseX} to x=${baseX + 15}, y=${baseY + 1} to y=${baseY + 3}, z=${baseZ + 10} using oak_planks, skip single-block window openings at x=${baseX + 2} y=${baseY + 2}, x=${baseX + 8} y=${baseY + 2}, x=${baseX + 13} y=${baseY + 2}. Use await skills.placeBlock(bot, 'stone') for foundation and await skills.placeBlock(bot, 'oak_planks') for walls.") When complete, say 'Task complete for foundation_north_south'.`
                },
                {
                    id: `${taskId}_remaining_walls_roof_decorations`,
                    summary: "Side walls + Interior + Roof + All decorations (balanced workload)",
                    instruction: `Complete house structure and decorations with repair: !repairAction("Step 1: Build East wall from z=${baseZ} to z=${baseZ + 10}, y=${baseY + 1} to y=${baseY + 3}, x=${baseX + 15} using oak_planks, skip single-block window opening at z=${baseZ + 5} y=${baseY + 2}. Build West wall from z=${baseZ} to z=${baseZ + 10}, y=${baseY + 1} to y=${baseY + 3}, x=${baseX} using oak_planks, skip single-block window opening at z=${baseZ + 5} y=${baseY + 2}. Step 2: Build interior wall separator at x=${baseX + 7}, from z=${baseZ + 1} to z=${baseZ + 9}, y=${baseY + 1} to y=${baseY + 3} using oak_planks, skip 2-block interior door opening - skip (${baseX + 7},${baseY + 1},${baseZ + 5}) and (${baseX + 7},${baseY + 2},${baseZ + 5}). Step 3: Build complete roof from x=${baseX} to x=${baseX + 15}, z=${baseZ} to z=${baseZ + 10} at y=${baseY + 4} using oak_planks. Step 4: Install exterior doors - Room 1 door at (${baseX + 4},${baseY + 1},${baseZ}), Room 2 door at (${baseX + 11},${baseY + 1},${baseZ}), interior connecting door at (${baseX + 7},${baseY + 1},${baseZ + 5}). Step 5: Install all window glass - South wall: (${baseX + 2},${baseY + 2},${baseZ + 10}), (${baseX + 8},${baseY + 2},${baseZ + 10}), (${baseX + 13},${baseY + 2},${baseZ + 10}). Side walls: (${baseX + 15},${baseY + 2},${baseZ + 5}), (${baseX},${baseY + 2},${baseZ + 5}). Step 6: Add all wall torches AWAY from windows - Room 1: North wall torch at (${baseX + 3},${baseY + 2},${baseZ + 1}), East interior wall torch at (${baseX + 6},${baseY + 2},${baseZ + 3}). Room 2: North wall torch at (${baseX + 9},${baseY + 2},${baseZ + 1}), West interior wall torch at (${baseX + 8},${baseY + 2},${baseZ + 7}). Exterior: (${baseX + 6},${baseY + 3},${baseZ}). Step 7: Add all furniture with specific coordinates - Living room: crafting_table at (${baseX + 2},${baseY + 1},${baseZ + 2}), furnace at (${baseX + 2},${baseY + 1},${baseZ + 3}), chest at (${baseX + 5},${baseY + 1},${baseZ + 2}), oak_stairs chairs at (${baseX + 4},${baseY + 1},${baseZ + 6}) and (${baseX + 3},${baseY + 1},${baseZ + 6}). Bedroom: red_bed at (${baseX + 10},${baseY + 1},${baseZ + 3}), chest at (${baseX + 13},${baseY + 1},${baseZ + 2}), bookshelf at (${baseX + 10},${baseY + 1},${baseZ + 8}), oak_stairs chair at (${baseX + 12},${baseY + 1},${baseZ + 6}). IMPORTANT: Enter rooms using doors only - DO NOT break wall blocks for access. Use await skills.placeBlock(bot, 'oak_planks') for walls/roof, await skills.placeBlock(bot, 'oak_door') for doors, await skills.placeBlock(bot, 'glass') for windows, await skills.placeBlock(bot, 'torch') for lighting.") When complete, say 'Task complete for remaining_walls_roof_decorations'.`
                }
            ];
            } else if (workerCount === 3) {
            return [
                {
                    id: `${taskId}_foundation_north_wall`,
                    summary: "Foundation + North wall (balanced workload)",
                    instruction: `Build foundation and north wall with repair: !repairAction("Step 1: Build complete 16x11 foundation by placing stone blocks from x=${baseX} to x=${baseX + 15}, z=${baseZ} to z=${baseZ + 10} at y=${baseY}. Step 2: Build North wall (front) from x=${baseX} to x=${baseX + 15}, y=${baseY + 1} to y=${baseY + 3}, z=${baseZ} using oak_planks, skip 2-block door openings - Room 1: skip (${baseX + 4},${baseY + 1},${baseZ}) and (${baseX + 4},${baseY + 2},${baseZ}), Room 2: skip (${baseX + 11},${baseY + 1},${baseZ}) and (${baseX + 11},${baseY + 2},${baseZ}). Use await skills.placeBlock(bot, 'stone') for foundation and await skills.placeBlock(bot, 'oak_planks') for walls.") When complete, say 'Task complete for foundation_north_wall'.`
                },
                {
                    id: `${taskId}_south_east_west_walls`,
                    summary: "South + East + West walls (balanced workload)",
                    instruction: `Build remaining exterior walls with repair: !repairAction("Step 1: Build South wall (back) from x=${baseX} to x=${baseX + 15}, y=${baseY + 1} to y=${baseY + 3}, z=${baseZ + 10} using oak_planks, skip single-block window openings at x=${baseX + 2} y=${baseY + 2}, x=${baseX + 8} y=${baseY + 2}, x=${baseX + 13} y=${baseY + 2}. Step 2: Build East wall from z=${baseZ} to z=${baseZ + 10}, y=${baseY + 1} to y=${baseY + 3}, x=${baseX + 15} using oak_planks, skip single-block window opening at z=${baseZ + 5} y=${baseY + 2}. Step 3: Build West wall from z=${baseZ} to z=${baseZ + 10}, y=${baseY + 1} to y=${baseY + 3}, x=${baseX} using oak_planks, skip single-block window opening at z=${baseZ + 5} y=${baseY + 2}. Use await skills.placeBlock(bot, 'oak_planks') for all walls.") When complete, say 'Task complete for south_east_west_walls'.`
                },
                {
                    id: `${taskId}_interior_roof_decorations`,
                    summary: "Interior + Roof + Doors + Windows + Decorations (balanced workload)",
                    instruction: `Complete interior and all decorations with repair: !repairAction("Step 1: Build interior wall separator at x=${baseX + 7}, from z=${baseZ + 1} to z=${baseZ + 9}, y=${baseY + 1} to y=${baseY + 3} using oak_planks, skip 2-block interior door opening - skip (${baseX + 7},${baseY + 1},${baseZ + 5}) and (${baseX + 7},${baseY + 2},${baseZ + 5}). Step 2: Build complete roof from x=${baseX} to x=${baseX + 15}, z=${baseZ} to z=${baseZ + 10} at y=${baseY + 4} using oak_planks. Step 3: Install exterior doors - Room 1 door at (${baseX + 4},${baseY + 1},${baseZ}), Room 2 door at (${baseX + 11},${baseY + 1},${baseZ}), interior connecting door at (${baseX + 7},${baseY + 1},${baseZ + 5}). Step 4: Install all window glass - South wall: (${baseX + 2},${baseY + 2},${baseZ + 10}), (${baseX + 8},${baseY + 2},${baseZ + 10}), (${baseX + 13},${baseY + 2},${baseZ + 10}). Side walls: (${baseX + 15},${baseY + 2},${baseZ + 5}), (${baseX},${baseY + 2},${baseZ + 5}). Step 5: Install wall torches AWAY from windows - Room 1: North wall torch at (${baseX + 3},${baseY + 2},${baseZ + 1}), East interior wall torch at (${baseX + 6},${baseY + 2},${baseZ + 3}). Room 2: North wall torch at (${baseX + 9},${baseY + 2},${baseZ + 1}), West interior wall torch at (${baseX + 8},${baseY + 2},${baseZ + 7}). Exterior: (${baseX + 6},${baseY + 3},${baseZ}). Step 6: ENTER ROOMS USING DOORS ONLY - Use Room 1 door at (${baseX + 4},${baseY + 1},${baseZ}) to enter living room, use interior door at (${baseX + 7},${baseY + 1},${baseZ + 5}) to move between rooms, use Room 2 door at (${baseX + 11},${baseY + 1},${baseZ}) to enter bedroom. NEVER break wall blocks for access. Add furniture with specific coordinates - Living room: crafting_table at (${baseX + 2},${baseY + 1},${baseZ + 2}), furnace at (${baseX + 2},${baseY + 1},${baseZ + 3}), chest at (${baseX + 5},${baseY + 1},${baseZ + 2}), oak_stairs chairs at (${baseX + 4},${baseY + 1},${baseZ + 6}) and (${baseX + 3},${baseY + 1},${baseZ + 6}). Bedroom: red_bed at (${baseX + 10},${baseY + 1},${baseZ + 3}), chest at (${baseX + 13},${baseY + 1},${baseZ + 2}), bookshelf at (${baseX + 10},${baseY + 1},${baseZ + 8}), oak_stairs chair at (${baseX + 12},${baseY + 1},${baseZ + 6}). Use await skills.placeBlock(bot, 'oak_planks') for walls/roof, await skills.placeBlock(bot, 'oak_door') for doors, await skills.placeBlock(bot, 'glass') for windows, await skills.placeBlock(bot, 'torch') for lighting.") When complete, say 'Task complete for interior_roof_decorations'.`
                }
            ];
        } else if (workerCount === 4) {
            return [
                {
                    id: `${taskId}_foundation_only`,
                    summary: "Foundation only (balanced workload)",
                    instruction: `Build foundation with repair: !repairAction("Build complete 16x11 foundation by placing stone blocks from x=${baseX} to x=${baseX + 15}, z=${baseZ} to z=${baseZ + 10} at y=${baseY}. This creates a solid 176-block foundation for our 2-room house. Use await skills.placeBlock(bot, 'stone') for each block placement.") When complete, say 'Task complete for foundation_only'.`
                },
                {
                    id: `${taskId}_north_south_walls`,
                    summary: "North & South walls (balanced workload)",
                    instruction: `Build north and south walls with repair: !repairAction("Step 1: Build North wall (front) from x=${baseX} to x=${baseX + 15}, y=${baseY + 1} to y=${baseY + 3}, z=${baseZ} using oak_planks, skip 2-block door openings - Room 1: skip (${baseX + 4},${baseY + 1},${baseZ}) and (${baseX + 4},${baseY + 2},${baseZ}), Room 2: skip (${baseX + 11},${baseY + 1},${baseZ}) and (${baseX + 11},${baseY + 2},${baseZ}). Step 2: Build South wall (back) from x=${baseX} to x=${baseX + 15}, y=${baseY + 1} to y=${baseY + 3}, z=${baseZ + 10} using oak_planks, skip single-block window openings at x=${baseX + 2} y=${baseY + 2}, x=${baseX + 8} y=${baseY + 2}, x=${baseX + 13} y=${baseY + 2}. Use await skills.placeBlock(bot, 'oak_planks') for all walls.") When complete, say 'Task complete for north_south_walls'.`
                },
                {
                    id: `${taskId}_east_west_interior`,
                    summary: "East & West walls + Interior wall (balanced workload)",
                    instruction: `Build side walls and interior with repair: !repairAction("Step 1: Build East wall from z=${baseZ} to z=${baseZ + 10}, y=${baseY + 1} to y=${baseY + 3}, x=${baseX + 15} using oak_planks, skip single-block window opening at z=${baseZ + 5} y=${baseY + 2}. Step 2: Build West wall from z=${baseZ} to z=${baseZ + 10}, y=${baseY + 1} to y=${baseY + 3}, x=${baseX} using oak_planks, skip single-block window opening at z=${baseZ + 5} y=${baseY + 2}. Step 3: Build interior wall separator at x=${baseX + 7}, from z=${baseZ + 1} to z=${baseZ + 9}, y=${baseY + 1} to y=${baseY + 3} using oak_planks, skip door opening at z=${baseZ + 5}. Use await skills.placeBlock(bot, 'oak_planks') for all walls.") When complete, say 'Task complete for east_west_interior'.`
                },
                {
                    id: `${taskId}_roof_doors_windows_decorations`,
                    summary: "Roof + Doors + Windows + All decorations (balanced workload)",
                    instruction: `Complete roof and all finishing work with repair: !repairAction("Step 1: Build complete roof from x=${baseX} to x=${baseX + 15}, z=${baseZ} to z=${baseZ + 10} at y=${baseY + 4} using oak_planks. Step 2: Install exterior doors - Room 1 door at (${baseX + 4},${baseY + 1},${baseZ}), Room 2 door at (${baseX + 11},${baseY + 1},${baseZ}), interior connecting door at (${baseX + 7},${baseY + 1},${baseZ + 5}). Step 3: Install all window glass - South wall: (${baseX + 2},${baseY + 2},${baseZ + 10}), (${baseX + 8},${baseY + 2},${baseZ + 10}), (${baseX + 13},${baseY + 2},${baseZ + 10}). Side walls: (${baseX + 15},${baseY + 2},${baseZ + 5}), (${baseX},${baseY + 2},${baseZ + 5}). Step 4: Install wall torches AWAY from windows - Room 1: North wall torch at (${baseX + 3},${baseY + 2},${baseZ + 1}), East interior wall torch at (${baseX + 6},${baseY + 2},${baseZ + 3}). Room 2: North wall torch at (${baseX + 9},${baseY + 2},${baseZ + 1}), West interior wall torch at (${baseX + 8},${baseY + 2},${baseZ + 7}). Exterior: (${baseX + 6},${baseY + 3},${baseZ}). Step 5: Add all furniture with specific coordinates - Living room: crafting_table at (${baseX + 2},${baseY + 1},${baseZ + 2}), furnace at (${baseX + 2},${baseY + 1},${baseZ + 3}), chest at (${baseX + 5},${baseY + 1},${baseZ + 2}), oak_stairs chairs at (${baseX + 4},${baseY + 1},${baseZ + 6}) and (${baseX + 3},${baseY + 1},${baseZ + 6}). Bedroom: red_bed at (${baseX + 10},${baseY + 1},${baseZ + 3}), chest at (${baseX + 13},${baseY + 1},${baseZ + 2}), bookshelf at (${baseX + 10},${baseY + 1},${baseZ + 8}), oak_stairs chair at (${baseX + 12},${baseY + 1},${baseZ + 6}). IMPORTANT: Enter rooms using doors only - DO NOT break wall blocks for access. Use await skills.placeBlock(bot, 'oak_planks') for roof, await skills.placeBlock(bot, 'oak_door') for doors, await skills.placeBlock(bot, 'glass') for windows, await skills.placeBlock(bot, 'torch') for lighting.") When complete, say 'Task complete for roof_doors_windows_decorations'.`
                }
            ];
        } else if (workerCount === 5) {
            return [
                allComponents[0], // Foundation
                allComponents[1], // Exterior walls
                allComponents[2], // Room separator
                allComponents[3], // Doors and windows
                allComponents[4]  // Roof
            ];
        } else if (workerCount === 6) {
            return [
                allComponents[0], // Foundation
                allComponents[1], // Exterior walls
                allComponents[2], // Room separator
                allComponents[3], // Doors and windows
                allComponents[4], // Roof
                allComponents[5]  // Lighting
            ];
        } else { // 7 or more workers - use all components for fully specialized 2-room house
            return allComponents; // Return all specialized tasks
        }
    }

     // Create building plan for different structure types

    async _createBuildingPlan(structureType, position, workerCount, dimensions = null, material = 'cobblestone') {
        const baseX = Math.floor(position.x + 5);
        const baseY = Math.floor(position.y);
        const baseZ = Math.floor(position.z);
        
        const plans = {
            house: {
                description: `Building a 2-room ${structureType} with ${workerCount} workers at (${baseX},${baseY},${baseZ})`,
                area: { start: { x: baseX, y: baseY, z: baseZ }, end: { x: baseX + 15, y: baseY + 4, z: baseZ + 10 } },
                tasks: this._createHouseTasks(baseX, baseY, baseZ, workerCount)
            },
            wall: {
                description: `Building a ${structureType} with ${workerCount} workers at (${baseX},${baseY},${baseZ})`,
                area: { start: { x: baseX, y: baseY, z: baseZ }, end: { x: baseX + 20, y: baseY + 4, z: baseZ } },
                tasks: this._createWallTasks(baseX, baseY, baseZ, workerCount, dimensions, material)
            },
            tower: {
                description: `Building a wider ${structureType} at (${baseX},${baseY},${baseZ})`,
                area: { start: { x: baseX, y: baseY, z: baseZ }, end: { x: baseX + 7, y: baseY + 16, z: baseZ + 7 } },
                tasks: [
                    {
                        summary: "Tower foundation and base layers", 
                        instruction: `Build tower foundation and base with repair: !repairAction("Step 1: Build foundation by placing stone blocks from x=${baseX} to x=${baseX + 7}, z=${baseZ} to z=${baseZ + 7} at y=${baseY}. Step 2: Build solid base walls from y=${baseY + 1} to y=${baseY + 4} - make exterior walls with stone, leave interior 6x6 area hollow for rooms. Step 3: Build floor at y=${baseY + 4} with stone. Add ladder access: place ladder at (${baseX + 3},${baseY + 1},${baseZ}) up to y=${baseY + 4}. Use await skills.placeBlock() for each placement.") When complete, say 'Task complete for tower foundation and base'.`
                    },
                    {
                        summary: "Tower middle section with rooms", 
                        instruction: `Build tower middle section with repair: !repairAction("Step 1: Build walls from y=${baseY + 5} to y=${baseY + 10} - stone exterior walls, hollow 6x6 interior. Step 2: Add windows at y=${baseY + 6} and y=${baseY + 9}: place glass blocks at (${baseX},${baseY + 6},${baseZ + 3}), (${baseX + 7},${baseY + 6},${baseZ + 3}), (${baseX + 3},${baseY + 6},${baseZ}), (${baseX + 3},${baseY + 6},${baseZ + 7}). Step 3: Build floor at y=${baseY + 10} with stone. Step 4: Continue ladder from y=${baseY + 5} to y=${baseY + 10}. Use await skills.placeBlock() for each placement.") When complete, say 'Task complete for tower middle section'.`
                    },
                    {
                        summary: "Tower top section and battlements", 
                        instruction: `Build tower top with repair: !repairAction("Step 1: Build walls from y=${baseY + 11} to y=${baseY + 15} - stone exterior walls, hollow interior. Step 2: Add more windows at y=${baseY + 13}: place glass at (${baseX + 1},${baseY + 13},${baseZ}), (${baseX + 5},${baseY + 13},${baseZ}), (${baseX},${baseY + 13},${baseZ + 1}), (${baseX},${baseY + 13},${baseZ + 5}), (${baseX + 7},${baseY + 13},${baseZ + 1}), (${baseX + 7},${baseY + 13},${baseZ + 5}), (${baseX + 1},${baseY + 13},${baseZ + 7}), (${baseX + 5},${baseY + 13},${baseZ + 7}). Step 3: Build battlements at y=${baseY + 16} - place stone blocks every other position around perimeter for crenellations. Step 4: Complete ladder to top. Step 5: Place torches for lighting inside at y=${baseY + 6}, y=${baseY + 11}, y=${baseY + 15}. Use await skills.placeBlock() for each placement.") When complete, say 'Task complete for tower top and battlements'.`
                    }
                ]
            },
            bridge: {
                description: `Building a sturdy ${structureType} at (${baseX},${baseY},${baseZ})`,
                area: { start: { x: baseX, y: baseY, z: baseZ }, end: { x: baseX + 20, y: baseY + 5, z: baseZ + 5 } },
                tasks: [
                    {
                        summary: "Bridge foundation and support pillars", 
                        instruction: `Build bridge foundation with repair: !repairAction("Step 1: Build foundation pillars - place stone blocks from y=${baseY - 2} to y=${baseY + 2} at positions (${baseX},${baseY},${baseZ}), (${baseX},${baseY},${baseZ + 5}), (${baseX + 10},${baseY},${baseZ}), (${baseX + 10},${baseY},${baseZ + 5}), (${baseX + 20},${baseY},${baseZ}), (${baseX + 20},${baseY},${baseZ + 5}). Step 2: Create 3x3 pillar bases for stability. Use await skills.placeBlock() for each block.") When complete, say 'Task complete for bridge foundation'.`
                    },
                    {
                        summary: "Bridge deck and railings", 
                        instruction: `Build bridge deck with repair: !repairAction("Step 1: Build bridge deck from x=${baseX} to x=${baseX + 20}, z=${baseZ} to z=${baseZ + 5} at y=${baseY + 3} using oak_planks. Step 2: Add safety railings - place oak_fence from x=${baseX} to x=${baseX + 20} at y=${baseY + 4} and y=${baseY + 5} along z=${baseZ} and z=${baseZ + 5} edges. Step 3: Add torches every 5 blocks along the railings for lighting. Step 4: Place pressure plates at both bridge entrances for activation. Use await skills.placeBlock() for each placement.") When complete, say 'Task complete for bridge deck and railings'.`
                    },
                    {
                        summary: "Bridge arch supports and decorations", 
                        instruction: `Add bridge supports with repair: !repairAction("Step 1: Build arch supports under the bridge using stone_stairs from y=${baseY + 1} to y=${baseY + 2} at x=${baseX + 5}, x=${baseX + 10}, x=${baseX + 15}. Step 2: Add decorative stone brick accents on the pillars. Step 3: Place additional torches under bridge for better lighting. Step 4: Add signs at bridge entrance with bridge name or directions. Use await skills.placeBlock() for each placement.") When complete, say 'Task complete for bridge supports and decorations'.`
                    }
                ]
            },
            castle: {
                description: `Building a ${structureType} at (${baseX},${baseY},${baseZ})`,
                area: { start: { x: baseX, y: baseY, z: baseZ }, end: { x: baseX + 25, y: baseY + 12, z: baseZ + 25 } },
                tasks: [
                    {
                        summary: "Castle outer walls and foundation", 
                        instruction: `Build castle foundation with repair: !repairAction("Step 1: Build foundation from x=${baseX} to x=${baseX + 25}, z=${baseZ} to z=${baseZ + 25} at y=${baseY} using stone. Step 2: Build outer walls - place stone blocks from y=${baseY + 1} to y=${baseY + 8} around perimeter, leave spaces for gatehouse at x=${baseX + 12} to x=${baseX + 13}, z=${baseZ}. Step 3: Build corner towers - 5x5 towers at corners from y=${baseY + 1} to y=${baseY + 12}. Use await skills.placeBlock() for each block.") When complete, say 'Task complete for castle foundation and walls'.`
                    },
                    {
                        summary: "Castle gatehouse and interior", 
                        instruction: `Build castle interior with repair: !repairAction("Step 1: Build gatehouse - create 4x4 entrance structure at front with portcullis opening. Step 2: Build keep (central tower) - 7x7 structure in center from y=${baseY + 1} to y=${baseY + 15}. Step 3: Add courtyard features - well at center, barracks buildings, stables along walls. Step 4: Install iron_door for gatehouse with redstone mechanism. Use await skills.placeBlock() for each placement.") When complete, say 'Task complete for castle gatehouse and interior'.`
                    },
                    {
                        summary: "Castle battlements and decorations", 
                        instruction: `Complete castle with repair: !repairAction("Step 1: Add battlements (crenellations) to all walls and towers at top levels. Step 2: Install arrow slits (windows) in walls at strategic points. Step 3: Add lighting - torches on walls, glowstone in towers. Step 4: Build drawbridge mechanism with redstone. Step 5: Add banners and decorative elements. Step 6: Place chests in towers for storage, beds in keep for garrison. Use await skills.placeBlock() for each placement.") When complete, say 'Task complete for castle battlements and decorations'.`
                    }
                ]
            }
        };
        
        let plan = plans[structureType] || plans.house; // Default to house if unknown structure
        
        // For wall, create dynamic sections based on worker count and use actual dimensions
        if (structureType === 'wall') {
            const wallLength = dimensions && dimensions.length ? dimensions.length : 20;
            const wallHeight = dimensions && dimensions.height ? dimensions.height : 4;
            const wallMaterial = material || 'cobblestone';
            
            // Update plan description and area with actual dimensions
            plan.description = `Building a ${wallLength}-block long, ${wallHeight}-block high ${structureType} with ${workerCount} workers at (${baseX},${baseY},${baseZ}) using ${wallMaterial}`;
            plan.area = { start: { x: baseX, y: baseY, z: baseZ }, end: { x: baseX + wallLength - 1, y: baseY + wallHeight - 1, z: baseZ } };
            
            const sectionsPerWorker = Math.ceil(wallLength / workerCount);
            plan.tasks = [];
            
            for (let i = 0; i < workerCount; i++) {
                const sectionStartX = baseX + (i * sectionsPerWorker);
                const sectionEndX = Math.min(baseX + ((i + 1) * sectionsPerWorker) - 1, baseX + wallLength - 1);
                
                plan.tasks.push({
                    summary: `Wall section ${i + 1} (x=${sectionStartX} to x=${sectionEndX})`,
                    instruction: `Build wall section from (${sectionStartX},${baseY},${baseZ}) to (${sectionEndX},${baseY + wallHeight - 1},${baseZ}) using ${wallMaterial}. Build foundation first if needed. Work with the team!`
                });
            }
        }
        
        // Limit tasks to available workers
        plan.tasks = plan.tasks.slice(0, workerCount);
        
        return plan;
    }


     //Inspect collaborative build and coordinate repairs

    async _inspectCollaborativeBuild(buildPlan) {
        try {
            const { start, end } = buildPlan.area;
            
            this.openChat(`Inspecting build area from (${start.x},${start.y},${start.z}) to (${end.x},${end.y},${end.z})`);
            
            // Simple inspection - check if basic blocks are placed
            let missingCount = 0;
            const samplePositions = [
                { x: start.x, y: start.y, z: start.z },
                { x: Math.floor((start.x + end.x) / 2), y: start.y, z: start.z },
                { x: end.x, y: start.y, z: start.z },
                { x: start.x, y: start.y + 1, z: start.z },
                { x: end.x, y: start.y + 1, z: start.z }
            ];
            
            for (const pos of samplePositions) {
                try {
                    const checkResult = await executeCommand(this, `!getBlockAtPosition(${pos.x}, ${pos.y}, ${pos.z})`);
                    if (checkResult && (checkResult.includes('air') || checkResult.includes('nothing'))) {
                        missingCount++;
                    }
                } catch (error) {
                    // Skip errors in block checking
                }
            }
            
            if (missingCount === 0) {
                this.openChat(`Build inspection complete! Structure looks good. Great teamwork!`);
            } else {
                this.openChat(`Build inspection found some gaps. ${missingCount}/${samplePositions.length} sample positions need attention.`);
                
                // Get a worker for repairs if available
                try {
                    const status = await this.sendCollaborativeCommand('getStatus');
                    if (status.totalWorkers > 0) {
                        const repairWorker = status.workers[0];
                        const repairTask = `REPAIR TASK: Check and fix any missing blocks in the build area from (${start.x},${start.y},${start.z}) to (${end.x},${end.y},${end.z}). Fill any gaps with appropriate materials.`;
                        
                        await this.sendCollaborativeCommand('sendMessageToWorker', {
                            workerName: repairWorker.name,
                            message: repairTask
                        });
                        
                        this.openChat(`${repairWorker.name} assigned to repair any remaining gaps.`);
                    }
                } catch (error) {
                    console.error('Error assigning repairs:', error);
                }
            }
            
        } catch (error) {
            console.error('Error during build inspection:', error);
            this.openChat(`Error during inspection: ${error.message}`);
        }
    }

     // Check if worker is actively building

    isActivelyBuilding() {
        if (!this.name || !this.name.startsWith('Worker')) return false;
        
        // Check if worker has received a task in the last 5 minutes
        const taskStart = this.history?.memory?.taskStart;
        if (taskStart) {
            const timeSinceTask = Date.now() - taskStart;
            return timeSinceTask < 300000; // 5 minutes
        }
        return false;
    }

     // Check if message is a task-related message

    isTaskMessage(message) {
        if (!message) return false;
        
        const taskKeywords = [
            'build', 'construct', 'place', 'task', 'foundation', 'wall', 'roof', 
            'door', 'window', 'torch', 'glass', 'complete', 'repair', 'goToCoordinates'
        ];
        
        const messageText = message.toLowerCase();
        return taskKeywords.some(keyword => messageText.includes(keyword)) || 
               message.startsWith('!') ||
               messageText.includes('work with the team') ||
               messageText.includes('when complete');
    }

     // Monitor task completion and trigger inspection when done

    async _monitorTaskCompletion(workerNames, buildPlan) {
        const completedWorkers = new Set();
        const maxWaitTime = 300000;
        const startTime = Date.now();
        
        const checkCompletion = async () => {
            // Check for completion messages in worker histories or collaborative manager
            try {
                const status = await this.sendCollaborativeCommand('getStatus');
                
                // Check if any workers reported completion
                for (const workerName of workerNames) {
                    if (!completedWorkers.has(workerName)) {
                        // Check if worker reported completion
                        const isComplete = await this._checkWorkerTaskCompletion(workerName);
                        if (isComplete) {
                            completedWorkers.add(workerName);
                            this.openChat(`${workerName} completed their task!`);
                        }
                    }
                }
                
                // If all workers completed or timeout reached
                if (completedWorkers.size >= workerNames.length || (Date.now() - startTime) > maxWaitTime) {
                    if (completedWorkers.size >= workerNames.length) {
                        this.openChat(`All ${workerNames.length} workers completed their tasks! Starting quality inspection...`);
                    } else {
                        this.openChat(`Time limit reached. Starting quality inspection with ${completedWorkers.size}/${workerNames.length} workers completed...`);
                    }
                    
                    try {
                        await this._inspectCollaborativeBuild(buildPlan);
                    } catch (error) {
                        console.error('Error during collaborative build inspection:', error);
                    }
                } else {
                    // Check again in 10 seconds
                    setTimeout(checkCompletion, 10000);
                }
            } catch (error) {
                console.error('Error monitoring task completion:', error);
                setTimeout(checkCompletion, 10000); // Retry on error
            }
        };
        
        // Start monitoring after initial delay
        setTimeout(checkCompletion, 30000); // Start checking after 30 seconds
    }


     // Check if a specific worker has completed their task

    async _checkWorkerTaskCompletion(workerName) {
        try {
            // Check worker's recent message history for completion indicators
            const controlPanel = this.kodecraftManager?.controlPanel;
            if (!controlPanel?.agentConnections?.[workerName]?.agent) {
                return false;
            }
            
            const worker = controlPanel.agentConnections[workerName].agent;
            const recentMessages = worker.history?.memory?.turns?.slice(-5) || []; // Last 5 messages
            
            // Look for completion indicators in recent messages
            for (const turn of recentMessages) {
                if (turn.role === 'assistant' && turn.content) {
                    const content = turn.content.toLowerCase();
                    if (content.includes('task complete') || 
                        content.includes('finished') || 
                        content.includes('construction complete') ||
                        content.includes('build complete')) {
                        return true;
                    }
                }
            }
            
            return false;
        } catch (error) {
            console.error(`Error checking completion for ${workerName}:`, error);
            return false;
        }
    }
}
