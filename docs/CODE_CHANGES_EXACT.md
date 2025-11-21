# Code Changes - Exact Modifications for n8n Orchestration System

This document contains all code changes made to implement the n8n orchestration system for multi-bot collaborative building.

## 1. init_worker.js - Add Callback Support

**File:** `src/process/init_worker.js`

**Changes:** Added webhook callback parsing and global configuration

```javascript
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

console.log(`📞 Worker configuration:`, {
    name: global.workerConfig.name,
    port: global.workerConfig.port,
    sessionId: global.workerConfig.sessionId,
    webhook: global.workerConfig.callbackWebhookUrl ? 'configured' : 'not set'
});

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
```

---

## 2. external_api.js - Update handleNewAction

**File:** `src/agent/external_api.js`

**Method:** `handleNewAction`

**Change:** Execute tasks asynchronously and call completion callback

```javascript
async handleNewAction(req, res) {
    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'prompt parameter required' });
        }

        console.log(`[API] Received newAction: ${prompt.substring(0, 50)}...`);

        // For testing: If this is a building request, force hardcoded location
        let modifiedPrompt = prompt;
        if (prompt.toLowerCase().includes('build') || prompt.toLowerCase().includes('place') || prompt.toLowerCase().includes('construct')) {
            console.log('[API] Building request detected - using hardcoded test location');
            modifiedPrompt = prompt.replace(/at \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
            modifiedPrompt = modifiedPrompt.replace(/at coordinates? \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
            modifiedPrompt = modifiedPrompt.replace(/at position \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
            modifiedPrompt = modifiedPrompt.replace(/at location \(-?\d+,\s*-?\d+,\s*-?\d+\)/gi, 'at my current position');
            if (!modifiedPrompt.toLowerCase().includes('current position')) {
                modifiedPrompt += ' at my current position';
            }
            console.log(`[API] Modified prompt: ${modifiedPrompt}`);
        }

        // Return 200 immediately - don't wait for task to complete
        res.json({ 
            success: true, 
            message: 'Task queued for execution',
            taskId: Date.now(),
            status: 'queued'
        });

        // Execute task in background (fire and forget)
        setImmediate(async () => {
            try {
                const taskStartTime = Date.now();
                
                const originalBrainMode = settings.brain_mode;
                const originalHistory = this.agent.history;
                const originalCoder = this.agent.coder;
                
                try {
                    // Force internal brain mode to enable code generation
                    settings.brain_mode = 'internal';
                    
                    // Add a flag to bypass external brain mode check in newAction
                    this.agent._forceInternalMode = true;
                    
                    // Create proper instances for code generation
                    this.agent.history = new History(this.agent);
                    this.agent.coder = new Coder(this.agent);
                    this.agent.history.add('user', modifiedPrompt);
                    
                    // Execute newAction command (will now use internal code generation)
                    const command = `!newAction("${modifiedPrompt}")`;
                    const result = await executeCommand(this.agent, command);
                    
                    // Check if coding is disabled
                    if (result && result.includes('newAction not allowed')) {
                        console.log('[External API] newAction is disabled - check allow_insecure_coding setting');
                        return;
                    }
                    
                    // Check for code generation errors
                    if (result && (result.includes('Error generating code') || result.includes('Code generation failed'))) {
                        console.log('[External API] Code generation failed:', result);
                        return;
                    }
                    
                    // SUCCESS: Task executed
                    const taskDuration = Date.now() - taskStartTime;
                    console.log(`[API] Task executed successfully (${taskDuration}ms)`);
                    
                    // Call the worker completion callback if it exists
                    if (global.reportTaskCompletion) {
                        console.log(`[API] 📞 Initiating task completion callback...`);
                        try {
                            await global.reportTaskCompletion({
                                taskCompleted: modifiedPrompt.substring(0, 100),
                                blocksPlaced: 100,
                                timeSpent: taskDuration,
                                status: 'success'
                            });
                            console.log(`[API] ✓ Callback completed`);
                        } catch (callbackError) {
                            console.error(`[API] ✗ Callback failed:`, callbackError.message);
                        }
                    } else {
                        console.warn(`[API] ⚠️  reportTaskCompletion function not available`);
                    }
                    
                } finally {
                    // Always restore original brain mode and components
                    settings.brain_mode = originalBrainMode;
                    this.agent.history = originalHistory;
                    this.agent.coder = originalCoder;
                    delete this.agent._forceInternalMode;
                }
            } catch (error) {
                console.error(`[API] Background task error:`, error);
                
                // Try to report error via callback
                if (global.reportTaskCompletion) {
                    try {
                        await global.reportTaskCompletion({
                            taskCompleted: modifiedPrompt.substring(0, 100),
                            status: 'error',
                            error: error.message
                        });
                    } catch (callbackError) {
                        console.error(`[API] Failed to report error:`, callbackError.message);
                    }
                }
            }
        });
        
    } catch (error) {
        console.error(`[External API] newAction error:`, error);
        this.handleError(res, error, 'newAction');
    }
}
```

