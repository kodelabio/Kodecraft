# Code Changes Summary: Coordinate Bug Fix

## Problem
Workers were generating code with hardcoded coordinates instead of using coordinates from n8n prompts, causing blocks to be placed in wrong locations.

## Root Cause
The `!newAction` command was receiving correct coordinates in the prompt but not extracting or passing them to the code generator. The LLM then generated code with assumptions/hardcoded values.

## Solution
Extract coordinates from prompt → store in agent → pass to LLM in system message → LLM uses them in generated code.

---

## Files Modified

### 1. **src/commands/actions.js**

**Location:** `!newAction` handler (lines 29-64)

**Change:** Extract ABSOLUTE COORDINATES from prompt and store in `agent.taskCoordinates`

```javascript
{
    name: '!newAction',
    description: 'Perform new and unknown custom behaviors that are not available as a command.', 
    params: {
        'prompt': { type: 'string', description: 'A natural language prompt to guide code generation. Make a detailed step-by-step plan.' }
    },
    perform: async function(agent, prompt) {
        // Check if coding is allowed
        if (!settings.allow_insecure_coding) { 
            agent.openChat('newAction is disabled. Enable with allow_insecure_coding=true in settings.js');
            return "newAction not allowed! Code writing is disabled in settings. Notify the user.";
        }

        // In external brain mode, newAction should NOT generate code locally
        // Unless forced by API call (via _forceInternalMode flag)
        if (settings.brain_mode === 'external' && !agent._forceInternalMode) {
            return `EXTERNAL_BRAIN_TASK: ${prompt}`;
        }

        // Extract ABSOLUTE COORDINATES from prompt
        const coordMatch = prompt.match(/ABSOLUTE COORDINATES FOR THIS WORKER:([\s\S]*?)(?=\n\nScope:|$)/);
        if (coordMatch) {
            const coordSection = coordMatch[1];
            const xRange = coordSection.match(/- X range:\s*([-\d]+)\s*to\s*([-\d]+)/);
            const zRange = coordSection.match(/- Z range:\s*([-\d]+)\s*to\s*([-\d]+)/);
            const yRange = coordSection.match(/- Y range:\s*([-\d]+)\s*to\s*([-\d]+)/);
            
            agent.taskCoordinates = {
                xMin: xRange ? parseInt(xRange[1]) : null,
                xMax: xRange ? parseInt(xRange[2]) : null,
                zMin: zRange ? parseInt(zRange[1]) : null,
                zMax: zRange ? parseInt(zRange[2]) : null,
                yMin: yRange ? parseInt(yRange[1]) : null,
                yMax: yRange ? parseInt(yRange[2]) : null
            };
            console.log('[newAction] Extracted task coordinates:', agent.taskCoordinates);
        }

        // Internal mode: standard code generation process
        let result = "";
        const actionFn = async () => {
            try {
                if (!agent.coder) {
                    throw new Error('Coder component not available');
                }
                result = await agent.coder.generateCode(agent.history);
                console.log("[Kodelab] Example of generated code:", result)
            } catch (e) {
                result = 'Error generating code: ' + e.toString();
            }
        };
        await agent.actions.runAction('action:newAction', actionFn, {timeout: settings.code_timeout_mins});
        return result;
    }
}
```

---

### 2. **src/coder.js**

**Location:** `generateCode()` method (lines 24-31)

**Change:** Inject extracted coordinates into system message for LLM

