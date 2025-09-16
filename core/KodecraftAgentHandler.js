 // core/KodecraftAgentHandler.js

import { AgentProcess } from '../src/process/agent_process.js';
import { EventEmitter } from 'events';

export class KodecraftAgentHandler extends EventEmitter {
    constructor(config, registerAgentFunc) {
        super();
        this.config = config;
        this.agentProcesses = {};
        this.agentSettings = {}; // Store agent settings for recreation
        this.agentCount = 0;
        this.registerAgent = registerAgentFunc
    }

    createAgent(settings) {
        const agentName = settings?.profile?.name;
        if (!agentName) {
            console.error('Agent name is required in profile');
            return null;
        }

        const clonedSettings = JSON.parse(JSON.stringify(settings));

        // Store settings for later recreation
        this.agentSettings[agentName] = clonedSettings;

        const loadMemory = clonedSettings.load_memory || false;
        const initMessage = clonedSettings.init_message || null;

        const agent = new AgentProcess(agentName, this.config.mindserver_port || 8080);

        agent.on('exit', (name) => {
            this.emit('agentOffline', name);
            // Don't delete the agent process immediately, just mark it as offline
            if (this.agentProcesses[name]) {
                this.agentProcesses[name] = null; // Mark as offline but keep the slot
            }
        });

        agent.start(loadMemory, initMessage, this.agentCount++);

        this.agentProcesses[agentName] = agent;

        return {
            name: agentName,
            settings: clonedSettings,
            process: agent,
        };
    }

    startAgent(agentName) {
        // Check if agent exists but is offline (null)
        if (this.agentProcesses[agentName] === null && this.agentSettings[agentName]) {
            console.log(`Recreating agent '${agentName}'...`);
            return this.createAgent(this.agentSettings[agentName]);
        }

        const agent = this.agentProcesses[agentName];
        if (!agent) {
            console.error(`Cannot start agent '${agentName}'; not found`);
            return;
        }

        // If agent exists and is running, try to continue it
        if (agent.continue) {
            agent.continue();
        } else {
            console.log(`Agent '${agentName}' is already running or cannot be continued`);
        }
    }

    stopAgent(agentName) {
        const agent = this.agentProcesses[agentName];
        if (agent) {
            console.log(`Stopping agent '${agentName}'...`);
            agent.stop();
        }
    }

    // New method to check if an agent exists (even if offline)
    hasAgent(agentName) {
        return agentName in this.agentSettings;
    }

    // New method to get agent status
    getAgentStatus(agentName) {
        if (!this.hasAgent(agentName)) return 'not_found';
        if (this.agentProcesses[agentName] === null) return 'offline';
        if (this.agentProcesses[agentName]) return 'online';
        return 'unknown';
    }

    shutdown() {
        console.log('Shutting down all agents');
        Object.values(this.agentProcesses).forEach(agent => {
            if (agent) agent.stop();
        });
        setTimeout(() => process.exit(0), 2000);
    }

    getAgentProcess(agentName) {
        return this.agentProcesses[agentName];
    }
}