// Agent Registry - Singleton to manage active agents and their bots
class AgentRegistry {
    constructor() {
        this.agents = new Map(); // agentName -> Agent instance
        this.bots = new Map();   // agentName -> bot instance
    }

    registerAgent(agentName, agent) {
        console.log(`[AgentRegistry] Registering agent: ${agentName}`);
        this.agents.set(agentName, agent);
        if (agent.bot) {
            this.bots.set(agentName, agent.bot);
        }
        return agent;
    }

    unregisterAgent(agentName) {
        console.log(`[AgentRegistry] Unregistering agent: ${agentName}`);
        this.agents.delete(agentName);
        this.bots.delete(agentName);
    }

    getAgent(agentName) {
        return this.agents.get(agentName);
    }

    getBot(agentName) {
        return this.bots.get(agentName);
    }

    getFirstAgent() {
        const agentNames = Array.from(this.agents.keys());
        return agentNames.length > 0 ? this.agents.get(agentNames[0]) : null;
    }

    getFirstBot() {
        const botNames = Array.from(this.bots.keys());
        return botNames.length > 0 ? this.bots.get(botNames[0]) : null;
    }

    getAllAgents() {
        return Array.from(this.agents.values());
    }

    getAllBots() {
        return Array.from(this.bots.values());
    }

    getAgentNames() {
        return Array.from(this.agents.keys());
    }

    hasAgents() {
        return this.agents.size > 0;
    }

    hasBots() {
        return this.bots.size > 0;
    }

    // For executor server - find best bot to use
    getBotForExecutor(preferredName = null) {
        // Try to get specific bot if requested
        if (preferredName && this.bots.has(preferredName)) {
            return {
                bot: this.bots.get(preferredName),
                agent: this.agents.get(preferredName),
                name: preferredName
            };
        }

        // Fall back to first available bot
        if (this.hasBots()) {
            const firstName = this.getAgentNames()[0];
            return {
                bot: this.bots.get(firstName),
                agent: this.agents.get(firstName),
                name: firstName
            };
        }

        return null;
    }

    // Update bot reference when agent's bot changes
    updateBotReference(agentName, bot) {
        if (this.agents.has(agentName)) {
            this.bots.set(agentName, bot);
        }
    }
}

// Global singleton instance
export const agentRegistry = new AgentRegistry();

// Convenience exports
export const registerAgent = (name, agent) => agentRegistry.registerAgent(name, agent);
export const getAgent = (name) => agentRegistry.getAgent(name);
export const getBot = (name) => agentRegistry.getBot(name);
export const getFirstBot = () => agentRegistry.getFirstBot();
export const getBotForExecutor = (name) => agentRegistry.getBotForExecutor(name);