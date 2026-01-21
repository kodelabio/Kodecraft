import { Agent } from '../agent/agent.js';
import { ExternalAPI } from '../agent/external_api.js';
import { setSettings } from '../agent/settings.js';
import { readFileSync, createWriteStream } from 'fs';
import { MindServerProxy } from '../agent/mindserver_proxy.js';
import { mkdir } from 'fs/promises';
import yargs from 'yargs';
import rootSettings from '../../settings.js';


const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_worker.js -n <worker_name> -p <port> -l <load_memory> -m <init_message>');
    process.exit(1);
}

const argv = yargs(args)
    .option('name', {
        alias: 'n',
        type: 'string',
        description: 'name of worker'
    })
    .option('load_memory', {
        alias: 'l',
        type: 'boolean',
        description: 'load worker memory from file on startup'
    })
    .option('init_message', {
        alias: 'm',
        type: 'string',
        description: 'automatically prompt the worker on startup'
    })
    .option('port', {
        alias: 'p',
        type: 'number',
        description: 'port for worker API server'
    })
    .option('count_id', {
        alias: 'c',
        type: 'number',
        default: 0,
        description: 'unique count ID for the worker'
    })
    .option('session_id', {
        alias: 's',
        type: 'string',
        description: 'build session ID'
    })
    .option('webhook', {
        alias: 'w',
        type: 'string',
        description: 'callback webhook URL for task completion'
    })
    .argv;

// Store callback info globally for use when tasks complete
global.workerConfig = {
    name: argv.name,
    port: argv.port,
    sessionId: argv.session_id,
    callbackWebhookUrl: argv.webhook,
    taskStartTime: null
};

// Function to report task completion
async function reportTaskCompletion(result, callbackWebhookUrl) {
    const { name, sessionId } = global.workerConfig;

    // Use passed URL or fall back to global config
    const webhookUrl = callbackWebhookUrl || global.workerConfig?.callbackWebhookUrl;
    
    if (!webhookUrl) {
        console.warn('⚠️  No callback webhook URL configured');
        return;
    }
    
    try {
        console.log(`📞 Reporting task completion for ${name}`);
        console.log(`   Webhook URL: ${webhookUrl}`);
        console.log(`   Session ID: ${sessionId}`);
        console.log(`   Result: ${JSON.stringify(result).substring(0, 200)}`);
        
        const startTime = Date.now();
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: sessionId,
                workerName: name,
                status: 'completed',
                result: result || {
                    taskCompleted: 'Task executed',
                    blocksPlaced: 0,
                    timeSpent: Date.now() - (global.workerConfig.taskStartTime || Date.now())
                },
                completionTime: new Date().toISOString()
            })
        });
        
        const callbackDuration = Date.now() - startTime;
        
        if (response.ok) {
            const responseBody = await response.text();
            console.log(`✓ Task completion reported successfully`);
            console.log(`   Response status: ${response.status}`);
            console.log(`   Response time: ${callbackDuration}ms`);
            console.log(`   Response body: ${responseBody.substring(0, 200)}`);
        } else {
            const errorBody = await response.text();
            console.error(`✗ Failed to report completion`);
            console.error(`   Response status: ${response.status}`);
            console.error(`   Response time: ${callbackDuration}ms`);
            console.error(`   Error body: ${errorBody.substring(0, 200)}`);
        }
    } catch (error) {
        console.error(`✗ Error reporting task completion:`);
        console.error(`   Error type: ${error.name}`);
        console.error(`   Error message: ${error.message}`);
        console.error(`   Error code: ${error.code}`);
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            console.error(`   ⚠️  Network error - webhook URL may be unreachable`);
            console.error(`   URL: ${webhookUrl}`);
        }
    }
}

// Make it globally available
global.reportTaskCompletion = reportTaskCompletion;

// Setup file logging
async function setupLogging(workerName) {
    try {
        await mkdir('logs/workers', { recursive: true });
        
        const logFile = createWriteStream(`logs/workers/${workerName}-${Date.now()}.log`, { flags: 'a' });
        const originalLog = console.log;
        const originalError = console.error;
        
        console.log = (...args) => {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
            logFile.write(`[${new Date().toISOString()}] LOG: ${msg}\n`);
            originalLog(...args);
        };
        
        console.error = (...args) => {
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
            logFile.write(`[${new Date().toISOString()}] ERROR: ${msg}\n`);
            originalError(...args);
        };
        
        console.log(`📝 Logging initialized for ${workerName}`);
    } catch (err) {
        console.error('Failed to setup logging:', err.message);
    }
}

