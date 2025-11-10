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
    .argv;

(async () => {
    try {
        console.log(`Starting worker ${argv.name} in internal brain mode`);
        
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
        
        // Set worker flag before starting
        agent.isWorkerBot = true;
        agent.workerName = argv.name;
        
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