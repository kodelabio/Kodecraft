 // To create new bots dynamically through the web interface

 import { writeFileSync, existsSync } from 'fs';
 import path from 'path';
 import { projectRoot } from '../paths.js';

 export class BotCreator {
     constructor(agentHandler) {
         this.agentHandler = agentHandler;
     }

     // Creating a bot
     createBot(botData) {
         try {
             // Validate required fields
             if (!botData || !botData.name || botData.name.trim() === '') {
                 return { success: false, error: 'Bot name is required' };
             }

             const botName = botData.name.trim();

             // Check if bot already exists
             if (this.agentHandler.hasAgent(botName)) {
                 return { success: false, error: `Bot '${botName}' already exists` };
             }

             // Create bot profile
             const profile = this.generateBotProfile(botData);

             // Create agent settings with required values
             const agentSettings = {
                 // Copy all settings from the main config
                 ...(this.agentHandler.config || {}),
                 // Override with bot-specific settings
                 profile: profile,
                 load_memory: !!botData.loadMemory,
                 init_message: botData.initMessage || null,
                 // Add required settings that the agent expects
                 base_profile: (this.agentHandler.config && this.agentHandler.config.base_profile) || "survival",
                 blocked_actions: (this.agentHandler.config && this.agentHandler.config.blocked_actions) || [],
                 task: (this.agentHandler.config && this.agentHandler.config.task) || null,
                 max_messages: (this.agentHandler.config && this.agentHandler.config.max_messages) || 15,
                 num_examples: (this.agentHandler.config && this.agentHandler.config.num_examples) || 2,
                 max_commands: (this.agentHandler.config && this.agentHandler.config.max_commands) || -1,
                 verbose_commands: (this.agentHandler.config && this.agentHandler.config.verbose_commands) !== false,
                 narrate_behavior: (this.agentHandler.config && this.agentHandler.config.narrate_behavior) !== false,
                 chat_bot_messages: (this.agentHandler.config && this.agentHandler.config.chat_bot_messages) !== false,
                 log_all_prompts: (this.agentHandler.config && this.agentHandler.config.log_all_prompts) || false,
                 allow_insecure_coding: (this.agentHandler.config && this.agentHandler.config.allow_insecure_coding) || false,
                 allow_vision: (this.agentHandler.config && this.agentHandler.config.allow_vision) || false,
                 code_timeout_mins: (this.agentHandler.config && this.agentHandler.config.code_timeout_mins) || -1,
                 relevant_docs_count: (this.agentHandler.config && this.agentHandler.config.relevant_docs_count) || 5
             };

             // Save to file if requested
             if (botData.saveToFile) {
                 const success = this.saveBotProfile(botName, profile);
                 if (!success) {
                     return { success: false, error: 'Failed to save bot profile to file' };
                 }
             }

             // Create the agent
             const result = this.agentHandler.createAgent(agentSettings);

             if (result) {
                 return {
                     success: true,
                     message: `Bot '${botName}' created successfully`,
                     botName: botName,
                     settings: agentSettings
                 };
             } else {
                 return { success: false, error: 'Failed to create bot agent' };
             }

             if (result) {
                 return {
                     success: true,
                     message: `Bot '${botName}' created successfully`,
                     botName: botName
                 };
             } else {
                 return { success: false, error: 'Failed to create bot agent' };
             }

         } catch (error) {
             console.error('Error creating bot:', error);
             return { success: false, error: 'Internal error creating bot: ' + (error && error.message ? error.message : String(error)) };
         }
     }


    // Generate a bot profile from the provided data
     generateBotProfile(botData) {
         const profile = {
             name: (botData && botData.name) ? botData.name.trim() : 'Unnamed Bot',
             model: {
                 model: "gpt-4o",
                 params: {
                     temperature: 0.5
                 }
             },
             personality: (botData && botData.personality) || "You are a helpful Minecraft bot assistant.",
             goals: [
                 "Help players with tasks",
                 "Follow instructions carefully",
                 "Be friendly and helpful"
             ],
             modes: {
                 self_preservation: true,
                 code_execution: false,
                 auto_eat: true,
                 auto_sleep: true
             },
             conversation_examples: [
                 [
                     {
                         role: "user",
                         content: "greg: build a house"
                     },
                     {
                         role: "assistant",
                         content: "I'll help you build a house! Let me gather some materials first."
                     }
                 ]
             ]
         };

         // Add custom goals if provided
         if (botData && botData.customGoals && Array.isArray(botData.customGoals)) {
             profile.goals = [...profile.goals, ...botData.customGoals];
         }

         return profile;
     }

      // Save bot profile to a JSON file

     saveBotProfile(botName, profile) {
         try {
             const profilesDir = path.join(projectRoot, 'profiles');
             const filename = `${botName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`;
             const filepath = path.join(profilesDir, filename);

             // Check if file already exists
             if (existsSync(filepath)) {
                 console.warn(`Profile file ${filename} already exists, skipping save`);
                 return false;
             }

             // Write profile to file
             writeFileSync(filepath, JSON.stringify(profile, null, 2));
             console.log(`Bot profile saved to: ${filepath}`);
             return true;

         } catch (error) {
             console.error('Error saving bot profile:', error);
             return false;
         }
     }


      // Get a list of available bot templates

     getBotTemplates() {
         return [
             {
                 name: "Helper Bot",
                 personality: "You are a helpful assistant bot who loves to help with building and gathering resources.",
                 goals: ["Help with construction", "Gather materials", "Follow building instructions"]
             },
             {
                 name: "Guard Bot",
                 personality: "You are a protective guard bot who watches over areas and defends against threats.",
                 goals: ["Protect designated areas", "Watch for hostile mobs", "Alert players to dangers"]
             },
             {
                 name: "Farmer Bot",
                 personality: "You are a farming specialist bot who loves growing crops and managing farms.",
                 goals: ["Maintain crops", "Harvest when ready", "Replant automatically"]
             },
             {
                 name: "Explorer Bot",
                 personality: "You are an adventurous explorer bot who loves discovering new places and mapping areas.",
                 goals: ["Explore new territories", "Map interesting locations", "Report findings"]
             }
         ];
     }
 }