# Task Assignment and Blueprint Building Implementation

## Overview

This document describes the implementation of a task assignment system that enables both leader and worker agents to build structures from blueprints in a collaborative, orchestrated manner. The system uses n8n workflows to coordinate multi-agent construction tasks while supporting single-agent execution.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    n8n Workflows                        │
│         (Orchestration & Task Assignment)              │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ HTTP Requests
                 ▼
┌─────────────────────────────────────────────────────────┐
│              ExternalAPI (Leader Bot)                   │
│  - POST /api/agent/task (Assign task to agent)         │
│  - POST /api/orchestration/assign-build-task           │
│    (Assign task to multiple workers)                    │
└────────────────┬────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
   ┌─────────┐      ┌─────────┐
   │ Leader  │      │ Worker  │
   │ :5000   │      │ :6001   │
   └─────────┘      └─────────┘
        │                │
        └────────┬───────┘
                 ▼
        Minecraft Server
```

## Implementation Details

### 1. Task Data Structure

Tasks are stored in JSON files (e.g., `tasks/construction_tasks/custom/tasks.json`):

```json
{
  "pyramid": {
    "type": "construction",
    "goal": "Make a structure with the blueprint below",
    "conversation": "Let's share materials and make a pyramid",
    "agent_count": 1,
    "blueprint": {
      "levels": [
        {
          "level": 0,
          "coordinates": [-60, -60, 6],
          "placement": [
            ["polished_granite", "gold_block", "stone_bricks", ...],
            ["gold_block", "stone_bricks", "polished_andesite", ...],
            ...
          ]
        },
        ...
      ]
    }
  }
}
```

**Key Fields:**
- `type`: Task category (construction, mining, etc.)
- `goal`: High-level objective description
- `blueprint`: Multi-level 2D grid structure with block placements
- `agent_count`: Number of agents required
- `conversation`: Optional dialogue for multi-agent tasks

### 2. Task Assignment Endpoint

#### Endpoint: `POST /api/agent/task`

Assigns a task to the current agent (leader or worker).

**Request Body:**
```json
{
  "taskPath": "tasks/construction_tasks/custom/tasks.json",
  "taskId": "pyramid",
  "profile": "claude_builder.json"
}
```

**Response:**
```json
{
  "success": true,
  "taskId": "pyramid",
  "agentCount": 1,
  "message": "Task pyramid queued for execution"
}
```

**Implementation Flow:**

```javascript
async handleAssignTask(req, res) {
    // 1. Validate input
    const { taskPath, taskId, profile } = req.body;
    
    // 2. Load task JSON
    const taskFile = fs.readFileSync(taskPath, 'utf-8');
    const taskConfig = JSON.parse(taskFile);
    const taskData = taskConfig[taskId];
    
    // 3. Return immediately (202 Accepted)
    res.status(202).json({ success: true, taskId, ... });
    
    // 4. Execute in background
    setImmediate(async () => {
        // Switch profile if provided
        if (profile) {
            await switchAgentProfile(agent, profile);
        }
        
        // Create and initialize task
        agent.task = new Task(agent, taskData, Date.now());
        agent.task.updateAvailableAgents([agent.name]);
        await agent.task.initBotTask();
        
        // Wait for completion
        while (!agent.task.isDone()) {
            await new Promise(r => setTimeout(r, 2000));
        }
    });
}
```

**Key Features:**
- Non-blocking: Returns immediately while executing task in background
- Profile switching: Optionally use a different AI profile for building
- Auto-cleanup: Restores original state after task completion

### 3. Orchestration Assignment

#### Endpoint: `POST /api/orchestration/assign-build-task`

Assigns the same task to multiple worker agents in a session.

**Request Body:**
```json
{
  "sessionId": "spawn_1770637144710",
  "taskPath": "tasks/construction_tasks/custom/tasks.json",
  "taskId": "pyramid",
  "agents": ["Worker_1", "Worker_2"],
  "profile": "claude_builder.json"
}
```

**Parameters:**
- `sessionId`: Orchestration session ID (required)
- `taskPath`: Path to task JSON file (required)
- `taskId`: Task identifier (required)
- `agents`: Specific worker names to assign (optional, uses first N if omitted)
- `profile`: AI profile to use (optional)

**Response:**
```json
{
  "success": true,
  "sessionId": "spawn_1770637144710",
  "taskId": "pyramid",
  "workersAssigned": 2,
  "message": "Task pyramid assigned to Worker_1, Worker_2"
}
```

**Implementation:**

```javascript
async handleOrchestrationAssignBuildTask(req, res) {
    const { sessionId, taskPath, taskId, agents, profile } = req.body;
    
    // Get session and select target workers
    const session = this.orchestration.buildSessions.get(sessionId);
    let targetWorkers;
    
    if (agents && Array.isArray(agents)) {
        targetWorkers = session.workers.filter(w => agents.includes(w.name));
    } else {
        const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'))[taskId];
        targetWorkers = session.workers.slice(0, taskData.agent_count || 1);
    }
    
    // Return immediately
    res.status(202).json({ success: true, ... });
    
    // Assign to each worker
    setImmediate(async () => {
        for (const worker of targetWorkers) {
            const result = await assignBuildTaskToWorkers(
                sessionId, taskPath, taskId, [worker], profile
            );
        }
    });
}
```

### 4. Task Execution

#### Task Class Initialization

The `Task` class initializes the build:

```javascript
constructor(agent, taskData, startTime) {
    this.agent = agent;
    this.data = taskData;
    this.startTime = startTime;
    this.task_id = taskData.task_id;
    
    // Create blueprint if construction task
    if (taskData.type === 'construction' && taskData.blueprint) {
        this.blueprint = new Blueprint(taskData.blueprint);
        
        // Append blueprint explanation to goal
        const explanation = this.blueprint.explain();
        this.data.goal += "\n" + explanation + 
            "\nmake sure to place the lower levels of the blueprint first";
    }
}

