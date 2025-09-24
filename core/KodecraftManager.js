import { KodecraftControlPanel } from './KodecraftControlPanel.js';
import { KodecraftAgentHandler } from './KodecraftAgentHandler.js';
import HierarchicalBotManager from './HierarchicalBotManager.js';
import { existsSync, readFileSync } from 'fs';

export class KodecraftManager {
    static config;
    static agentHandler;
    static controlPanel;
    static hierarchicalBotManager;

    static async init(config) {
        this.config = config;

        // Initialize agent handler
        this.agentHandler = new KodecraftAgentHandler(config);

        // Initialize hierarchical bot manager first. We'll update its agentConnections after the control panel is created.
        this.hierarchicalBotManager = new HierarchicalBotManager(
            this.agentHandler,
            {} // placeholder; updated below once control panel is started
        );

        console.log('[KodecraftManager] Hierarchical bot manager initialized');

        // Initialize control panel with hierarchical bot manager
        this.controlPanel = new KodecraftControlPanel(config, this.agentHandler, this.hierarchicalBotManager);
        await this.controlPanel.startServer();

        // Update hierarchical bot manager with real agent connections
        this.hierarchicalBotManager.agentConnections = this.controlPanel.agentConnections;

        // Expose global references for bot management commands
        global.kodecraftAgentHandler = this.agentHandler;
        // Expose hierarchical bot manager
        global.kodecraftHierarchicalBotManager = this.hierarchicalBotManager;
        // Also expose with shorter name for backward compatibility
        global.hierarchicalBotManager = this.hierarchicalBotManager;
        global.kodecraftAgentConnections = () => this.controlPanel.agentConnections;

        console.log('[KodecraftManager] Global references exposed:', {
            agentHandler: !!global.kodecraftAgentHandler,
            agentConnections: !!global.kodecraftAgentConnections,
            hierarchicalBotManager: !!global.kodecraftHierarchicalBotManager,
            hierarchicalBotManagerShort: !!global.hierarchicalBotManager
        });

        // Setup chat monitoring for task completion
        this.hierarchicalBotManager.setupChatMonitoring();

        // Setup agents
        let agentCount = 0;
        for (let profilePath of config.profiles || []) {
            const success = this._loadAndRegisterAgent(profilePath);
            if (success) agentCount++;
        }

        if (agentCount > 0) {
            console.log(`${agentCount} agent(s) started up successfully.`);
        } else {
            console.warn('No agent profiles were loaded or started.');
        }
    }

    static _loadAndRegisterAgent(profilePath) {
        if (!existsSync(profilePath)) {
            console.error(`Profile file not found: ${profilePath}`);
            return false;
        }

        console.log(`Loading agent profile: ${profilePath}`);

        try {
            const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
            const settings = { ...this.config, profile };
            const agent = this.agentHandler.createAgent(settings);

            if (agent) {
                console.log(`Agent '${agent.name}' created and registered.`);
                this.controlPanel.registerAgent(agent);
                return true;
            } else {
                console.warn(`Agent from profile '${profilePath}' was not created.`);
                return false;
            }
        } catch (err) {
            console.error(`Failed to load or parse agent profile at ${profilePath}:`, err);
            return false;
        }
    }
}