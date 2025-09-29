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
                else { // only output command name
                    // let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                    // let chat_message = `*used ${command_name.substring(1)}*`;
                    // if (pre_message.length > 0)
                    //     chat_message = `${pre_message}  ${chat_message}`;
                    // this.routeResponse(source, chat_message);

                    // No command verbage at all, please 
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
            // this is for when the agent is prompted by system while still in conversation
            // so it can respond to events like death but be routed back to the last sender
            to_player = this.last_sender;
        }

        if (convoManager.isOtherAgent(to_player) && convoManager.inConversation(to_player)) {
            // if we're in an ongoing conversation with the other bot, send the response to it
            convoManager.sendToBot(to_player, message);
        }
        else {
            // otherwise, use open chat
            this.openChat(message);
            // note that to_player could be another bot, but if we get here the conversation has ended
        }
    }

    async openChat(message) {
        let to_translate = message;
        let remaining = '';
        let command_name = containsCommand(message);
        let translate_up_to = command_name ? message.indexOf(command_name) : -1;
        if (translate_up_to != -1) { // don't translate the command
            to_translate = to_translate.substring(0, translate_up_to);
            remaining = message.substring(translate_up_to);
        }
        message = (await handleTranslation(to_translate)).trim() + " " + remaining;
        // newlines are interpreted as separate chats, which triggers spam filters. replace them with spaces
        message = message.replaceAll('\n', ' ');

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
                    this.routeResponse(source, `✅ Wall inspection complete! All blocks are properly placed. Great work team!`);
                } else {
                    this.routeResponse(source, `⚠️ Wall inspection found ${missingBlocks.length} missing blocks. Assigning repairs...`);
                    
                    // Get available workers for repairs
                    const status = await this.sendCollaborativeCommand('getStatus');
                    if (status.totalWorkers > 0) {
                        const repairWorker = status.workers[0]; // Use first available worker
                        
                        // Create repair task for missing blocks
                        const repairBlocks = missingBlocks.slice(0, 10); // Limit to 10 blocks at a time
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
🤖 Kid Leadership Commands - I coordinate my worker team:
• /spawn <count> - I'll spawn worker bots (1-10) near me
• /workers - Check status of my worker team
• /bringworkers - I'll teleport all workers to my location
• /testwall - I'll coordinate a test wall with auto-inspection
• /wall <x1> <y1> <z1> <x2> <y2> <z2> [material] - I'll coordinate wall building
• /inspect <x1> <y1> <z1> <x2> <y2> <z2> [material] - I'll inspect wall quality
• /repair <x1> <y1> <z1> <x2> <y2> <z2> [material] - I'll send worker to fix area
• /stopworkers - I'll stop all my workers
• /collab or /help - Show this help

🏗️ How I work as team leader:
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
                    
                    // Use improved build task with foundation-first logic
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
    
    /**
     * Get the collaborative manager from the MindServer
     * @returns {Promise<boolean>} Success status
     */
    async getCollaborativeManager() {
        // Since the agent runs in a separate process, we need to communicate
        // with the main process through the MindServer proxy
        return serverProxy && serverProxy.connected;
    }

    /**
     * Send collaborative command to the main process
     * @param {string} command - Command type
     * @param {Object} data - Command data
     * @returns {Promise<Object>} Response from main process
     */
    async sendCollaborativeCommand(command, data = {}) {
        if (!serverProxy || !serverProxy.connected) {
            throw new Error('Not connected to MindServer');
        }

        return new Promise((resolve, reject) => {
            const requestId = `collab_${Date.now()}_${Math.random()}`;
            
            // Set up one-time listener for response
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
                // await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 second for save to complete
                console.log('Task finished:', res.message);
                this.killAll();
            }
        }
    }

    killAll() {
        serverProxy.shutdown();
    }

    /**
     * Create wall tasks dynamically based on worker count
     * @param {number} baseX - Base X coordinate
     * @param {number} baseY - Base Y coordinate  
     * @param {number} baseZ - Base Z coordinate
     * @param {number} workerCount - Number of workers
     * @returns {Array} Array of wall building tasks
     */
    _createWallTasks(baseX, baseY, baseZ, workerCount) {
        const wallLength = 20;
        const sectionLength = Math.ceil(wallLength / workerCount);
        const tasks = [];
        
        for (let i = 0; i < workerCount; i++) {
            const startX = baseX + (i * sectionLength);
            const endX = Math.min(baseX + ((i + 1) * sectionLength) - 1, baseX + wallLength - 1);
            
            tasks.push({
                summary: `Wall section ${i + 1}`,
                instruction: `Build wall section from (${startX},${baseY},${baseZ}) to (${endX},${baseY + 4},${baseZ}) using cobblestone. Build foundation first if needed. Work with the team!`
            });
        }
        
        return tasks;
    }

    /**
     * Create house tasks dynamically based on worker count
     * @param {number} baseX - Base X coordinate
     * @param {number} baseY - Base Y coordinate  
     * @param {number} baseZ - Base Z coordinate
     * @param {number} workerCount - Number of workers
     * @returns {Array} Array of house building tasks
     */
    _createHouseTasks(baseX, baseY, baseZ, workerCount) {
        // Define all components needed for a complete house
        const allComponents = [
            {
                name: "foundation",
                summary: "Foundation construction", 
                instruction: `Build foundation: Place stone blocks for the entire floor area from (${baseX},${baseY},${baseZ}) to (${baseX + 10},${baseY},${baseZ + 10}). This is the foundation layer. Place support blocks below if needed. Work with the team!`
            },
            {
                name: "north_wall",
                summary: "North wall", 
                instruction: `Build North wall: Build wall from (${baseX},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ}) using oak_planks. Leave 2-block door opening at (${baseX + 5},${baseY + 1},${baseZ}) and (${baseX + 5},${baseY + 2},${baseZ}) - do NOT place blocks there. Build foundation blocks below if needed. Work with the team!`
            },
            {
                name: "south_wall",
                summary: "South wall", 
                instruction: `Build South wall: Build wall from (${baseX},${baseY + 1},${baseZ + 10}) to (${baseX + 10},${baseY + 4},${baseZ + 10}) using oak_planks. Build foundation blocks below if needed. Work with the team!`
            },
            {
                name: "east_wall",
                summary: "East wall", 
                instruction: `Build East wall: Build wall from (${baseX + 10},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ + 10}) using oak_planks. Leave window space at (${baseX + 10},${baseY + 2},${baseZ + 5}) - do NOT place block there. Build foundation blocks below if needed. Work with the team!`
            },
            {
                name: "west_wall",
                summary: "West wall", 
                instruction: `Build West wall: Build wall from (${baseX},${baseY + 1},${baseZ}) to (${baseX},${baseY + 4},${baseZ + 10}) using oak_planks. Leave window space at (${baseX},${baseY + 2},${baseZ + 5}) - do NOT place block there. Build foundation blocks below if needed. Work with the team!`
            },
            {
                name: "roof",
                summary: "Roof construction", 
                instruction: `Build roof: Place oak_planks blocks to cover the top at y=${baseY + 5} from (${baseX},${baseY + 5},${baseZ}) to (${baseX + 10},${baseY + 5},${baseZ + 10}). This is the flat roof layer. Work with the team!`
            }
        ];
        
        // Intelligently distribute work based on worker count
        if (workerCount === 1) {
            // 1 worker does everything in sequence
            return [{
                summary: "Complete house with decorations",
                instruction: `Build complete house: 1) Build foundation from (${baseX},${baseY},${baseZ}) to (${baseX + 10},${baseY},${baseZ + 10}) with stone. 2) Build North wall (${baseX},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ}) with oak_planks. Leave door opening at (${baseX + 5},${baseY + 1},${baseZ}) and (${baseX + 5},${baseY + 2},${baseZ}) - do NOT place blocks there. 3) Build South wall (${baseX},${baseY + 1},${baseZ + 10}) to (${baseX + 10},${baseY + 4},${baseZ + 10}) with oak_planks. 4) Build East wall (${baseX + 10},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ + 10}) with oak_planks. Leave window at (${baseX + 10},${baseY + 2},${baseZ + 5}). 5) Build West wall (${baseX},${baseY + 1},${baseZ}) to (${baseX},${baseY + 4},${baseZ + 10}) with oak_planks. Leave window at (${baseX},${baseY + 2},${baseZ + 5}). 6) Build roof at y=${baseY + 5} with oak_planks. 7) Place wooden door at (${baseX + 5},${baseY + 1},${baseZ}). 8) Place glass blocks in windows at (${baseX + 10},${baseY + 2},${baseZ + 5}) and (${baseX},${baseY + 2},${baseZ + 5}). 9) Place torches on GROUND inside house: (${baseX + 2},${baseY + 1},${baseZ + 2}) and (${baseX + 8},${baseY + 1},${baseZ + 8}). Place torches outside on ground: (${baseX + 2},${baseY + 1},${baseZ - 1}) and (${baseX + 8},${baseY + 1},${baseZ + 11}). DO NOT break walls to place torches. Use stone for foundation, oak_planks for walls. Place support blocks if needed.`
            }];
            } else if (workerCount === 2) {
            // 2 workers: one does foundation + 2 walls + decorations, other does 2 walls + roof + decorations
            return [
                {
                    summary: "Foundation, North/South walls, and door",
                    instruction: `Build foundation, 2 walls, and add door: 1) Build foundation from (${baseX},${baseY},${baseZ}) to (${baseX + 10},${baseY},${baseZ + 10}) with stone. 2) Build North wall (${baseX},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ}) with oak_planks. Leave door opening at (${baseX + 5},${baseY + 1},${baseZ}) and (${baseX + 5},${baseY + 2},${baseZ}) - do NOT place blocks there. 3) Build South wall (${baseX},${baseY + 1},${baseZ + 10}) to (${baseX + 10},${baseY + 4},${baseZ + 10}) with oak_planks. 4) Place wooden door at (${baseX + 5},${baseY + 1},${baseZ}). 5) Place torches on GROUND inside house: (${baseX + 2},${baseY + 1},${baseZ + 2}) and (${baseX + 8},${baseY + 1},${baseZ + 8}). DO NOT break walls to place torches. Place support blocks if needed. Work with the team!`
                },
                {
                    summary: "East/West walls, roof, and windows",
                    instruction: `Build 2 walls, roof, and add windows: 1) Build East wall (${baseX + 10},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ + 10}) with oak_planks. Leave window at (${baseX + 10},${baseY + 2},${baseZ + 5}) - do NOT place block there. 2) Build West wall (${baseX},${baseY + 1},${baseZ}) to (${baseX},${baseY + 4},${baseZ + 10}) with oak_planks. Leave window at (${baseX},${baseY + 2},${baseZ + 5}) - do NOT place block there. 3) Build roof at y=${baseY + 5} from (${baseX},${baseY + 5},${baseZ}) to (${baseX + 10},${baseY + 5},${baseZ + 10}) with oak_planks. 4) Place glass blocks in window openings: East wall at (${baseX + 10},${baseY + 2},${baseZ + 5}) and West wall at (${baseX},${baseY + 2},${baseZ + 5}). 5) Place torches outside on ground: (${baseX + 2},${baseY + 1},${baseZ - 1}) and (${baseX + 8},${baseY + 1},${baseZ + 11}). DO NOT break walls to place torches. Place support blocks if needed. Work with the team!`
                }
            ];
            } else if (workerCount === 3) {
            // 3 workers: foundation+north+door, south+east+windows, west+roof+torches
            return [
                {
                    summary: "Foundation, North wall, and door",
                    instruction: `Build foundation, North wall, and add door: 1) Build foundation from (${baseX},${baseY},${baseZ}) to (${baseX + 10},${baseY},${baseZ + 10}) with stone. 2) Build North wall (${baseX},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ}) with oak_planks. Leave door opening at (${baseX + 5},${baseY + 1},${baseZ}) and (${baseX + 5},${baseY + 2},${baseZ}) - do NOT place blocks there. 3) Place wooden door at (${baseX + 5},${baseY + 1},${baseZ}). Place support blocks if needed. Work with the team!`
                },
                {
                    summary: "South/East walls and windows",
                    instruction: `Build walls and add windows: 1) Build South wall (${baseX},${baseY + 1},${baseZ + 10}) to (${baseX + 10},${baseY + 4},${baseZ + 10}) with oak_planks. 2) Build East wall (${baseX + 10},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ + 10}) with oak_planks. Leave window at (${baseX + 10},${baseY + 2},${baseZ + 5}) - do NOT place block there. 3) Place glass blocks in East window opening at (${baseX + 10},${baseY + 2},${baseZ + 5}). Place support blocks if needed. Work with the team!`
                },
                {
                    summary: "West wall, roof, and lighting",
                    instruction: `Build wall, roof, and add lighting: 1) Build West wall (${baseX},${baseY + 1},${baseZ}) to (${baseX},${baseY + 4},${baseZ + 10}) with oak_planks. Leave window at (${baseX},${baseY + 2},${baseZ + 5}) - do NOT place block there. 2) Build roof at y=${baseY + 5} from (${baseX},${baseY + 5},${baseZ}) to (${baseX + 10},${baseY + 5},${baseZ + 10}) with oak_planks. 3) Place glass in West window at (${baseX},${baseY + 2},${baseZ + 5}). 4) Place torches on GROUND inside house: (${baseX + 2},${baseY + 1},${baseZ + 2}) and (${baseX + 8},${baseY + 1},${baseZ + 8}). Place torches outside on ground: (${baseX + 2},${baseY + 1},${baseZ - 1}) and (${baseX + 8},${baseY + 1},${baseZ + 11}). DO NOT break walls to place torches. Place support blocks if needed. Work with the team!`
                }
            ];
        } else if (workerCount === 4) {
            // 4 workers: foundation, north+south walls+door, east+west walls+windows, roof+lighting
            return [
                {
                    summary: "Foundation construction",
                    instruction: `Build foundation: Build foundation from (${baseX},${baseY},${baseZ}) to (${baseX + 10},${baseY},${baseZ + 10}) with stone. Place support blocks below if needed. Work with the team!`
                },
                {
                    summary: "North/South walls and door",
                    instruction: `Build walls and add door: 1) Build North wall (${baseX},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ}) with oak_planks. Leave door opening at (${baseX + 5},${baseY + 1},${baseZ}) and (${baseX + 5},${baseY + 2},${baseZ}) - do NOT place blocks there. 2) Build South wall (${baseX},${baseY + 1},${baseZ + 10}) to (${baseX + 10},${baseY + 4},${baseZ + 10}) with oak_planks. 3) Place wooden door at (${baseX + 5},${baseY + 1},${baseZ}). Place support blocks if needed. Work with the team!`
                },
                {
                    summary: "East/West walls and windows",
                    instruction: `Build walls and add windows: 1) Build East wall (${baseX + 10},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ + 10}) with oak_planks. Leave window at (${baseX + 10},${baseY + 2},${baseZ + 5}) - do NOT place block there. 2) Build West wall (${baseX},${baseY + 1},${baseZ}) to (${baseX},${baseY + 4},${baseZ + 10}) with oak_planks. Leave window at (${baseX},${baseY + 2},${baseZ + 5}) - do NOT place block there. 3) Place glass blocks in both window openings at (${baseX + 10},${baseY + 2},${baseZ + 5}) and (${baseX},${baseY + 2},${baseZ + 5}). Place support blocks if needed. Work with the team!`
                },
                {
                    summary: "Roof and lighting",
                    instruction: `Build roof and add lighting: 1) Build roof at y=${baseY + 5} from (${baseX},${baseY + 5},${baseZ}) to (${baseX + 10},${baseY + 5},${baseZ + 10}) with oak_planks. 2) Place torches on GROUND inside house: (${baseX + 2},${baseY + 1},${baseZ + 2}) and (${baseX + 8},${baseY + 1},${baseZ + 8}). Place torches outside on ground: (${baseX + 2},${baseY + 1},${baseZ - 1}) and (${baseX + 8},${baseY + 1},${baseZ + 11}). DO NOT break walls to place torches. Work with the team!`
                }
            ];
        } else { // 5 or more workers: each gets individual components + decorations
            // 5+ workers: foundation, north wall+door, south wall, east wall+window, west wall+window, roof+lighting
            const decoratedTasks = [
                allComponents[0], // foundation
                {
                    name: "north_wall_door",
                    summary: "North wall and door",
                    instruction: `Build North wall and add door: 1) Build wall from (${baseX},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ}) using oak_planks. Leave door opening at (${baseX + 5},${baseY + 1},${baseZ}) and (${baseX + 5},${baseY + 2},${baseZ}) - do NOT place blocks there. 2) Place wooden door at (${baseX + 5},${baseY + 1},${baseZ}). Build foundation blocks below if needed. Work with the team!`
                },
                allComponents[2], // south wall
                {
                    name: "east_wall_window",
                    summary: "East wall and window",
                    instruction: `Build East wall and add window: 1) Build wall from (${baseX + 10},${baseY + 1},${baseZ}) to (${baseX + 10},${baseY + 4},${baseZ + 10}) using oak_planks. Leave window at (${baseX + 10},${baseY + 2},${baseZ + 5}) - do NOT place block there. 2) Place glass block in window opening at (${baseX + 10},${baseY + 2},${baseZ + 5}). Build foundation blocks below if needed. Work with the team!`
                },
                {
                    name: "west_wall_window",
                    summary: "West wall and window",
                    instruction: `Build West wall and add window: 1) Build wall from (${baseX},${baseY + 1},${baseZ}) to (${baseX},${baseY + 4},${baseZ + 10}) using oak_planks. Leave window at (${baseX},${baseY + 2},${baseZ + 5}) - do NOT place block there. 2) Place glass block in window opening at (${baseX},${baseY + 2},${baseZ + 5}). Build foundation blocks below if needed. Work with the team!`
                },
                {
                    name: "roof_lighting",
                    summary: "Roof and lighting",
                    instruction: `Build roof and add lighting: 1) Build roof at y=${baseY + 5} from (${baseX},${baseY + 5},${baseZ}) to (${baseX + 10},${baseY + 5},${baseZ + 10}) with oak_planks. 2) Place torches on GROUND inside house: (${baseX + 2},${baseY + 1},${baseZ + 2}) and (${baseX + 8},${baseY + 1},${baseZ + 8}). Place torches outside on ground: (${baseX + 2},${baseY + 1},${baseZ - 1}) and (${baseX + 8},${baseY + 1},${baseZ + 11}). DO NOT break walls to place torches. Work with the team!`
                }
            ];
            return decoratedTasks.slice(0, workerCount);
        }
    }

    /**
     * Create building plan for different structure types
     * @param {string} structureType - Type of structure (house, tower, wall, etc.)
     * @param {Object} position - Bot's current position
     * @param {number} workerCount - Number of available workers
     * @returns {Object} Building plan with tasks
     */
    async _createBuildingPlan(structureType, position, workerCount) {
        const baseX = Math.floor(position.x + 5);
        const baseY = Math.floor(position.y);
        const baseZ = Math.floor(position.z);
        
        const plans = {
            house: {
                description: `Building a ${structureType} with ${workerCount} workers at (${baseX},${baseY},${baseZ})`,
                area: { start: { x: baseX, y: baseY, z: baseZ }, end: { x: baseX + 10, y: baseY + 5, z: baseZ + 10 } },
                tasks: this._createHouseTasks(baseX, baseY, baseZ, workerCount)
            },
            wall: {
                description: `Building a ${structureType} with ${workerCount} workers at (${baseX},${baseY},${baseZ})`,
                area: { start: { x: baseX, y: baseY, z: baseZ }, end: { x: baseX + 20, y: baseY + 4, z: baseZ } },
                tasks: this._createWallTasks(baseX, baseY, baseZ, workerCount)
            },
            tower: {
                description: `Building a ${structureType} at (${baseX},${baseY},${baseZ})`,
                area: { start: { x: baseX, y: baseY, z: baseZ }, end: { x: baseX + 5, y: baseY + 15, z: baseZ + 5 } },
                tasks: [
                    {
                        summary: "Tower base construction", 
                        instruction: `Build the base of a tower from (${baseX},${baseY},${baseZ}) to (${baseX + 5},${baseY + 7},${baseZ + 5}) using stone. Hollow out the interior. Work with the team!`
                    },
                    {
                        summary: "Tower top construction", 
                        instruction: `Build the top of a tower from (${baseX},${baseY + 8},${baseZ}) to (${baseX + 5},${baseY + 15},${baseZ + 5}) using stone. Add windows. Work with the team!`
                    }
                ]
            },
            bridge: {
                description: `Building a ${structureType} at (${baseX},${baseY},${baseZ})`,
                area: { start: { x: baseX, y: baseY, z: baseZ }, end: { x: baseX + 20, y: baseY + 3, z: baseZ + 5 } },
                tasks: [
                    {
                        summary: "Bridge support pillars", 
                        instruction: `Build support pillars for a bridge at positions (${baseX},${baseY},${baseZ}) and (${baseX + 20},${baseY},${baseZ + 5}). Make them 5 blocks tall using stone. Work with the team!`
                    },
                    {
                        summary: "Bridge deck construction", 
                        instruction: `Build the bridge deck from (${baseX},${baseY + 2},${baseZ}) to (${baseX + 20},${baseY + 2},${baseZ + 5}) using oak_planks. Work with the team!`
                    }
                ]
            }
        };
        
        let plan = plans[structureType] || plans.house; // Default to house if unknown structure
        
        // For wall, create dynamic sections based on worker count
        if (structureType === 'wall') {
            const wallLength = 20;
            const sectionsPerWorker = Math.ceil(wallLength / workerCount);
            plan.tasks = [];
            
            for (let i = 0; i < workerCount; i++) {
                const sectionStartX = baseX + (i * sectionsPerWorker);
                const sectionEndX = Math.min(baseX + ((i + 1) * sectionsPerWorker) - 1, baseX + wallLength);
                
                plan.tasks.push({
                    summary: `Wall section ${i + 1} (x=${sectionStartX} to x=${sectionEndX})`,
                    instruction: `Build wall section from (${sectionStartX},${baseY},${baseZ}) to (${sectionEndX},${baseY + 4},${baseZ}) using cobblestone. Build foundation first if needed. Work with the team!`
                });
            }
        }
        
        // Limit tasks to available workers
        plan.tasks = plan.tasks.slice(0, workerCount);
        
        return plan;
    }

    /**
     * Inspect collaborative build and coordinate repairs
     * @param {Object} buildPlan - The building plan with area information
     */
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
                this.openChat(`✅ Build inspection complete! Structure looks good. Great teamwork! 🏗️`);
            } else {
                this.openChat(`⚠️ Build inspection found some gaps. ${missingCount}/${samplePositions.length} sample positions need attention.`);
                
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
}