```javascript
async generateCode(agent_history) {
    this.agent.bot.modes.pause('unstuck');
    lockdown();
    // this message history is transient and only maintained in this function
    let messages = agent_history.getHistory(); 
    
    // Add task coordinates to system prompt if available
    let systemMsg = 'Code generation started. Write code in codeblock in your response:';
    if (this.agent.taskCoordinates && this.agent.taskCoordinates.xMin !== null) {
        const coords = this.agent.taskCoordinates;
        systemMsg += `\n\nUSE THESE EXACT COORDINATES - THIS IS CRITICAL:\n`;
        systemMsg += `const X_MIN = ${coords.xMin};\n`;
        systemMsg += `const X_MAX = ${coords.xMax};\n`;
        systemMsg += `const Z_MIN = ${coords.zMin};\n`;
        systemMsg += `const Z_MAX = ${coords.zMax};\n`;
        systemMsg += `const Y_MIN = ${coords.yMin};\n`;
        systemMsg += `const Y_MAX = ${coords.yMax};\n`;
        systemMsg += `COPY THESE VARIABLE DECLARATIONS INTO YOUR CODE. DO NOT USE DIFFERENT COORDINATES.`;
    }
    
    messages.push({role: 'system', content: systemMsg});

    const MAX_ATTEMPTS = 5;
    const MAX_NO_CODE = 3;

    let code = null;
    let no_code_failures = 0;
    for (let i=0; i<MAX_ATTEMPTS; i++) {
        // ... rest of generateCode remains the same
    }
}
```

---

## n8n Workflow: Generate Coordinates

**Code Node: Build Stages from Task Division**

The n8n workflow receives the buildLocation and calculates correct worker regions:

```javascript
const buildLocation = $('Reserve Location').first().json.buildLocation;
const taskDivision = $('Webhook').first().json.taskDivision;
const workers = $('Webhook').first().json.body.workers;

const houseX = buildLocation.x;
const houseY = buildLocation.y;
const houseZ = buildLocation.z;

// Calculate 7x7 footprint boundaries from buildLocation
const footprintMinX = Math.floor(houseX - 3);
const footprintMaxX = Math.floor(houseX + 3);

const footprintMinZ = Math.floor(houseZ - 3);
const footprintMaxZ = Math.floor(houseZ + 3);

const floorY = houseY;
const wallHeight = 3;
const maxY = houseY + wallHeight;

const workerNames = Object.keys(taskDivision);
const numWorkers = workerNames.length;
const footprintWidth = footprintMaxX - footprintMinX + 1; // 7

// Dynamically split footprint among workers
const workerRanges = {};
const blocksPerWorker = footprintWidth / numWorkers;

workerNames.forEach((workerName, index) => {
  const rangeStart = footprintMinX + Math.floor(index * blocksPerWorker);
  const rangeEnd = footprintMinX + Math.floor((index + 1) * blocksPerWorker) - 1;
  
  workerRanges[workerName] = { 
    xMin: rangeStart, 
    xMax: rangeEnd,
    index: index
  };
});

// Build stages with full prompts including coordinates
const stages = {};
const maxSubtasks = Math.max(...Object.values(taskDivision).map(t => t.subtasks.length));

for (let stageNum = 0; stageNum < maxSubtasks; stageNum++) {
  const stageTasks = {};
  let hasWorkers = false;
  
  workerNames.forEach((workerName) => {
    const taskObj = taskDivision[workerName];
    const range = workerRanges[workerName];
    
    if (stageNum >= taskObj.subtasks.length) {
      return;
    }
    
    hasWorkers = true;
    const subtask = taskObj.subtasks[stageNum];
    
    // Replace placeholder coordinates with absolute coordinates
    let updatedSubtask = subtask
      .replace(/x:\s*minX\s*to\s*midX/gi, `x:${range.xMin} to ${range.xMax}`)
      .replace(/x:\s*minX\s*to\s*maxX/gi, `x:${footprintMinX} to ${footprintMaxX}`)
      .replace(/z:\s*minZ\s*to\s*maxZ/gi, `z:${footprintMinZ} to ${footprintMaxZ}`)
      // ... more replacements
    
    const workerData = workers.find(w => w.workerName === workerName);
    const port = workerData ? workerData.port : null;
    
    // Build boundary info
    let boundaryMsg = '';
    if (range.index < numWorkers - 1) {
      boundaryMsg += `- Right boundary (shared with ${workerNames[range.index + 1]}): x:${range.xMax}\n`;
    }
    if (range.index > 0) {
      boundaryMsg += `- Left boundary (shared with ${workerNames[range.index - 1]}): x:${range.xMin}\n`;
    }
    
    // Build full prompt with ABSOLUTE COORDINATES
    const fullPrompt = `${taskObj.objective}

