import { KodecraftControlPanel } from './KodecraftControlPanel.js';
import { KodecraftAgentHandler } from './KodecraftAgentHandler.js';
import { CollaborativeManager } from '../src/collaborative/CollaborativeManager.js';
import { existsSync, readFileSync } from 'fs';

export class KodecraftManager {
    static config;
    static agentHandler;
    static controlPanel;
    static collaborativeManager;

    static async init(config) {
        this.config = config;

        this.agentHandler = new KodecraftAgentHandler(config);
        
        // Initialize collaborative manager
        this.collaborativeManager = new CollaborativeManager(this, this.agentHandler);
        
        // Set global reference for agents to access
        global.kodecraftCollaborativeManager = this.collaborativeManager;
        console.log('Collaborative manager set up and global reference created');

        this.controlPanel = new KodecraftControlPanel(config, this.agentHandler);
        // Pass reference to this manager so control panel can access collaborative manager
        this.controlPanel.kodecraftManager = this;
        await this.controlPanel.startServer();

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