async initBotTask() {
    // Get available agents
    this.agent.task = this;
    const agents = this.agent.game.players;
    
    // Skip teleport for orchestrated workers
    if (!this.data.require_teleport) {
        console.log('[Task] Skipping teleport - workers pre-positioned');
    } else {
        await this.teleportAgents();
    }
    
    // Set initial inventory
    await this.setInventory();
    
    // Start self-prompting with goal
    await executeCommand(this.agent, `!goal("${this.data.goal}")`);
}
```

#### Blueprint Class

The `Blueprint` class represents the multi-level structure:

```javascript
class Blueprint {
    constructor(blueprintData) {
        this.data = blueprintData;
        this.levels = blueprintData.levels;
    }
    
    explain() {
        // Generate human-readable level descriptions
        let explanation = '';
        for (const level of this.levels) {
            explanation += `Level ${level.level}: Start at coordinates X: ${level.coordinates[0]}, Y: ${level.coordinates[1]}, Z: ${level.coordinates[2]}`;
        }
        return explanation;
    }
    
    autoBuild() {
        // Generate /setblock commands for all levels
        const commands = [];
        for (const level of this.levels) {
            const baseX = level.coordinates[0];
            const baseY = level.coordinates[1];
            const baseZ = level.coordinates[2];
            const placement = level.placement;
            
            for (let z = 0; z < placement.length; z++) {
                for (let x = 0; x < placement[z].length; x++) {
                    const blockType = placement[z][x];
                    if (blockType) {
                        commands.push(
                            `/setblock ${baseX + x} ${baseY} ${baseZ + z} ${blockType}`
                        );
                    }
                }
            }
        }
        return { commands, nearbyPosition: {...} };
    }
    
    check(bot) {
        // Validate blocks match blueprint
        const mismatches = [];
        const matches = [];
        // ... comparison logic
        return { matches, mismatches };
    }
}
```

### 5. Self-Prompting Loop

Once a task is initialized with a goal, the agent self-prompts:

```
System: "You are self-prompting with the goal: 'Make a structure with the blueprint below...'"

