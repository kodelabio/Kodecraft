import { Agent } from '../agent/agent.js';
import { ExternalAPI } from '../agent/external_api.js';
import { setSettings } from '../agent/settings.js';
import { readFileSync } from 'fs';
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
async function reportTaskCompletion(result) {
    const { callbackWebhookUrl, name, sessionId } = global.workerConfig;
    
    if (!callbackWebhookUrl) {
        console.warn('⚠️  No callback webhook URL configured');
        return;
    }
    
    try {
        console.log(`📞 Reporting task completion for ${name}`);
        console.log(`   Webhook URL: ${callbackWebhookUrl}`);
        console.log(`   Session ID: ${sessionId}`);
        console.log(`   Result: ${JSON.stringify(result).substring(0, 200)}`);
        
        const startTime = Date.now();
        
        const response = await fetch(callbackWebhookUrl, {
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
            console.error(`   URL: ${global.workerConfig.callbackWebhookUrl}`);
        }
    }
}

// Make it globally available
global.reportTaskCompletion = reportTaskCompletion;

(async () => {
    try {
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
        setSettings(workerSettings);
        
        console.log(`Worker settings initialized:`, { 
            brain_mode: workerSettings.brain_mode,
            base_profile: workerSettings.base_profile,
            profile_name: workerSettings.profile.name
        });
        
        // Create and start agent in internal mode
        const agent = new Agent();
        await agent.start(argv.load_memory, argv.init_message, argv.count_id);
        
        // Start API server for the worker
        console.log(`Starting API server for worker ${argv.name} on port ${argv.port}`);
        const api = new ExternalAPI(agent);
        await api.start(argv.port);
        
        console.log(`Worker ${argv.name} ready on port ${argv.port}`);
        
    } catch (error) {
        console.error(`Failed to start worker ${argv.name}:`, error);
        process.exit(1);
    }
})();