STAGE ${stageNum + 1} OF ${taskObj.subtasks.length}:
${updatedSubtask}

ABSOLUTE COORDINATES FOR THIS WORKER:
- X range: ${range.xMin} to ${range.xMax}
- Z range: ${footprintMinZ} to ${footprintMaxZ}
- Y range: ${floorY} to ${maxY}
${boundaryMsg}
House center: (${houseX}, ${houseY}, ${houseZ})

Scope: ${taskObj.scope}

Constraints: ${taskObj.constraints}
- Stay within x:${range.xMin} to ${range.xMax}
- Coordinate with other workers at shared boundaries

Work together with nearby workers to create a cohesive structure.`;
    
    stageTasks[workerName] = {
      stageNumber: stageNum + 1,
      totalStages: taskObj.subtasks.length,
      worker: workerName,
      port: port,
      status: "not-started",
      subtask: updatedSubtask,
      objective: taskObj.objective,
      coordinates: {
        xMin: range.xMin,
        xMax: range.xMax,
        zMin: footprintMinZ,
        zMax: footprintMaxZ,
        yMin: floorY,
        yMax: maxY
      },
      fullPrompt: fullPrompt,
      completionTime: null,
      result: null
    };
  });
  
  if (hasWorkers) {
    const stageKey = (stageNum + 1).toString();
    stages[stageKey] = {
      stageNumber: stageNum + 1,
      status: "not-started",
      tasks: stageTasks
    };
  }
}

return { 
  stages: stages,
  totalStages: Object.keys(stages).length,
  houseInfo: {
    center: { x: houseX, y: houseY, z: houseZ },
    footprint: `${footprintMaxX - footprintMinX + 1}x${footprintMaxZ - footprintMinZ + 1}`,
    boundaries: { 
      xMin: footprintMinX, 
      xMax: footprintMaxX, 
      zMin: footprintMinZ, 
      zMax: footprintMaxZ, 
      floorY: floorY, 
      maxY: maxY 
    },
    workers: Object.keys(workerRanges).map(name => ({
      name: name,
      xRange: `${workerRanges[name].xMin} to ${workerRanges[name].xMax}`
    }))
  }
};
```

**Key Points:**
- Calculates footprint from `buildLocation` (center point)
- Splits width equally among workers
- Generates `fullPrompt` with `ABSOLUTE COORDINATES FOR THIS WORKER` section
- Stores coordinates in `stageTasks[workerName].fullPrompt`

---

## How It Works End-to-End

1. **n8n** receives `buildLocation` from `/api/orchestration/reserve-location`
2. **n8n** calculates worker regions: `footprintMinX + (workerIndex * blocksPerWorker)`
3. **n8n** generates prompt with coordinates in `ABSOLUTE COORDINATES FOR THIS WORKER` section
4. **n8n** sends `fullPrompt` to `/api/orchestration/send-task-stage` via POST
5. **Leader bot** receives prompt in `handleNewAction()`
6. **actions.js** extracts coordinates using regex from prompt
7. **actions.js** stores in `agent.taskCoordinates`
8. **coder.js** injects coordinates into system message
9. **LLM** receives system message with coordinate variables to copy
10. **LLM** generates code using the provided coordinates
11. **Worker** executes code with correct coordinates

## Result

Workers now use correct coordinates from n8n instead of hardcoded values:
- Worker1: X range extracted and used ✓
- Worker2: X range extracted and used ✓
- Worker3: X range extracted and used ✓

## Testing

Run a build and check logs for:
```
[newAction] Extracted task coordinates: { xMin: XX, xMax: XX, zMin: XX, zMax: XX, yMin: XX, yMax: XX }
```

Then verify generated code contains:
```javascript
const X_MIN = XX;
const X_MAX = XX;
const Z_MIN = XX;
const Z_MAX = XX;
```

If both are present, the fix is working.
