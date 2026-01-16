import { readFileSync } from 'fs';
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
import settings from './settings.js';
import { Task } from './tasks/tasks.js';
import { say } from './speak.js';
import { ExternalAPI } from './external_api.js';
// Use global fetch (Node.js 18+) or import if needed
const fetch = globalThis.fetch || (async (...args) => {
    const { default: nodeFetch } = await import('node-fetch');
    return nodeFetch(...args);
});

export class Agent {
    async start(load_mem = false, init_message = null, count_id = 0, botName = null, port = null) {
        this.last_sender = null;
        this.count_id = count_id;

        const apiPort = port || settings.leader_bot_base_port || 5000; 

        // Load profile from file
        let profile = settings.profile || {};
        if (settings.profiles && settings.profiles.length > 0) {
            try {
                const profilePath = settings.profiles[0];
                profile = JSON.parse(readFileSync(profilePath, 'utf8'));
                console.log(`Loaded profile from ${profilePath}`);
            } catch (error) {
                console.warn(`Failed to load profile from ${settings.profiles[0]}, using defaults:`, error.message);
            }
        }

        // Initialize components with more detailed error handling
        this.actions = new ActionManager(this);
        this.prompter = new Prompter(this, profile);
        this.name = botName || this.prompter.getName();
        console.log(`Initializing agent ${this.name}...`);
        this.history = new History(this);
        this.coder = new Coder(this);
        
        // Only initialize brain components if not in external mode
        if (settings.brain_mode !== 'external') {
            this.history = new History(this);
            this.coder = new Coder(this);
            this.self_prompter = new SelfPrompter(this);
            convoManager.initAgent(this);
            await this.prompter.initExamples();
        } else {
            console.log('External brain mode enabled - skipping internal AI components');
            // Create minimal history for action logging only
            this.history = { 
                add: () => {}, 
                save: () => {}, 
                load: () => null,
                memory: ''
            };
            // Create dummy self_prompter to prevent errors in modes.js
            this.self_prompter = {
                isActive: () => false,
                stopLoop: () => {},
                shouldInterrupt: () => false,
                handleUserPromptedCmd: () => {},
                update: () => {},
                stop: () => {}
            };
        }
        
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
            
            // Only login to MindServer if in external brain mode
            if (settings.brain_mode === 'external') {
                this.serverProxy.login();
            }

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
                try {
                    this.vision_interpreter = new VisionInterpreter(this, settings.allow_vision);
                } catch (visionError) {
                    console.warn('Vision initialization failed (non-fatal):', visionError.message);
                    this.vision_interpreter = null;
                }
                //this.vision_interpreter = new VisionInterpreter(this, settings.allow_vision);

                // wait for a bit so stats are not undefined
                await new Promise((resolve) => setTimeout(resolve, 1000));

                console.log(`Worker ${this.name} spawned.`);
                this.clearBotLogs();
                //onsole.log(`${this.name} bot logs cleared.`);
                // Setup event handlers based on brain mode
                if (settings.brain_mode === 'external' && !settings.is_worker_bot) {
                    await this._setupExternalMode(save_data, init_message, apiPort);
                } else {
                    this._setupEventHandlers(save_data, init_message);
                    //console.log(`${this.name} event handlers set.`);
                }
                this.startEvents();
                //console.log(`${this.name} events started.`);
                //console.log(`${this.name} DEBUG: load_mem=${load_mem}, settings.task=${!!settings.task}`);
                if (!load_mem) {
                    if (settings.task) {
                        //console.log(`${this.name} initializing bot tasks.`);
                        this.task.initBotTask();
                        this.task.setAgentGoal();
                        //console.log(`${this.name} bot tasks initialized`);

                    }
                } else {
                    // set the goal without initializing the rest of the task
                    if (settings.task) {
                        //console.log(`${this.name} setting agent goal.`);
                        this.task.setAgentGoal();
                        //console.log(`${this.name} agent goal set.`);
                    }
                }

                // Skip this for worker bots - let them start their API server
                if (!settings.is_worker_bot) {
                    await new Promise((resolve) => setTimeout(resolve, 10000));
                    this.checkAllPlayersPresent();
                    
                }
                //console.log(`${this.name} spawn handler COMPLETE - control returning to init_worker.js`);       
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

        // Skip chat listeners for worker bots - they should only respond to API commands
        if (!settings.is_worker_bot) {
            this.bot.on('whisper', respondFunc);

            this.bot.on('chat', (username, message) => {
                if (this.serverProxy.getNumOtherAgents() > 0) return;
                // only respond to open chat messages when there are no other agents
                respondFunc(username, message);
            });
        }

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
            // Only send greeting if not a worker bot
            if (!settings.is_worker_bot) {
                this.openChat("Hello world! I am " + this.name);
            }
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
        // In external brain mode, handle messages selectively
        if (settings.brain_mode === 'external') {
            if (source === 'system') {
                // Log system messages (like action results) but don't process
                console.log('System message in external mode:', message);
                return false;
            }
            
            // Allow direct commands from authorized users (bypass AI processing)
            if (source === 'chat' && settings.external_mode_allow_chat) {
                // Check if user is authorized (if only_chat_with is set)
                if (settings.only_chat_with.length > 0) {
                    const username = message.split(':')[0]; // Extract username from "username: message"
                    if (!settings.only_chat_with.includes(username)) {
                        console.log(`Ignoring chat from unauthorized user in external mode: ${username}`);
                        return false;
                    }
                }
                
                // Allow basic commands to work for testing (no AI processing)
                if (message.includes('!') || message.toLowerCase().includes('hello') || message.toLowerCase().includes('help')) {
                    console.log('Processing authorized command in external mode:', message);
                    // Continue to normal processing but skip AI
                } else {
                    console.log('Ignoring non-command message in external mode:', message);
                    return false;
                }
            } else {
                // All other messages should come through the API
                console.log('Ignoring message in external brain mode:', source, message);
                return false;
            }
        }
        
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
        // Worker bots should not chat - they only respond to API commands
        if (settings.is_worker_bot) {
            console.log(`[Worker ${this.name}] Silenced chat: ${message}`);
            return;
        }
        
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
            console.warn('[Agent] Bot end event fired! Reason:', reason);
            // Stop all workers before killing agent
            // Stop all workers in background (don't await)
            if (this.orchestration) {
                this.orchestration.stopAllWorkers().catch(error => {
                    console.error(`❌ Error stopping workers:`, error);
                });
            }
            this.cleanKill('Bot disconnected! Killing agent process.');
        });
        this.bot.on('death', () => {
            this.actions.cancelResume();
            this.actions.stop();
        });
        this.bot.on('kicked', (reason) => {
            console.warn('[Agent] Bot kicked event fired! Reason:', reason);
            // Stop all workers in background (don't await)
            if (this.orchestration) {
                this.orchestration.stopAllWorkers().catch(error => {
                    console.error(`❌ Error stopping workers:`, error);
                });
            }
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
        if (this.self_prompter) {
            this.self_prompter.update(delta);
        }
        await this.checkTaskDone();
    }

    isIdle() {
        return !this.actions.executing;
    }


    hmgdfrseawfcdq(msg = 'Killing agent process...', code = 1) {
        if (this.externalAPI) {
            this.externalAPI.stop();
        }
        
        this.history.add('system', msg);
        this.bot.chat(code > 1 ? 'Restarting.' : 'Exiting.');
        this.history.save();
        process.kill(process.pid, 'SIGINT'); 
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
        this.serverProxy.shutdown();
    }

    // New method for external brain mode setup
    async _setupExternalMode(save_data, init_message, port = 5000) {
        console.log('Setting up external brain mode...');
        
        // Start the REST API server
        this.externalAPI = new ExternalAPI(this);
        // For workers, use the assigned port; for leader, calculate from count_id
        // Use the port parameter passed in, or fall back to assigned/calculated
        const agentApiPort = port || settings.assigned_api_port || 
                     (settings.leader_bot_base_port + this.count_id);
        console.log(`Starting ExternalAPI on port ${agentApiPort}`);
        await this.externalAPI.start(agentApiPort);
        
        // Setup chat forwarder to n8n webhook
        this.setupChatForwarder();
        
        // Disable auto-eat and other brain-dependent behaviors
        this.bot.autoEat.options = {
            priority: 'foodPoints',
            startAt: 14,
            bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
        };
        
        // Send simple greeting in external mode
        console.log('External brain mode initialized');
        if (!settings.is_worker_bot) {
            await this.openChat(`Hello! I am ${this.name}.`);
        }
    }

    // New method for chat forwarding
    setupChatForwarder() {
        const webhookUrl = settings.n8n_webhook_url || process.env.N8N_WEBHOOK_URL;
        
        if (!webhookUrl) {
            console.warn('No n8n webhook URL configured for chat forwarding');
            return;
        }

        console.log('Setting up chat forwarder to:', webhookUrl);
        
        this.bot.on('chat', async (username, message) => {
            // Skip own messages and system messages
            if (username === this.name) return;
            
            // Skip if not in external brain mode
            if (settings.brain_mode !== 'external') return;
            
            // Ignore certain system messages
            const ignore_messages = [
                "Set own game mode to",
                "Set the time to", 
                "Set the difficulty to",
                "Teleported ",
                "Set the weather to",
                "Gamerule "
            ];
            
            if (ignore_messages.some((m) => message.startsWith(m))) return;
            
            try {
                const payload = {
                    source: 'ingame',
                    username: username,
                    message: message,
                    timestamp: new Date().toISOString(),
                    agent_name: this.name
                };
                
                console.log(`Forwarding chat to n8n: ${username}: ${message}`);
                
                await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
            } catch (error) {
                console.error('Failed to forward chat to n8n:', error);
            }
        });

        // Also handle whispers
        this.bot.on('whisper', async (username, message) => {
            if (username === this.name || settings.brain_mode !== 'external') return;
            
            try {
                const payload = {
                    source: 'ingame_whisper',
                    username: username, 
                    message: message,
                    timestamp: new Date().toISOString(),
                    agent_name: this.name
                };
                
                console.log(`Forwarding whisper to n8n: ${username}: ${message}`);
                
                await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
            } catch (error) {
                console.error('Failed to forward whisper to n8n:', error);
            }
        });
    }
}