(async () => {
    try {
        // Setup logging first
        await setupLogging(argv.name || 'unknown-worker');
        console.log(`Starting worker ${argv.name} in internal brain mode`);
        console.log(`📞 Callback webhook: ${argv.webhook || 'not set'}`);
        
        // Initialize the agent settings from root settings
        const workerSettings = { ...rootSettings };
        workerSettings.brain_mode = 'internal'; // Force internal mode for workers
        workerSettings.render_bot_view = false; // Disable browser viewer for workers to avoid conflicts
        
        // Disable all chat interactions for workers - they should only respond to API commands
        workerSettings.narrate_behavior = false; // No automatic action narration
        workerSettings.chat_bot_messages = false; // No messaging other bots
        workerSettings.external_mode_allow_chat = false; // No chat commands
        workerSettings.only_chat_with = []; // Don't listen to anyone in chat
        workerSettings.is_worker_bot = true; // Flag to identify this as a worker bot
        workerSettings.cheat_mode_enabled = true; // ✅ NEW: Enable cheat mode for workers
        
        // Load and set the first profile (workers use the same profile as the leader)
        let profilePath = workerSettings.profiles[0];
        if (!profilePath) {
            throw new Error('No profiles found in settings');
        }
        
        console.log(`Loading profile from: ${profilePath}`);
        const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
        
        // Override profile name for worker
        const workerProfile = { ...profile };
        workerProfile.name = argv.name;
        
        workerSettings.profile = workerProfile;
        workerSettings.assigned_api_port = argv.port;
        setSettings(workerSettings);
        
        console.log(`Worker settings initialized:`, { 
            brain_mode: workerSettings.brain_mode,
            base_profile: workerSettings.base_profile,
            profile_name: workerSettings.profile.name
        });
        
        // Create and start agent in internal mode
        // Create MindServer connection for worker
        const mindserverHost = workerSettings.mindserver_host || 'mindserver';
        const mindserverPort = workerSettings.mindserver_port || 8080;
        const serverProxy = new MindServerProxy(argv.name);
        await serverProxy.connect(argv.name, mindserverPort, mindserverHost);

        // Create and start agent in internal mode
        const agent = new Agent();
        agent.serverProxy = serverProxy;
        serverProxy.setAgent(agent);
        await agent.start(argv.load_memory, argv.init_message, argv.count_id, argv.name);

        // ✅ DETAILED VERIFICATION OF SKILL LIBRARY
        console.log(`\n📚 === SKILL LIBRARY VERIFICATION FOR ${argv.name} ===`);
        console.log(`Current working directory: ${process.cwd()}`);
        console.log(`Node process PID: ${process.pid}`);
        try {
            // Check 1: Prompter exists
            if (!agent.prompter) {
                throw new Error('agent.prompter is null/undefined');
            }
            console.log(`✅ agent.prompter exists`);
            
            // Check 2: Skill library exists
            if (!agent.prompter.skill_libary) {
                throw new Error('agent.prompter.skill_libary is null/undefined');
            }
            console.log(`✅ agent.prompter.skill_libary exists`);
            
            // Check 3: getAllSkillDocs method exists
            if (typeof agent.prompter.skill_libary.getAllSkillDocs !== 'function') {
                throw new Error(`getAllSkillDocs is not a function, got: ${typeof agent.prompter.skill_libary.getAllSkillDocs}`);
            }
            console.log(`✅ getAllSkillDocs is a function`);
            
            // Check 4: Call getAllSkillDocs
            console.log(`Calling getAllSkillDocs()...`);
            const allDocs = await agent.prompter.skill_libary.getAllSkillDocs();
            console.log(`✅ getAllSkillDocs() succeeded`);
            
            // Check 5: Validate result
            if (!allDocs) {
                throw new Error(`getAllSkillDocs returned null/undefined`);
            }
            if (typeof allDocs !== 'object') {
                throw new Error(`getAllSkillDocs returned ${typeof allDocs}, expected object`);
            }
            const skillCount = Object.keys(allDocs).length;
            if (skillCount === 0) {
                console.warn(`⚠️  getAllSkillDocs returned empty object (0 skills)`);
            } else {
                console.log(`✅ Skill library loaded: ${skillCount} skills available`);
                console.log(`   Skills: ${Object.keys(allDocs).slice(0, 5).join(', ')}${skillCount > 5 ? '...' : ''}`);
            }
            
        } catch (error) {
            console.error(`\n❌ SKILL LIBRARY VERIFICATION FAILED`);
            console.error(`Error: ${error.message}`);
            console.error(`Stack: ${error.stack}`);
            console.error(`\nWorker will likely fail during code generation.`);
            console.error(`Debug info:`, {
                prompter_exists: !!agent.prompter,
                skill_libary_exists: !!agent.prompter?.skill_libary,
                getAllSkillDocs_type: typeof agent.prompter?.skill_libary?.getAllSkillDocs,
                working_dir: process.cwd()
            });
        }
        console.log(`📚 === END VERIFICATION ===\n`);

        // Start API server for the worker
        console.log(`Starting API server for worker ${argv.name} on port ${argv.port}`);
        const api = new ExternalAPI(agent);
        const apiStartPromise = api.start(argv.port);

        // If API doesn't start within 5 seconds, log it
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API start timeout')), 5000)
        );

        try {
            await Promise.race([apiStartPromise, timeoutPromise]);
            console.log(`Worker ${argv.name} ready on port ${argv.port}`);
        } catch (error) {
            console.error(`API start failed or timed out: ${error.message}`);
            throw error;
        }
        
    } catch (error) {
        console.error(`Failed to start worker ${argv.name}:`, error);
        process.exit(1);
    }
})();