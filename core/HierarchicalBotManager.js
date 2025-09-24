class HierarchicalBotManager {
    constructor(agentHandler = null, agentConnections = {}) {
    this.managedWorkers = new Map();
    this.taskAssignments = new Map();
    this.taskCounter = 0;
    this.sharedWorkspaces = new Map();
    this.coordinationData = new Map();
    this.workerCoordination = new Map();
    this.phaseTracker = new Map();
    this.inspectionQueue = new Map();
    this.blockingRequests = new Map(); // Track move requests
    this.codeRetryCount = new Map(); // Track code retry attempts

    this.agentHandler = agentHandler;
    this.agentConnections = agentConnections;

    this.setupChatMonitoring();
    }

    // Enhanced task analysis with better coordination requirements
    analyzeTask(taskDescription) {
    const task = taskDescription.toLowerCase();

    let taskType = 'general';
    if (task.includes('build') || task.includes('construct') || task.includes('house') || task.includes('tower') || task.includes('wall')) {
    taskType = 'building';
    } else if (task.includes('mine') || task.includes('dig') || task.includes('excavate')) {
    taskType = 'mining';
    } else if (task.includes('farm') || task.includes('plant') || task.includes('harvest') || task.includes('crop')) {
    taskType = 'farming';
    } else if (task.includes('gather') || task.includes('collect') || task.includes('find')) {
    taskType = 'gathering';
    }

    let needsWorkers = false;
    let recommendedWorkers = 1;

    if (taskType === 'building') {
    if (task.includes('house') || task.includes('castle') || task.includes('tower') ||
    task.includes('wall') || task.includes('bridge') || task.includes('structure') ||
    task.includes('large') || task.includes('big') || task.match(/\d+x\d+/) ||
    task.match(/length\s*\d+/) || task.match(/height\s*\d+/) || task.match(/\d+\s*(blocks?|long|high|tall)/)) {
    needsWorkers = true;
    recommendedWorkers = 3;
    }
    }

    if (taskType === 'mining') {
    if (task.includes('large') || task.includes('tunnel') || task.includes('quarry')) {
    needsWorkers = true;
    recommendedWorkers = 2;
    }
    }

    const workerMatch = task.match(/(\d+)\s*(worker|bot|helper)/);
    if (workerMatch) {
    needsWorkers = true;
    recommendedWorkers = Math.min(parseInt(workerMatch[1]), 5);
    }

    return {
    originalTask: taskDescription,
    taskType: taskType,
    needsWorkers: needsWorkers,
    recommendedWorkers: recommendedWorkers,
    complexity: needsWorkers ? 'complex' : 'simple'
    };
    }

    // Enhanced worker spawning with better initialization
    async spawnWorkerBot(botName, botType, leaderName) {
    try {
    const agentConnections = global.kodecraftAgentConnections ? global.kodecraftAgentConnections() : {};
    const leaderConnection = agentConnections && agentConnections[leaderName];

    if (leaderConnection && leaderConnection.socket) {
    console.log('[HierarchicalBot] Spawning ' + botName + ' near ' + leaderName);
    }

    const botSettings = {
    minecraft_version: "1.21.4",
    host: "127.0.0.1",
    port: 55916,
    auth: "offline",
    base_profile: "creative",
    load_memory: false,
    init_message: `You are ${botName}, a ${botType} worker bot. CRITICAL RULES:
1. ALWAYS use LLM (gpt-4o) to generate VALID, LINT-FREE code
2. NEVER use floating promises - always use 'await' with async functions
3. NEVER break permanent structure blocks - use dirt scaffolding only
4. If blocked by another bot, chat "Please move aside from [x,y,z], ${botName}" and WAIT
5. Follow phase instructions EXACTLY - complete each step before announcing
6. Use !newAction() for all building tasks with detailed descriptions
7. Announce phases ONLY after completion: 'FOUNDATION COMPLETE', 'WALLS COMPLETE', etc.
8. Coordinate via chat - listen for announcements from other bots
9. If code fails, retry with FIXED version using LLM
10. NEVER skip steps or announce prematurely`,
    speak: false,
    language: "en",
    render_bot_view: true,
    allow_insecure_coding: true,
    allow_vision: true,
    blocked_actions: [],
    code_timeout_mins: -1,
    relevant_docs_count: 7,
    max_messages: 20,
    num_examples: 3,
    max_commands: -1,
    verbose_commands: true,
    narrate_behavior: true,
    chat_bot_messages: true,
    log_all_prompts: false,
    only_chat_with: [],
    profile: {
    name: botName,
    model: "gpt-4o",
    description: `A specialized ${botType} worker bot managed by ${leaderName}. Uses LLM for all decisions and code generation. Expert in coordination and building.`,
    init_message: `You are ${botName}, a ${botType} worker bot. CRITICAL RULES:
1. ALWAYS use LLM (gpt-4o) to generate VALID, LINT-FREE code
2. NEVER use floating promises - always use 'await' with async functions
3. NEVER break permanent structure blocks - use dirt scaffolding only
4. If blocked by another bot, chat "Please move aside from [x,y,z], ${botName}" and WAIT
5. Follow phase instructions EXACTLY - complete each step before announcing
6. Use !newAction() for all building tasks with detailed descriptions
7. Announce phases ONLY after completion: 'FOUNDATION COMPLETE', 'WALLS COMPLETE', etc.
8. Coordinate via chat - listen for announcements from other bots
9. If code fails, retry with FIXED version using LLM
10. NEVER skip steps or announce prematurely`,
    role: botType
    }
    };

    const response = await fetch('http://localhost:8080/api/spawn-bot', {
    method: 'POST',
    headers: {
    'Content-Type': 'application/json'
    },
    body: JSON.stringify({ settings: botSettings })
    });

    if (!response.ok) {
    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
    }

    const result = await response.json();

    return {
    success: true,
    botName: botName,
    botType: botType,
    message: result.message || 'Successfully spawned ' + botName
    };

    } catch (error) {
    console.error('[HierarchicalBot] Error spawning ' + botName + ':', error);
    return {
    success: false,
    error: error.message,
    botName: botName
    };
    }
    }

    // Enhanced single bot instructions with proper building sequence
    createSingleBotHouseInstructions(taskDescription) {
    const taskText = taskDescription.toLowerCase();
    let width = 8, depth = 8, height = 4;

    const dimMatch = taskText.match(/(\d+)\s*[xX]\s*(\d+)/);
    if (dimMatch) {
    width = parseInt(dimMatch[1]);
    depth = parseInt(dimMatch[2]);
    }
    const heightMatch = taskText.match(/height\s*(\d+)/);
    if (heightMatch) {
    height = parseInt(heightMatch[1]);
    }

    return `SINGLE BUILDER HOUSE CONSTRUCTION - COMPLETE SEQUENCE:

!newAction("Build complete ${width}x${depth} house with height ${height}. CRITICAL SEQUENCE:

PHASE 1 - FOUNDATION:
- Get current position and announce 'WORK LOCATION: X=[x], Y=[y], Z=[z]'
- Build ${width}x${depth} foundation using oak_planks
- Ensure foundation is solid and complete
- Announce 'FOUNDATION COMPLETE' only when done

PHASE 2 - WALLS:
- Build ${height}-block high walls on foundation perimeter
- SOUTH wall: Leave 2x1 door opening (2 blocks wide, 2 blocks high)
- EAST wall: Leave 1x1 window opening at height 2
- WEST wall: Leave 1x1 window opening at height 2
- NORTH wall: Build solid (no openings)
- Use DIRT blocks for scaffolding to reach height - NEVER break wall blocks
- If blocked by another bot, chat 'Please move aside from [x,y,z], [botname]' and wait
- Remove dirt scaffolding after walls complete
- Announce 'WALLS COMPLETE' only when all walls done

PHASE 3 - ROOF:
- Build flat roof using oak_planks covering entire structure
- Use dirt scaffolding to reach roof level - remove after
- Ensure roof is complete and weatherproof
- Announce 'ROOF COMPLETE' only when done

PHASE 4 - DOORS & WINDOWS:
- Place oak_door in the 2x1 door opening (south wall)
- Place glass_pane in both 1x1 window openings (east and west walls)
- Ensure doors and windows are properly placed and functional
- Announce 'DOORS AND WINDOWS COMPLETE' only when done

PHASE 5 - LIGHTING:
- Place 4 torches inside the house (one in each corner)
- Place 2 torches outside (one on each side of door)
- Ensure all torches are properly placed and lit
- Announce 'LIGHTING COMPLETE' only when done

PHASE 6 - FINAL INSPECTION & CLEANUP:
- Check for any gaps or broken blocks in walls/roof
- Fix any structural issues found
- Remove any remaining temporary blocks (dirt scaffolding)
- Ensure structure is complete and proper
- Announce 'HOUSE CONSTRUCTION COMPLETE' only when perfect

IMPORTANT: Generate LINT-FREE code with proper awaits. Never break structure blocks. Complete each phase fully before announcing.")`;
    }

    // Enhanced coordination for multiple bots with better phase management
    breakDownTaskWithCoordination(analysis, workers, workspaceId) {
    const assignments = [];

    if (workers.length === 1) {
    assignments.push({
    workerName: workers[0].name,
    task: this.createSingleBotHouseInstructions(analysis.originalTask),
    workspaceId,
    role: 'solo_worker',
    phase: 'all'
    });
    } else if (workers.length === 2) {
    assignments.push({
    workerName: workers[0].name,
    task: `LEADER - FOUNDATION & WALLS (2-BOT COORDINATION):

PHASE 1 - FOUNDATION:
- Get current position and announce 'WORK LOCATION: X=[x], Y=[y], Z=[z]'
- !newAction("Build 8x8 foundation using oak_planks at current location. Generate lint-free code with proper awaits.")
- Wait for foundation to be completely built
- Announce 'FOUNDATION COMPLETE' only when foundation is done

PHASE 2 - WALLS:
- !newAction("Build 4-block high walls with openings. SOUTH: 2x1 door opening, EAST/WEST: 1x1 windows, NORTH: solid. Use dirt scaffolding, never break walls. Generate lint-free code.")
- Complete all walls before announcing
- Announce 'WALLS COMPLETE' only when all walls done

PHASE 3 - WAIT FOR FOLLOWER:
- Wait for follower to complete roof and details
- !newAction("Inspect completed house and fix any issues found")
- Announce 'HOUSE CONSTRUCTION COMPLETE' only when everything is perfect`,
    workspaceId,
    role: 'leader',
    phase: 'foundation_walls'
    });

    assignments.push({
    workerName: workers[1].name,
    task: `FOLLOWER - ROOF & DETAILS (2-BOT COORDINATION):

PHASE 1 - WAIT FOR LOCATION:
- !waitForAnnouncement("WORK LOCATION", 90)
- !goToPlayer("${workers[0].name}", 3)

PHASE 2 - WAIT FOR WALLS:
- !waitForAnnouncement("WALLS COMPLETE", 120)

PHASE 3 - ROOF:
- !newAction("Build flat roof using oak_planks. Use dirt scaffolding to reach height, remove after. Generate lint-free code with awaits.")
- Complete roof fully before continuing
- Announce 'ROOF COMPLETE' only when roof is done

PHASE 4 - DETAILS:
- !newAction("Place oak_door in door opening, glass_pane in windows, 4 torches inside, 2 torches outside. Generate lint-free code.")
- Complete all details before announcing
- Announce 'HOUSE CONSTRUCTION COMPLETE' only when everything is perfect`,
    workspaceId,
    role: 'follower',
    phase: 'roof_details'
    });
    } else if (workers.length >= 3) {
    // Leader - Foundation only
    assignments.push({
    workerName: workers[0].name,
    task: `LEADER - FOUNDATION (3+ BOT COORDINATION):

PHASE 1 - FOUNDATION:
- Get current position and announce 'WORK LOCATION: X=[x], Y=[y], Z=[z]'
- !newAction("Build 8x8 foundation using oak_planks at current location. Generate lint-free code with proper awaits.")
- Wait for foundation to be completely built
- Announce 'FOUNDATION COMPLETE' only when foundation is done

PHASE 2 - WAIT FOR WALLS:
- Wait for both wall teams to complete
- !waitForAnnouncement("SOUTH AND NORTH WALLS COMPLETE", 120)
- !waitForAnnouncement("EAST AND WEST WALLS COMPLETE", 120)

PHASE 3 - FINAL INSPECTION:
- !newAction("Inspect completed house structure and fix any issues found")
- Announce 'HOUSE CONSTRUCTION COMPLETE' only when everything is perfect`,
    workspaceId,
    role: 'leader',
    phase: 'foundation'
    });

    // Wall Builder 1 - South & North walls
    assignments.push({
    workerName: workers[1].name,
    task: `WALL BUILDER 1 - SOUTH & NORTH WALLS (3+ BOT COORDINATION):

PHASE 1 - WAIT FOR FOUNDATION:
- !waitForAnnouncement("FOUNDATION COMPLETE", 120)
- !goToPlayer("${workers[0].name}", 3)

PHASE 2 - BUILD WALLS:
- !newAction("Build south wall (4 blocks high) with 2x1 door opening (2 wide, 2 high). Use dirt scaffolding, never break walls. Generate lint-free code.")
- !newAction("Build north wall (4 blocks high) solid with no openings. Use dirt scaffolding, never break walls. Generate lint-free code.")
- Remove all dirt scaffolding after walls complete
- Announce 'SOUTH AND NORTH WALLS COMPLETE' only when both walls are done`,
    workspaceId,
    role: 'wall_builder',
    phase: 'walls_sn'
    });

    // Wall Builder 2 - East & West walls
    assignments.push({
    workerName: workers[2].name,
    task: `WALL BUILDER 2 - EAST & WEST WALLS (3+ BOT COORDINATION):

PHASE 1 - WAIT FOR FOUNDATION:
- !waitForAnnouncement("FOUNDATION COMPLETE", 120)
- !goToPlayer("${workers[0].name}", 3)

PHASE 2 - BUILD WALLS:
- !newAction("Build east wall (4 blocks high) with 1x1 window opening at height 2. Use dirt scaffolding, never break walls. Generate lint-free code.")
- !newAction("Build west wall (4 blocks high) with 1x1 window opening at height 2. Use dirt scaffolding, never break walls. Generate lint-free code.")
- Remove all dirt scaffolding after walls complete
- Announce 'EAST AND WEST WALLS COMPLETE' only when both walls are done`,
    workspaceId,
    role: 'wall_builder',
    phase: 'walls_ew'
    });

    // Finisher - Roof & Details (if 4th worker available)
    if (workers.length >= 4) {
    assignments.push({
    workerName: workers[3].name,
    task: `FINISHER - ROOF & DETAILS (3+ BOT COORDINATION):

PHASE 1 - WAIT FOR WALLS:
- !waitForAnnouncement("SOUTH AND NORTH WALLS COMPLETE", 120)
- !waitForAnnouncement("EAST AND WEST WALLS COMPLETE", 120)
- !goToPlayer("${workers[0].name}", 3)

PHASE 2 - ROOF:
- !newAction("Build flat roof using oak_planks covering entire structure. Use dirt scaffolding to reach height, remove after. Generate lint-free code.")
- Complete roof fully before continuing
- Announce 'ROOF COMPLETE' only when roof is done

PHASE 3 - DETAILS:
- !newAction("Place oak_door in door opening (south wall), glass_pane in window openings (east/west walls). Generate lint-free code.")
- !newAction("Place 4 torches inside house (corners) and 2 torches outside (by door). Generate lint-free code.")
- Complete all details before announcing
- Announce 'HOUSE CONSTRUCTION COMPLETE' only when everything is perfect`,
    workspaceId,
    role: 'finisher',
    phase: 'finishing'
    });
    } else {
    // Assign finishing to leader if no 4th worker
    assignments[0].task += `

PHASE 4 - ROOF & DETAILS:
- !waitForAnnouncement("SOUTH AND NORTH WALLS COMPLETE", 120)
- !waitForAnnouncement("EAST AND WEST WALLS COMPLETE", 120)
- !newAction("Build flat roof using oak_planks. Use dirt scaffolding, remove after. Generate lint-free code.")
- !newAction("Place oak_door, glass_pane in windows, 4 torches inside, 2 outside. Generate lint-free code.")
- Announce 'HOUSE CONSTRUCTION COMPLETE' only when everything is perfect`;
    }
    }

    return assignments;
    }

    // Enhanced task delegation with better error handling
    async delegateTask(leaderName, taskDescription) {
    try {
    console.log('[HierarchicalBot] ' + leaderName + ' analyzing task: "' + taskDescription + '"');

    if (leaderName.includes('builder_') || leaderName.includes('miner_') ||
    leaderName.includes('farmer_') || leaderName.includes('gatherer_') ||
    leaderName.includes('worker_')) {
    console.log('[HierarchicalBot] Worker bot ' + leaderName + ' attempted to delegate - redirecting to direct execution');
    return {
    success: false,
    reason: 'worker_should_execute',
    message: 'Worker bots should execute tasks directly, not delegate them. Use !newAction instead.'
    };
    }

    const analysis = this.analyzeTask(taskDescription);

    if (!analysis.needsWorkers) {
    console.log('[HierarchicalBot] Task can be handled by ' + leaderName + ' alone');
    return {
    success: false,
    reason: 'simple_task',
    message: 'This task can be handled personally by ' + leaderName
    };
    }

    let availableWorkers = this.getAvailableWorkers(leaderName);

    if (availableWorkers.length === 0) {
    console.log('[HierarchicalBot] No worker bots available, spawning new ones for ' + leaderName);
    const spawnResult = await this.spawnWorkersForTask(leaderName, analysis);
    if (!spawnResult.success) {
    return {
    success: false,
    reason: 'spawn_failed',
    message: 'Failed to spawn worker bots: ' + spawnResult.error
    };
    }

    console.log('[HierarchicalBot] Waiting for spawned bots to connect...');
    const allConnected = await this.waitForBotsConnection(spawnResult.workers, 45000); // Increased timeout

    if (!allConnected) {
    console.log('[HierarchicalBot] Some bots failed to connect, trying with available workers...');
    availableWorkers = this.getAvailableWorkers(leaderName);
    if (availableWorkers.length === 0) {
    return {
    success: false,
    reason: 'connection_timeout',
    message: 'Worker bots failed to connect and no existing workers available'
    };
    }
    } else {
    await new Promise(resolve => setTimeout(resolve, 5000)); // More time for initialization
    availableWorkers = this.getAvailableWorkers(leaderName);
    }
    }

    const selectedWorkers = this.selectWorkersForTask(availableWorkers, analysis);

    if (selectedWorkers.length === 0) {
    return {
    success: false,
    reason: 'no_suitable_workers',
    message: 'No suitable workers available for ' + analysis.taskType + ' tasks'
    };
    }

    const workspaceId = 'workspace_' + Date.now();
    this.createWorkspace(workspaceId, leaderName, selectedWorkers.map(w => w.name), analysis.taskType);

    const taskBreakdown = this.breakDownTaskWithCoordination(analysis, selectedWorkers, workspaceId);

    const assignments = [];
    let successfulAssignments = 0;

    for (let i = 0; i < taskBreakdown.length; i++) {
    const assignment = taskBreakdown[i];
    console.log('[HierarchicalBot] Assigning coordinated task to ' + assignment.workerName + ': ' + assignment.task);

    const result = await this.assignTaskToWorker(leaderName, assignment.workerName, assignment.task);
    assignments.push(result);

    if (result && result.success) {
    successfulAssignments++;
    } else {
    const errMsg = result && result.error ? result.error : 'unknown error';
    console.error('[HierarchicalBot] Failed to assign task to ' + assignment.workerName + ': ' + errMsg);
    }

    // Better staggered assignment timing
    if (i === 0 && taskBreakdown.length > 1) {
    console.log('[HierarchicalBot] Waiting for lead worker to establish location...');
    await new Promise(resolve => setTimeout(resolve, 8000)); // More time for leader
    } else if (i < taskBreakdown.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    }
    }

    if (successfulAssignments === 0) {
    return {
    success: false,
    reason: 'all_assignments_failed',
    message: 'Failed to assign tasks to any worker bots'
    };
    }

    const taskId = 'task_' + (++this.taskCounter);
    this.taskAssignments.set(taskId, {
    leaderName,
    taskDescription,
    analysis,
    workers: selectedWorkers.map(w => w.name),
    assignments,
    workspaceId,
    timestamp: Date.now()
    });

    if (!this.managedWorkers.has(leaderName)) {
    this.managedWorkers.set(leaderName, new Set());
    }
    selectedWorkers.forEach(worker => {
    this.managedWorkers.get(leaderName).add(worker.name);
    });

    // Start enhanced monitoring
    setTimeout(() => this.monitorTaskProgressEnhanced(taskId), 8000);

    return {
    success: true,
    taskId,
    workspaceId,
    message: `Task successfully delegated to ${successfulAssignments}/${selectedWorkers.length} worker(s)`,
    workersAssigned: assignments.filter(a => a.success).map(a => a.workerName),
    taskBreakdown: taskBreakdown.map(t => ({ worker: t.workerName, task: t.task })),
    partialSuccess: successfulAssignments < selectedWorkers.length
    };

    } catch (error) {
    console.error('[HierarchicalBot] Error in delegateTask:', error);
    return {
    success: false,
    reason: 'error',
    message: 'Error delegating task: ' + error.message
    };
    }
    }

    // Enhanced task completion handler with proper inspection
    async handleTaskCompletion(workerName, completionMessage) {
    console.log(`[HierarchicalBot] ${workerName} reported: ${completionMessage}`);

    const message = completionMessage.toLowerCase();

    for (const [taskId, task] of this.taskAssignments.entries()) {
    if (task.workers.includes(workerName)) {
    const workspaceId = task.workspaceId;

    if (!this.phaseTracker.has(workspaceId)) {
    this.phaseTracker.set(workspaceId, new Set());
    }

    const completedPhases = this.phaseTracker.get(workspaceId);

    // Handle single worker completion
    if (task.workers.length === 1) {
    if (message.includes('house construction complete')) {
    completedPhases.add('complete');
    console.log(`[HierarchicalBot] Single worker ${workerName} completed house construction`);

    // Trigger inspection by Kid bot
    await this.triggerInspection(task.leaderName, workerName, taskId, task);

    this.phaseTracker.delete(workspaceId);
    const workspace = this.sharedWorkspaces.get(workspaceId);
    if (workspace) {
    workspace.status = 'completed';
    }
    }
    } else {
    // Handle multi-worker phase completions
    if (message.includes('foundation complete')) {
    completedPhases.add('foundation');
    console.log(`[HierarchicalBot] Foundation completed by ${workerName}`);

    } else if (message.includes('south and north walls complete')) {
    completedPhases.add('walls_sn');
    console.log(`[HierarchicalBot] South and North walls completed by ${workerName}`);

    } else if (message.includes('east and west walls complete')) {
    completedPhases.add('walls_ew');
    console.log(`[HierarchicalBot] East and West walls completed by ${workerName}`);

    } else if (message.includes('roof complete')) {
    completedPhases.add('roof');
    console.log(`[HierarchicalBot] Roof completed by ${workerName}`);

    } else if (message.includes('house construction complete')) {
    completedPhases.add('complete');
    console.log(`[HierarchicalBot] House construction completed by ${workerName}`);

    // Trigger inspection by Kid bot
    await this.triggerInspection(task.leaderName, workerName, taskId, task);

    this.phaseTracker.delete(workspaceId);
    const workspace = this.sharedWorkspaces.get(workspaceId);
    if (workspace) {
    workspace.status = 'completed';
    }
    }
    }
    break;
    }
    }
    }

    // Enhanced inspection trigger with detailed requirements
    async triggerInspection(leaderName, completingWorkerName, taskId, task) {
    console.log(`[HierarchicalBot] Triggering inspection by ${leaderName} for completed task ${taskId}`);

    const agentConnections = global.kodecraftAgentConnections();
    const leaderConnection = agentConnections[leaderName];
    const workerConnection = agentConnections[completingWorkerName];

    if (leaderConnection && leaderConnection.socket && workerConnection && workerConnection.bot) {
    const pos = workerConnection.bot.entity.position;
    const inspectionTask = `HOUSE INSPECTION AND COMPLETION:

!newAction("Go to completed house at X=${Math.floor(pos.x)}, Y=${Math.floor(pos.y)}, Z=${Math.floor(pos.z)} and perform detailed inspection:

INSPECTION CHECKLIST:
1. FOUNDATION: Check 8x8 oak_planks foundation is complete and solid
2. WALLS: Check all 4 walls are 4 blocks high with no gaps or breaks
   - South wall: Must have 2x1 door opening (2 wide, 2 high)
   - East wall: Must have 1x1 window opening at height 2
   - West wall: Must have 1x1 window opening at height 2
   - North wall: Must be solid with no openings
3. ROOF: Check flat oak_planks roof covers entire structure
4. DOOR: Check oak_door is placed in south wall opening
5. WINDOWS: Check glass_pane is placed in east and west wall openings
6. LIGHTING: Check 4 torches inside (corners) and 2 torches outside (by door)
7. CLEANUP: Check no temporary blocks (dirt scaffolding) remain

FIXES REQUIRED:
- If any walls have gaps or breaks, fix them with matching blocks
- If door is missing, place oak_door in south wall opening
- If windows are missing, place glass_pane in east/west openings
- If torches are missing, place them (4 inside corners, 2 outside by door)
- If roof has gaps, fill with oak_planks
- Remove any remaining dirt or temporary blocks

Generate lint-free code with proper awaits. Complete ALL fixes before announcing.
Announce 'HOUSE INSPECTION COMPLETE' only when house is PERFECT.")`;

    try {
    leaderConnection.socket.emit('send-message', leaderName, inspectionTask);
    console.log(`[HierarchicalBot] Sent detailed inspection task to ${leaderName}`);

    this.inspectionQueue.set(taskId, {
    inspector: leaderName,
    location: pos,
    timestamp: Date.now(),
    task: task
    });

    setTimeout(() => this.monitorInspection(taskId), 10000);
    } catch (error) {
    console.error(`[HierarchicalBot] Failed to send inspection task to ${leaderName}:`, error);
    }
    }
    }

    // Enhanced monitoring with better reminders
    async monitorInspection(taskId) {
    const inspection = this.inspectionQueue.get(taskId);
    if (!inspection) return;

    setTimeout(() => {
    if (this.inspectionQueue.has(taskId)) {
    const agentConnections = global.kodecraftAgentConnections();
    const connection = agentConnections[inspection.inspector];
    if (connection && connection.socket) {
    const reminderTask = `INSPECTION REMINDER: Complete house inspection and fix all issues. Check walls, roof, door, windows, torches. Announce 'HOUSE INSPECTION COMPLETE' when perfect.`;
    connection.socket.emit('send-message', inspection.inspector, reminderTask);
    console.log(`[HierarchicalBot] Sent inspection reminder to ${inspection.inspector}`);
    }
    }
    }, 45000); // 45 second reminder
    }

    // Enhanced worker spawning
    async spawnWorkersForTask(leaderName, analysis) {
    try {
    const workerType = this.getWorkerTypeForTask(analysis.taskType);
    const count = analysis.recommendedWorkers;

    console.log(`[HierarchicalBot] Spawning ${count} ${workerType} workers for ${analysis.taskType} task`);

    const workers = [];
    const timestamp = Date.now().toString().slice(-4);

    for (let i = 0; i < count; i++) {
    const workerTimestamp = (parseInt(timestamp) + i).toString();
    const workerName = workerType + '_' + workerTimestamp;
    workers.push({ name: workerName, type: workerType });
    }

    const spawnResults = [];
    for (const workerSpec of workers) {
    const spawnResult = await this.spawnWorkerBot(workerSpec.name, workerSpec.type, leaderName);
    spawnResults.push(spawnResult);

    if (spawnResult.success) {
    console.log('[HierarchicalBot] Successfully spawned worker ' + workerSpec.name + ' for task');
    } else {
    console.log('[HierarchicalBot] Failed to spawn worker ' + workerSpec.name + ': ' + spawnResult.error);
    }

    await new Promise(resolve => setTimeout(resolve, 1500)); // Slightly longer delay
    }

    const successfulSpawns = spawnResults.filter(r => r.success);

    return {
    success: successfulSpawns.length > 0,
    workers: successfulSpawns.map(r => r.botName),
    spawned: successfulSpawns.length,
    total: count
    };

    } catch (error) {
    console.error('[HierarchicalBot] Error spawning workers for task:', error);
    return {
    success: false,
    error: error.message
    };
    }
    }

    getWorkerTypeForTask(taskType) {
    switch (taskType) {
    case 'building': return 'builder';
    case 'mining': return 'miner';
    case 'farming': return 'farmer';
    case 'gathering': return 'gatherer';
    default: return 'worker';
    }
    }

    createWorkspace(workspaceId, leaderName, workerNames, taskType) {
    const workspace = {
    id: workspaceId,
    leaderName,
    workers: workerNames,
    taskType,
    status: 'initializing',
    coordinationPoint: null,
    createdAt: Date.now(),
    lastActivity: Date.now()
    };

    this.sharedWorkspaces.set(workspaceId, workspace);
    console.log(`[HierarchicalBot] Created workspace ${workspaceId} for ${taskType} task with ${workerNames.length} workers`);
    return workspace;
    }

    async waitForBotConnection(botName, maxWaitTime = 45000) {
    const startTime = Date.now();
    const checkInterval = 1000;

    console.log('[HierarchicalBot] Waiting for ' + botName + ' to connect...');

    while (Date.now() - startTime < maxWaitTime) {
    const agentConnections = global.kodecraftAgentConnections();
    const botConnection = agentConnections[botName];

    if (botConnection && botConnection.in_game) {
    console.log('[HierarchicalBot] ' + botName + ' is now connected and in-game');
    return true;
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.error('[HierarchicalBot] Timeout waiting for ' + botName + ' to connect after ' + maxWaitTime + 'ms');
    return false;
    }

    async waitForBotsConnection(botNames, maxWaitTime = 45000) {
    const connectionPromises = botNames.map(botName =>
    this.waitForBotConnection(botName, maxWaitTime)
    );

    const results = await Promise.all(connectionPromises);
    const allConnected = results.every(result => result === true);

    if (!allConnected) {
    const failedBots = botNames.filter((name, index) => !results[index]);
    console.error('[HierarchicalBot] Failed to connect bots: ' + failedBots.join(', '));
    }

    return allConnected;
    }

    getAvailableWorkers(leaderName) {
    if (!global.kodecraftAgentConnections) {
    return [];
    }

    const availableWorkers = [];
    const agentConnections = global.kodecraftAgentConnections();

    for (const [botName, connection] of Object.entries(agentConnections)) {
    if (botName === leaderName) continue;

    if (connection.in_game) {
    availableWorkers.push({
    name: botName,
    connection: connection
    });
    }
    }

    return availableWorkers;
    }

    selectWorkersForTask(availableWorkers, analysis) {
    console.log('[HierarchicalBot] Selecting workers for ' + analysis.taskType + ' task from ' + availableWorkers.length + ' available workers');

    let suitableWorkers = [];

    for (const worker of availableWorkers) {
    const workerName = worker.name.toLowerCase();

    if (analysis.taskType === 'building') {
    if (workerName.includes('builder') || workerName.includes('architect') ||
    workerName.includes('decorator') || workerName.includes('assistant')) {
    suitableWorkers.push(worker);
    }
    } else if (analysis.taskType === 'mining') {
    if (workerName.includes('miner') || workerName.includes('collector')) {
    suitableWorkers.push(worker);
    }
    } else if (analysis.taskType === 'farming') {
    if (workerName.includes('farmer') || workerName.includes('harvester')) {
    suitableWorkers.push(worker);
    }
    } else if (analysis.taskType === 'gathering') {
    if (workerName.includes('gatherer') || workerName.includes('collector')) {
    suitableWorkers.push(worker);
    }
    }

    if (workerName.includes('worker') || workerName.includes('helper') || workerName.includes('assistant')) {
    suitableWorkers.push(worker);
    }
    }

    suitableWorkers = suitableWorkers.filter((worker, index, self) =>
    index === self.findIndex(w => w.name === worker.name)
    );

    console.log('[HierarchicalBot] Found ' + suitableWorkers.length + ' suitable workers for ' + analysis.taskType + ' task');

    if (suitableWorkers.length === 0) {
    console.log('[HierarchicalBot] No specialized workers found, using all available workers');
    suitableWorkers = availableWorkers;
    }

    return suitableWorkers.slice(0, analysis.recommendedWorkers);
    }

    async assignTaskToWorker(supervisorName, workerName, taskDescription, waitForConnection = false) {
    try {
    console.log('[HierarchicalBot] ' + supervisorName + ' assigning task to ' + workerName + ': "' + taskDescription + '"');

    if (waitForConnection) {
    const isConnected = await this.waitForBotConnection(workerName, 20000);
    if (!isConnected) {
    return {
    success: false,
    error: 'Worker \'' + workerName + '\' failed to connect in time'
    };
    }
    }

    const agentConnections = global.kodecraftAgentConnections();
    const workerConnection = agentConnections[workerName];

    if (!workerConnection) {
    return {
    success: false,
    error: 'Worker \'' + workerName + '\' not found'
    };
    }

    if (!workerConnection.in_game) {
    return {
    success: false,
    error: 'Worker \'' + workerName + '\' is not in-game'
    };
    }

    if (workerConnection.socket) {
    workerConnection.socket.emit('send-message', workerName, taskDescription);

    if (!this.managedWorkers.has(supervisorName)) {
    this.managedWorkers.set(supervisorName, new Set());
    }
    this.managedWorkers.get(supervisorName).add(workerName);

    return {
    success: true,
    message: 'Task assigned to ' + workerName,
    workerName: workerName,
    task: taskDescription
    };
    } else {
    return {
    success: false,
    error: 'Worker \'' + workerName + '\' is not connected'
    };
    }

    } catch (error) {
    console.error('[HierarchicalBot] Error assigning task to worker:', error);
    return {
    success: false,
    error: error.message
    };
    }
    }

    // Enhanced monitoring with better code retry logic
    async monitorTaskProgressEnhanced(taskId, checkInterval = 8000) {
    const task = this.taskAssignments.get(taskId);
    if (!task) return;

    console.log(`[HierarchicalBot] Starting enhanced monitoring for task ${taskId}`);
    let cycles = 0;
    const maxCycles = 25;

    const monitor = setInterval(async () => {
    cycles++;

    const workspace = this.sharedWorkspaces.get(task.workspaceId);
    if (workspace && workspace.status === 'completed') {
    console.log(`[HierarchicalBot] Task ${taskId} completed, stopping monitoring`);
    clearInterval(monitor);
    return;
    }

    const agentConnections = global.kodecraftAgentConnections();
    let activeWorkers = 0;
    let stuckWorkers = [];

    for (const workerName of task.workers) {
    const connection = agentConnections[workerName];
    if (connection && connection.in_game) {
    if (this.isWorkerActive(connection)) {
    activeWorkers++;
    } else {
    stuckWorkers.push(workerName);
    }
    }
    }

    console.log(`[HierarchicalBot] Task ${taskId} cycle ${cycles}: ${activeWorkers} active, ${stuckWorkers.length} stuck`);

    // Send enhanced reminders with code retry
    if (cycles % 2 === 0 && stuckWorkers.length > 0) {
    await this.sendEnhancedReminders(task, stuckWorkers, cycles);
    }

    if (cycles >= maxCycles) {
    console.log(`[HierarchicalBot] Max monitoring cycles reached for task ${taskId}`);
    clearInterval(monitor);
    }
    }, checkInterval);
    }

    isWorkerActive(connection) {
    if (!connection.bot) return false;

    if (connection.bot.pathfinder && connection.bot.pathfinder.isMoving()) {
    return true;
    }

    return connection.in_game;
    }

    // Enhanced reminders with code retry and specific instructions
    async sendEnhancedReminders(task, stuckWorkers, cycles) {
    const agentConnections = global.kodecraftAgentConnections();
    const completedPhases = this.phaseTracker.get(task.workspaceId) || new Set();

    for (const workerName of stuckWorkers) {
    const connection = agentConnections[workerName];
    if (connection && connection.socket) {
    let reminder = '';

    if (workerName === task.workers[0]) {
    // Leader reminders with specific code retry
    if (!completedPhases.has('foundation')) {
    reminder = `LEADER URGENT: Foundation not started! Use !newAction("Build 8x8 foundation using oak_planks. Generate LINT-FREE code with proper awaits:
async function buildFoundation() {
  const pos = bot.entity.position;
  for (let x = 0; x < 8; x++) {
    for (let z = 0; z < 8; z++) {
    await skills.placeBlock(bot, 'oak_planks', pos.x + x, pos.y, pos.z + z);
    }
  }
  bot.chat('FOUNDATION COMPLETE');
}
await buildFoundation();") RETRY NOW!`;
    } else if (!completedPhases.has('walls')) {
    reminder = 'LEADER URGENT: Build walls with !newAction. Use LLM for LINT-FREE code with awaits. RETRY NOW!';
    }
    } else {
    // Follower reminders with specific wait commands
    if (!completedPhases.has('foundation')) {
    reminder = `FOLLOWER URGENT: Wait for foundation! Use !waitForAnnouncement("FOUNDATION COMPLETE", 120) from ${task.workers[0]}. RETRY NOW!`;
    } else {
    reminder = `FOLLOWER URGENT: Go to leader and start your phase! Use !goToPlayer("${task.workers[0]}", 3) then !newAction. RETRY NOW!`;
    }
    }

    if (reminder) {
    try {
    connection.socket.emit('send-message', workerName, reminder);
    console.log(`[HierarchicalBot] Sent enhanced reminder to ${workerName} (cycle ${cycles})`);
    } catch (error) {
    console.error(`[HierarchicalBot] Failed to send reminder to ${workerName}:`, error);
    }
    }
    }
    }
    }

    // Enhanced chat monitoring with better move handling
    setupChatMonitoring() {
    console.log('[HierarchicalBot] Setting up enhanced chat monitoring');
    this.bindChatListeners();
    setInterval(() => {
    this.bindChatListeners();
    }, 3000);
    }

    bindChatListeners() {
    const agentConnections = global.kodecraftAgentConnections ? global.kodecraftAgentConnections() : {};

    for (const [agentName, connection] of Object.entries(agentConnections)) {
    if (connection && connection.bot && connection.in_game) {
    if (!connection._hierarchicalChatListener) {
    connection._hierarchicalChatListener = (username, message) => {
    console.log(`[HierarchicalBot] Chat detected: ${username}: ${message}`);
    this.handleChatMessage(username, message);
    };

    try {
    connection.bot.on('chat', connection._hierarchicalChatListener);
    console.log(`[HierarchicalBot] Added chat listener for ${agentName}`);
    } catch (error) {
    console.error(`[HierarchicalBot] Failed to add chat listener for ${agentName}:`, error);
    }
    }
    }
    }
    }

    // Enhanced chat message handler with immediate coordination
    handleChatMessage(username, message) {
    const lowerMessage = message.toLowerCase();
    console.log(`[HierarchicalBot] Processing chat: ${username} said "${message}"`);

    // Handle move requests with immediate response
    if (lowerMessage.includes('please move aside from')) {
    const moveMatch = lowerMessage.match(/please move aside from \[?([^\],]+),?\s*([^\],]+),?\s*([^\],]+)\]?,?\s*(\w+)/);
    if (moveMatch) {
    const [, x, y, z, requester] = moveMatch;
    this.handleMoveRequest(username, `${x},${y},${z}`, requester);
    }
    }

    // Enhanced completion detection
    const completionPatterns = [
    'foundation complete',
    'walls complete',
    'south and north walls complete',
    'east and west walls complete',
    'roof complete',
    'doors and windows complete',
    'lighting complete',
    'house construction complete',
    'house complete',
    'building complete',
    'construction complete',
    'house inspection complete'
    ];

    for (const pattern of completionPatterns) {
    if (lowerMessage.includes(pattern)) {
    console.log(`[HierarchicalBot] COMPLETION DETECTED: ${username} - ${pattern}`);
    this.handleTaskCompletion(username, message);

    // Immediate coordination triggers
    if (pattern === 'foundation complete') {
    setTimeout(() => {
    this.triggerImmediateWallPhase(username);
    }, 2000);
    } else if (pattern.includes('walls complete')) {
    setTimeout(() => {
    this.triggerImmediateRoofPhase(username);
    }, 2000);
    }
    break;
    }
    }

    // Handle inspection completion
    if (lowerMessage.includes('house inspection complete')) {
    console.log(`[HierarchicalBot] House inspection completed by ${username}`);
    for (const [taskId, inspection] of this.inspectionQueue.entries()) {
    if (inspection.inspector === username) {
    this.inspectionQueue.delete(taskId);
    console.log(`[HierarchicalBot] Inspection task ${taskId} completed and removed from queue`);
    break;
    }
    }
    }

    // Check for location announcements
    if (lowerMessage.includes('work location:')) {
    console.log(`[HierarchicalBot] Location announced: ${username} - ${message}`);
    }
    }

    // Enhanced move request handler with better coordination
    async handleMoveRequest(botName, posStr, requester) {
    const agentConnections = global.kodecraftAgentConnections();
    const connection = agentConnections[botName];
    if (connection && connection.socket) {
    const moveTask = `MOVE ASIDE REQUEST: Another bot needs your position!
!newAction("Move aside from position ${posStr} immediately. Go 5 blocks away in any safe direction, wait 15 seconds, then return to continue work. Generate lint-free code with awaits.")`;

    connection.socket.emit('send-message', botName, moveTask);
    console.log(`[HierarchicalBot] Instructed ${botName} to move aside from ${posStr} for ${requester}`);

    // Track the move request
    this.blockingRequests.set(`${botName}_${requester}`, {
    timestamp: Date.now(),
    position: posStr,
    requester: requester
    });
    }
    }

    // Immediate wall phase trigger
    async triggerImmediateWallPhase(leaderName) {
    console.log(`[HierarchicalBot] Triggering immediate wall phase after foundation completion by ${leaderName}`);

    const agentConnections = global.kodecraftAgentConnections();

    for (const [taskId, task] of this.taskAssignments.entries()) {
    if (task.workers.includes(leaderName) && task.workers.length > 1) {
    console.log(`[HierarchicalBot] Found task ${taskId} - triggering wall builders`);

    for (let i = 1; i < task.workers.length; i++) {
    const workerName = task.workers[i];
    const connection = agentConnections[workerName];

    if (connection && connection.socket) {
    let wallMessage = '';

    if (i === 1) {
    wallMessage = `FOUNDATION COMPLETE! START WALLS NOW!
!goToPlayer("${leaderName}", 3)
!newAction("Build south wall (4 high) with 2x1 door opening and north wall (4 high) solid. Use dirt scaffolding, never break walls. Generate lint-free code with awaits. Announce 'SOUTH AND NORTH WALLS COMPLETE' when done.")`;
    } else if (i === 2) {
    wallMessage = `FOUNDATION COMPLETE! START WALLS NOW!
!goToPlayer("${leaderName}", 3)
!newAction("Build east wall (4 high) with 1x1 window and west wall (4 high) with 1x1 window. Use dirt scaffolding, never break walls. Generate lint-free code with awaits. Announce 'EAST AND WEST WALLS COMPLETE' when done.")`;
    }

    if (wallMessage) {
    try {
    connection.socket.emit('send-message', workerName, wallMessage);
    console.log(`[HierarchicalBot] Sent immediate wall command to ${workerName}`);
    } catch (error) {
    console.error(`[HierarchicalBot] Failed to send wall command to ${workerName}:`, error);
    }
    }
    }
    }
    break;
    }
    }
    }

    // Immediate roof phase trigger
    async triggerImmediateRoofPhase(leaderName) {
    console.log(`[HierarchicalBot] Triggering immediate roof phase after walls completion`);

    const agentConnections = global.kodecraftAgentConnections();

    for (const [taskId, task] of this.taskAssignments.entries()) {
    if (task.workers.includes(leaderName)) {
    const completedPhases = this.phaseTracker.get(task.workspaceId) || new Set();

    // Check if both wall phases are complete
    if (completedPhases.has('walls_sn') && completedPhases.has('walls_ew')) {
    // Find finisher or assign to leader
    let finisher = task.workers.find(w => w !== task.workers[0] && w !== task.workers[1] && w !== task.workers[2]);
    if (!finisher) finisher = task.workers[0]; // Use leader if no finisher

    const connection = agentConnections[finisher];
    if (connection && connection.socket) {
    const roofMessage = `ALL WALLS COMPLETE! START ROOF AND DETAILS NOW!
!goToPlayer("${task.workers[0]}", 3)
!newAction("Build flat roof using oak_planks covering entire structure. Use dirt scaffolding, remove after. Generate lint-free code with awaits.")
!newAction("Place oak_door in door opening, glass_pane in windows, 4 torches inside corners, 2 torches outside by door. Generate lint-free code with awaits. Announce 'HOUSE CONSTRUCTION COMPLETE' when everything is perfect.")`;

    try {
    connection.socket.emit('send-message', finisher, roofMessage);
    console.log(`[HierarchicalBot] Sent immediate roof and details command to ${finisher}`);
    } catch (error) {
    console.error(`[HierarchicalBot] Failed to send roof command to ${finisher}:`, error);
    }
    }
    }
    break;
    }
    }
    }

    // Method for API to spawn additional workers (called by !spawnAdditionalWorkers)
    async spawnAdditionalWorkers(leaderName, workerCount, workerType = null, taskDescription = null) {
        try {
            console.log(`[HierarchicalBot] ${leaderName} requesting to spawn ${workerCount} additional workers`);

            // If no task description provided, create a generic building task
            const task = taskDescription || "build a house";
            const analysis = this.analyzeTask(task);
            
            // Override with provided parameters
            analysis.needsWorkers = true;
            analysis.recommendedWorkers = Math.min(parseInt(workerCount), 5);
            
            if (workerType) {
                analysis.preferredWorkerType = workerType;
                analysis.taskType = workerType === 'builder' ? 'building' : 
                                  workerType === 'miner' ? 'mining' :
                                  workerType === 'farmer' ? 'farming' :
                                  workerType === 'gatherer' ? 'gathering' : 'general';
            }

            // Spawn the workers
            const spawnResult = await this.spawnWorkersForTask(leaderName, analysis);
            if (!spawnResult.success) {
                return {
                    success: false,
                    reason: 'spawn_failed',
                    message: 'Failed to spawn worker bots: ' + spawnResult.error
                };
            }

            console.log('[HierarchicalBot] Waiting for spawned bots to connect...');
            const allConnected = await this.waitForBotsConnection(spawnResult.workers, 45000);

            if (!allConnected) {
                return {
                    success: false,
                    reason: 'connection_timeout',
                    message: 'Some worker bots failed to connect in time'
                };
            }

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Track the spawned workers
            if (!this.managedWorkers.has(leaderName)) {
                this.managedWorkers.set(leaderName, new Set());
            }
            spawnResult.workers.forEach(workerName => {
                this.managedWorkers.get(leaderName).add(workerName);
            });

            return {
                success: true,
                message: `Successfully spawned ${spawnResult.spawned} ${workerType || 'worker'}(s): ${spawnResult.workers.join(', ')}`,
                workersSpawned: spawnResult.workers,
                count: spawnResult.spawned
            };

        } catch (error) {
            console.error('[HierarchicalBot] Error in spawnAdditionalWorkers:', error);
            return {
                success: false,
                reason: 'error',
                message: 'Error spawning workers: ' + error.message
            };
        }
    }

    // Main method for Kid bot to use
    async spawnAndDelegateTask(leaderName, taskDescription, workerCount = null, workerType = null) {
    try {
    console.log(`[HierarchicalBot] ${leaderName} requesting spawn and delegate: "${taskDescription}"`);

    const analysis = this.analyzeTask(taskDescription);

    if (workerCount) {
    analysis.needsWorkers = true;
    analysis.recommendedWorkers = Math.min(parseInt(workerCount), 5);
    }
    if (workerType) {
    analysis.preferredWorkerType = workerType;
    }

    if (!analysis.needsWorkers) {
    return {
    success: false,
    reason: 'simple_task',
    message: 'This task can be handled by ' + leaderName + ' alone'
    };
    }

    let availableWorkers = this.getAvailableWorkers(leaderName);
    let selectedWorkers = [];

    if (availableWorkers.length >= analysis.recommendedWorkers) {
    selectedWorkers = this.selectWorkersForTask(availableWorkers, analysis).slice(0, analysis.recommendedWorkers);
    console.log(`[HierarchicalBot] Using ${selectedWorkers.length} existing workers`);
    } else {
    const spawnResult = await this.spawnWorkersForTask(leaderName, analysis);
    if (!spawnResult.success) {
    return {
    success: false,
    reason: 'spawn_failed',
    message: 'Failed to spawn worker bots: ' + spawnResult.error
    };
    }

    console.log('[HierarchicalBot] Waiting for spawned bots to connect...');
    const allConnected = await this.waitForBotsConnection(spawnResult.workers, 45000);

    if (!allConnected) {
    return {
    success: false,
    reason: 'connection_timeout',
    message: 'Some worker bots failed to connect in time'
    };
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    availableWorkers = this.getAvailableWorkers(leaderName);
    selectedWorkers = spawnResult.workers.map(name =>
    availableWorkers.find(w => w.name === name)
    ).filter(w => w);
    }

    if (selectedWorkers.length === 0) {
    return {
    success: false,
    reason: 'no_workers',
    message: 'No suitable workers available'
    };
    }

    return await this.delegateTaskWithCoordination(leaderName, taskDescription, selectedWorkers, analysis);

    } catch (error) {
    console.error('[HierarchicalBot] Error in spawnAndDelegateTask:', error);
    return {
    success: false,
    reason: 'error',
    message: 'Error: ' + error.message
    };
    }
    }

    async delegateTaskWithCoordination(leaderName, taskDescription, selectedWorkers, analysis) {
    try {
    const workspaceId = 'workspace_' + Date.now();
    this.createWorkspace(workspaceId, leaderName, selectedWorkers.map(w => w.name), analysis.taskType);

    const taskBreakdown = this.breakDownTaskWithCoordination(analysis, selectedWorkers, workspaceId);

    const assignments = [];
    for (let i = 0; i < taskBreakdown.length; i++) {
    const assignment = taskBreakdown[i];
    console.log('[HierarchicalBot] Assigning coordinated task to ' + assignment.workerName + ': ' + assignment.task);

    const result = await this.assignTaskToWorker(leaderName, assignment.workerName, assignment.task);
    assignments.push(result);

    if (i === 0 && taskBreakdown.length > 1) {
    console.log('[HierarchicalBot] Waiting for lead worker to establish location...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    } else if (i < taskBreakdown.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    }
    }

    const taskId = 'task_' + (++this.taskCounter);
    this.taskAssignments.set(taskId, {
    leaderName,
    taskDescription,
    analysis,
    workers: selectedWorkers.map(w => w.name),
    assignments,
    workspaceId,
    timestamp: Date.now()
    });

    if (!this.managedWorkers.has(leaderName)) {
    this.managedWorkers.set(leaderName, new Set());
    }
    selectedWorkers.forEach(worker => {
    this.managedWorkers.get(leaderName).add(worker.name);
    });

    setTimeout(() => this.monitorTaskProgressEnhanced(taskId), 10000);

    return {
    success: true,
    taskId,
    workspaceId,
    message: `Successfully spawned ${selectedWorkers.length} workers for task: "${taskDescription}". Workers: ${selectedWorkers.map(w => w.name).join(', ')}`,
    workersAssigned: selectedWorkers.map(w => w.name),
    taskBreakdown: taskBreakdown.map(t => ({ worker: t.workerName, task: t.task }))
    };

    } catch (error) {
    console.error('[HierarchicalBot] Error in delegateTaskWithCoordination:', error);
    return {
    success: false,
    reason: 'error',
    message: 'Error delegating task: ' + error.message
    };
    }
    }

    // Utility methods
    async releaseWorker(supervisorName, workerName) {
    try {
    console.log('[HierarchicalBot] ' + supervisorName + ' releasing worker ' + workerName);

    if (this.managedWorkers.has(supervisorName)) {
    this.managedWorkers.get(supervisorName).delete(workerName);

    if (this.managedWorkers.get(supervisorName).size === 0) {
    this.managedWorkers.delete(supervisorName);
    }
    }

    return {
    success: true,
    message: 'Worker \'' + workerName + '\' released'
    };

    } catch (error) {
    console.error('[HierarchicalBot] Error releasing worker:', error);
    return {
    success: false,
    error: error.message
    };
    }
    }
}

export default HierarchicalBotManager;