Agent Loop:
1. AI generates command (e.g., !inventory, !autoBuild, !endGoal)
2. Command executes
3. Result added to conversation history
4. AI generates next command
5. Repeat until !endGoal or timeout
```

### 6. Building with `!autoBuild`

The `!autoBuild` command executes the actual block placement. **Critical difference for workers:**

**Leader Bot (has op rights):**
```javascript
// Can use chat commands
await agent.bot.chat(`/setblock ${x} ${y} ${z} ${blockType}`);
```

**Worker Bot (no op rights):**
```javascript
// Must use native bot API
const skills = await import('../library/skills.js');
await skills.placeBlock(agent.bot, blockType, x, y, z);
```

**Implementation:**

```javascript
{
    name: '!autoBuild',
    perform: runAsAction(async (agent) => {
        const result = agent.task.blueprint.autoBuild();
        const commands = result.commands;
        
        console.log(`[autoBuild] Generated ${commands.length} commands`);
        
        const skills = await import('../library/skills.js');
        let blocksPlaced = 0;
        
        for (const command of commands) {
            // Parse: /setblock x y z blockType
            const parts = command.split(/\s+/);
            if (parts[0] === '/setblock' && parts.length >= 5) {
                const x = parseInt(parts[1]);
                const y = parseInt(parts[2]);
                const z = parseInt(parts[3]);
                const blockType = parts[4];
                
                // Use bot API instead of chat
                await skills.placeBlock(agent.bot, blockType, x, y, z);
                blocksPlaced++;
                
                if (blocksPlaced % 50 === 0) {
                    console.log(`[autoBuild] Placed ${blocksPlaced}/${commands.length}`);
                }
                
                await new Promise(r => setTimeout(r, 75));
            }
        }
        
        return `Auto-build complete! Placed ${blocksPlaced} blocks.`;
    })
}
```

### 7. Profile Switching

Agents can use different AI profiles for different task types:

**Profile Utility:**

```javascript
// src/agent/profile_utils.js
export async function switchAgentProfile(agent, profileName) {
    const profilePath = settings.profiles.find(p => p.includes(profileName));
    const fileContent = readFileSync(profilePath, 'utf8');
    const newProfile = JSON.parse(fileContent);
    
    // Update agent's model configuration
    agent.profile = newProfile;
    agent.model = newProfile.model;
    agent.code_model = newProfile.code_model;
    agent.vision_model = newProfile.vision_model;
    
    // Reinitialize models
    if (agent.prompter?.models?.main) {
        agent.prompter.models.main = newProfile.model;
    }
    if (agent.coder?.models?.main) {
        agent.coder.models.main = newProfile.code_model;
    }
    
    settings.profile = profilePath;
    return { success: true, profile: profilePath };
}
```

**Usage in Task Assignment:**

```javascript
if (req.body.profile) {
    await switchAgentProfile(this.agent, req.body.profile);
}
```

### 8. Task Validation

The validation loop tracks progress:

```javascript
validate() {
    let result = this.blueprint.check(this.agent.bot);
    
    if (result.mismatches.length === 0) {
        console.log('Task is complete');
        return { "valid": true, "score": 100 };
    }
    
    let total_blocks = result.mismatches.length + result.matches.length;
    let score = (result.matches.length / total_blocks) * 100;
    
    // Log less frequently (every 2 seconds)
    const now = Date.now();
    if (!this._lastScoreLog) this._lastScoreLog = 0;
    
    if (now - this._lastScoreLog >= 2000) {
        console.log(`Task score: ${score}%`);
        this._lastScoreLog = now;
    }
    
    return { "valid": false, "score": score };
}
```

## Workflow Example: Multi-Worker Build

### n8n Workflow Steps

1. **Spawn Workers**
   ```
   POST /api/orchestration/spawn-worker
   Body: { name: "Worker_1", port: 6001, sessionId: "build_123" }
   ```

2. **Wait for Ready**
   ```
   POST /api/orchestration/wait-workers
   Body: { workers: [{ name: "Worker_1", port: 6001 }], timeoutMs: 30000 }
   ```

3. **Register to Session**
   ```
   POST /api/orchestration/register-workers
   Body: { sessionId: "build_123", workers: [{ name: "Worker_1", port: 6001 }] }
   ```

4. **Assign Build Task**
   ```
   POST /api/orchestration/assign-build-task
   Body: {
       sessionId: "build_123",
       taskPath: "tasks/construction_tasks/custom/tasks.json",
       taskId: "pyramid",
       profile: "claude_builder.json"
   }
   ```

5. **Monitor Progress** (Optional)
   ```
   GET /api/orchestration/status
   Returns task scores and worker status
   ```

6. **Cleanup**
   ```
   POST /api/orchestration/stop-all
   Terminates all workers
   ```

## Key Design Decisions

### 1. Non-Blocking Task Execution

Tasks return immediately (HTTP 202) and execute in the background:
- **Benefit**: n8n workflows don't timeout waiting for long builds
- **Trade-off**: No real-time completion notification (can poll status endpoint)

### 2. Worker Profile Support

Workers can use different AI profiles than the leader:
- **Benefit**: Optimized prompts for different task types
- **Example**: `claude_builder.json` for construction, `claude_miner.json` for mining

### 3. Bot API for Workers

Workers use `skills.placeBlock()` instead of `/setblock` chat commands:
- **Benefit**: Works without op rights
- **Trade-off**: Slightly slower than chat commands (50-100ms per block)

### 4. Blueprint-Driven Building

Agent self-prompts from blueprint explanation:
- **Benefit**: Agent can adapt to unexpected situations
- **Trade-off**: Less predictable than scripted building

### 5. Orchestration Layer

Pure orchestration via REST API without modifying core agent code:
- **Benefit**: Non-invasive, can be added to existing systems
- **Trade-off**: Extra HTTP overhead for each operation

## Error Handling

### Connection Drops

If a worker disconnects during task execution:
- Task fails with error state
- n8n workflow can retry by spawning a new worker
- Previous progress is lost (tasks are not resumable)

### Timeout Handling

Task polling uses configurable timeout:
```javascript
const maxWaitTime = 5 * 60 * 1000; // 5 minutes
while (!this.agent.task.isDone()) {
    if (Date.now() - startTime > maxWaitTime) {
        console.error('[Task] Task execution timeout');
        break;
    }
    await new Promise(r => setTimeout(r, 2000));
}
```

### Blueprint Validation

The `check()` method detects mismatches:
- Wrong block type
- Missing blocks
- Extra blocks
- Score tracks percentage complete

## Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Spawn worker | 1-2s | Process creation + bot login |
| Wait for ready | 3-5s | Health endpoint polling |
| Register workers | <100ms | Memory operation |
| Assign task | <500ms | HTTP + file I/O |
| Block placement | 50-100ms | Per block with delay |
| 500-block build | 25-50s | Includes AI decision time |

## Limitations & Future Work

### Current Limitations

1. **No task resumption** - Workers that disconnect lose progress
2. **No task sharing** - Each worker builds entire task
3. **No dynamic load balancing** - n8n must manage worker allocation
4. **Sequential execution** - Tasks execute one at a time per worker

### Future Enhancements

1. **Task Decomposition**: Break large builds into stages, assign different workers to different stages
2. **Checkpoint System**: Save progress periodically for resumable tasks
3. **Collaborative Building**: Multiple workers build different parts of same structure
4. **Performance Optimization**: Cache parsed commands, batch API calls
5. **Monitoring Dashboard**: Real-time visualization of build progress
6. **Task History**: Log and replay completed tasks

## Troubleshooting

### Worker Disconnects During Build

**Symptoms**: `[ExternalAPI] Bot disconnected - kicking all workers`

**Causes**:
- Server overload from rapid commands
- Network connectivity issues
- Minecraft server restart

**Solution**:
- Increase delay between commands: `await new Promise(r => setTimeout(r, 150))`
- Reduce block count per task
- Check server logs for errors

### Task Never Completes

**Symptoms**: Task score stuck at same percentage

**Causes**:
- Blueprint validation error
- Agent stuck in loop
- Timeout too short

**Solution**:
- Check `task.blueprint.check()` implementation
- Increase polling timeout: `maxWaitTime = 10 * 60 * 1000`
- Review task goal clarity

### Profile Not Switching

**Symptoms**: Wrong AI model used for task

**Causes**:
- Profile file not found
- Path mismatch

**Solution**:
- Verify profile exists: `ls -la profiles/`
- Check `settings.profiles` array
- Ensure profile name matches file name

## Conclusion

The task assignment system provides a flexible, orchestration-friendly way to assign blueprint building tasks to both leader and worker agents. By leveraging self-prompting, profile switching, and API-based coordination, it enables scalable multi-agent construction while maintaining compatibility with the existing codebase.

The key insight is using the bot's native API for workers (no op rights) while supporting chat commands for leaders (with op rights), enabling the same task type to work across different agent types.
