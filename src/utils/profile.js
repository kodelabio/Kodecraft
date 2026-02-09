// src/agent/profile_utils.js
import { readFileSync } from 'fs';
import settings from '../agent/settings.js';

export async function switchAgentProfile(agent, profileName) {
    try {
        // Find profile path
        const profilePath = settings.profiles.find(p => 
            p.includes(profileName)
        ) || profileName;
        
        // Reload profile from file
        const fileContent = readFileSync(profilePath, 'utf8');
        const newProfile = JSON.parse(fileContent);
        
        // Update agent's profile settings
        agent.profile = newProfile;
        agent.model = newProfile.model;
        agent.code_model = newProfile.code_model;
        agent.vision_model = newProfile.vision_model;
        
        // Reinitialize models with new profile config
        if (agent.prompter?.models?.main) {
            agent.prompter.models.main = newProfile.model;
        }
        if (agent.coder?.models?.main) {
            agent.coder.models.main = newProfile.code_model;
        }
        
        settings.profile = profilePath;
        console.log(`[Profile] Switched to: ${profilePath}`);
        
        return { success: true, profile: profilePath };
    } catch (error) {
        console.error(`[Profile] Failed to switch: ${error.message}`);
        return { success: false, error: error.message };
    }
}