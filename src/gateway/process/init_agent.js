import { Agent } from '../agent/agent.js';
import { MindServerProxy } from '../agent/mindserver_proxy.js';
import yargs from 'yargs';
import agentSettings, { setSettings } from '#src/gateway/agent/settings.js';
import settings from '../../../settings.js';

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js -n <agent_name> -p <port> -l <load_memory> -m <init_message> -c <count_id>');
    process.exit(1);
}

const argv = yargs(args)
    .option('name', {
        alias: 'n',
        type: 'string',
        description: 'name of agent'
    })
    .option('load_memory', {
        alias: 'l',
        type: 'boolean',
        description: 'load agent memory from file on startup'
    })
    .option('init_message', {
        alias: 'm',
        type: 'string',
        description: 'automatically prompt the agent on startup'
    })
    .option('count_id', {
        alias: 'c',
        type: 'number',
        default: 0,
        description: 'identifying count for multi-agent scenarios',
    })
    .option('port', {
        alias: 'p',
        type: 'number',
        description: 'port for agent ExternalAPI server'
    })
    .option('mindserverPort', {
    type: 'number',
    default: settings.mindserver_port || 8080,
    description: 'port of mindserver'
    })
    .argv;

(async () => {
    try {
        // Populate the agent settings object
        console.log('[DEBUG] Root settings.minecraft_version:', settings.minecraft_version);
        setSettings(settings);
        console.log('[DEBUG] Agent settings.minecraft_version:', agentSettings.minecraft_version);  // ← Check it here
        

        // In Docker, use container name instead of localhost
        const mindserverHost = settings.mindserver_host || 'mindserver';
        const mindserverPort = settings.mindserver_port || 8080;
        // Create fresh instance for this agent process
        const serverProxy = new MindServerProxy(argv.name);
        console.log(`Connecting to MindServer at ${mindserverHost}:${mindserverPort}`);
        await serverProxy.connect(argv.name, mindserverPort, mindserverHost);
        console.log('Starting agent');
        const agent = new Agent();
        agent.serverProxy = serverProxy;  // ← Add this line
        serverProxy.setAgent(agent);
        console.log('[init_agent] Settings before agent start:', {
            base_profile: agentSettings.base_profile,
            brain_mode: agentSettings.brain_mode,
            model: agentSettings.model,
            allSettings: agentSettings
        });

        await agent.start(argv.load_memory, argv.init_message, argv.count_id, argv.name, argv.port);
        console.log(`[DEBUG] Agent started successfully.`);
    } catch (error) {
        console.error('Failed to start agent process:');
        console.error(error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
