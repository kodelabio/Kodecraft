// core/KodecraftAgentHandler.js

import { AgentProcess } from '../src/process/agent_process.js';
import { EventEmitter } from 'events';

export class KodecraftAgentHandler extends EventEmitter {
    constructor(config, registerAgentFunc) {
        super();
        this.config = config;
        this.agentProcesses = {};
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
    
        const loadMemory = clonedSettings.load_memory || false;
        const initMessage = clonedSettings.init_message || null;
    
        const agent = new AgentProcess(agentName, this.config.mindserver_port || 8080);

        agent.on('exit', (name) => {
            this.emit('agentOffline', name);
            delete this.agentProcesses[name];
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
        const agent = this.agentProcesses[agentName];
        if (!agent) {
            console.error(`Cannot start agent '${agentName}'; not found`);
            return;
        }
        agent.continue();
    }

    stopAgent(agentName) {
        const agent = this.agentProcesses[agentName];
        if (agent) agent.stop();
    }

    shutdown() {
        console.log('Shutting down all agents');
        Object.values(this.agentProcesses).forEach(agent => agent.stop());
        setTimeout(() => process.exit(0), 2000);
    }

    getAgentProcess(agentName) {
        return this.agentProcesses[agentName];
    }
}