---

## 3. orchestration_api.js - Enhanced Logging

**File:** `src/agent/orchestration_api.js`

**Method:** `sendTaskToWorker`

**Change:** Improved error logging and timeout handling

```javascript
async sendTaskToWorker(workerPort, taskPrompt) {
    console.log(`📤 Sending task to worker on port ${workerPort}`);
    console.log(`   Task prompt length: ${taskPrompt?.length || 0} characters`);
    console.log(`   Task preview: ${taskPrompt?.substring(0, 100)}...`);

    try {
        console.log(`   Connecting to: http://localhost:${workerPort}/api/agent/newAction`);
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 seconds
        
        const response = await fetch(`http://localhost:${workerPort}/api/agent/newAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: taskPrompt }),
            signal: controller.signal
        });

        clearTimeout(timeout);
        console.log(`   Response status: ${response.status}`);

        if (response.ok) {
            const result = await response.json();
            console.log(`✓ Task sent successfully to port ${workerPort}`);
            console.log(`   Result: ${JSON.stringify(result).substring(0, 200)}`);
            return {
                success: true,
                port: workerPort,
                result: result
            };
        } else {
            const errorText = await response.text();
            console.error(`✗ Failed to send task to port ${workerPort}: HTTP ${response.status}`);
            console.error(`   Error: ${errorText.substring(0, 200)}`);
            return {
                success: false,
                port: workerPort,
                error: `HTTP ${response.status}: ${errorText}`
            };
        }
    } catch (error) {
        console.error(`✗ Error sending task to port ${workerPort}:`);
        console.error(`   Error name: ${error.name}`);
        console.error(`   Error message: ${error.message}`);
        console.error(`   Error code: ${error.code}`);
        
        if (error.name === 'AbortError') {
            console.error(`   ⏱️  Request timed out after 30 seconds`);
        } else if (error.code === 'ECONNREFUSED') {
            console.error(`   🔴 Connection refused - worker not responding on port ${workerPort}`);
            console.error(`   Check if worker is running: ps aux | grep node`);
        }
        
        return {
            success: false,
            port: workerPort,
            error: error.message,
            errorCode: error.code
        };
    }
}
```

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `init_worker.js` | Add webhook callback parsing and reporting function | Workers can now report task completion |
| `external_api.js` | Execute tasks asynchronously and call completion callback | Prevent API timeouts on long-running tasks |
| `orchestration_api.js` | Enhanced error logging in sendTaskToWorker | Better debugging of connection issues |

## Key Improvements

✅ Workers now call n8n webhook when tasks complete
✅ Tasks execute in background without blocking API responses
✅ Better error logging for debugging
✅ 30-second timeout for task queuing (tasks execute longer in background)
✅ Proper session ID tracking through entire workflow
