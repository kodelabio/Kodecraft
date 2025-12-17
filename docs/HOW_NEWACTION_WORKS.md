# How `newAction` Works: Complete Flow Documentation

## Overview

`newAction` is the core code generation engine that converts natural language instructions into executable JavaScript code. It's the bridge between tactical instructions and actual bot behavior.

**Flow:**
```
User/Instruction
    ↓
newAction API endpoint
    ↓
Prompter (with context injection)
    ↓
LLM (Claude/OpenRouter)
    ↓
Generated JavaScript code
    ↓
Code execution
    ↓
Output/Callback
```

---

## 1. The API Endpoint: `/api/agent/newAction`

**Location:** `external_api.js` → `handleNewAction()`

**Entry Point:**
```javascript
POST /api/agent/newAction
Body: { prompt: "COMBAT MISSION: Attack TheBoss..." }
```

**What happens:**
1. Request received with task prompt
2. Response sent immediately with taskId (202 Accepted status)
3. Task queued for execution in background
4. Code generation happens asynchronously
5. Callback sent when complete

**Example flow:**
```
n8n sends: POST /api/agent/newAction
           { prompt: "Find and attack TheBoss" }
           ↓
Bot responds: { success: true, taskId: 1766002728345, status: "queued" }
           ↓
(In background)
Generate code, execute, report completion via webhook
```

---

## 2. The Prompter: Context Injection

**Location:** `src/utils/prompter.js`

The Prompter is responsible for building the LLM prompt by injecting context into template placeholders.

### Prompt Template Structure

**Base prompt** (from `default.json` → `coding`):
```
You are an intelligent mineflayer bot $NAME that plays minecraft 
by writing javascript codeblocks...

$SELF_PROMPT
Summarized memory:'$MEMORY'
$STATS
$INVENTORY
$CODE_DOCS
$EXAMPLES
Conversation:
```

### What Gets Injected

#### `$CODE_DOCS` - Skill Documentation
**Purpose:** Tell the LLM which functions are available

**How it's selected:**
1. User prompt → "COMBAT MISSION: Attack TheBoss"
2. Skill library calculates similarity between prompt and each skill doc
3. Top N most relevant skills selected (default: 8)
4. Docs concatenated and injected into prompt

**Example output:**
```
#### RELEVANT CODE DOCS ###
The following functions are available to use:

skills.playerDetection
Find and attack player targets in combat. CRITICAL: Use ONLY for players, NOT mobs.

CORRECT USAGE FOR PLAYERS:
let target = bot.players['PlayerName'];
if (target?.entity) {
    const distance = target.entity.position.distanceTo(bot.entity.position);
    if (distance <= 3.5) {
        await bot.attack(target);  // Pass player object, not entity
    }
}

ANTI-PATTERNS - DO NOT USE:
❌ bot.nearestEntity(entity => entity.username === 'PlayerName')
...

skills.goToPlayer
Navigate to a player and attack them if nearby.
...

skills.wait
...
```

#### `$EXAMPLES` - Code Examples
**Purpose:** Show the LLM how to structure code

**How examples are selected:**
1. User conversation history → example text extracted
2. Cosine similarity calculated against all coding examples
3. Top 2 examples selected (configurable)
4. Formatted as conversation turns

**Example output:**
```
Examples of how to respond:

Example 1:
user: COMBAT MISSION: Attack enemy with 2 soldiers

SOLDIER: Soldier1
ROLE: TANK

OBJECTIVE: Engage target immediately, draw attention

TARGET: target_player (player)

INSTRUCTIONS:
Equip your best sword or axe. Search for the target within 30 blocks. 
Engage immediately from the front. Keep attacking for up to 60 seconds. 
If health drops below 7 hearts (14 HP), retreat immediately.

assistant: ```js
// Detect and attack player target - NO PATHFINDING
let target = bot.players['target_player'];

if (!target || !target.entity) {
    console.log('Target not found');
} else {
    const distance = target.entity.position.distanceTo(bot.entity.position);
    ...
}
```
```

#### `$STATS` - Bot Status
**Purpose:** Give LLM real-time context

Shows: position, health, hunger, gamemode, current action, etc.

#### `$INVENTORY` - Current Items
**Purpose:** Let LLM know what items are available

Example: `iron_sword (1), oak_log (5), dirt (64), ...`

#### `$MEMORY` - Persistent Context
**Purpose:** Remember previous conversations

---

## 3. The Skill Library: Making Functions Available

**Location:** `src/agent/library/`

### Architecture

```
skill_library.js (SkillLibrary class)
    ↓
Loads skill docs + embeddings
    ↓
On request: getRelevantSkillDocs(message, count)
    ↓
Returns top N matching skills
```

### How Skills Are Documented

Skills use **JSDoc comments inside the function**:

```javascript
export async function playerDetection(bot, playerName) {
    /**
     * Find and attack player targets in combat. CRITICAL: Use ONLY for players, NOT mobs.
     * 
     * CORRECT USAGE FOR PLAYERS:
     * let target = bot.players['PlayerName'];
     * if (target?.entity) {
     *     const distance = target.entity.position.distanceTo(bot.entity.position);
     *     if (distance <= 3.5) {
     *         await bot.attack(target);  // Pass player object, not entity
     *     }
     * }
     * 
     * ANTI-PATTERNS - DO NOT USE:
     * ❌ bot.nearestEntity(entity => entity.username === 'PlayerName')  // WRONG
     * ...
     */
    return bot.players[playerName] || null;
}
```

### Skill Extraction

**File:** `src/agent/library/index.js`

```javascript
export function getSkillDocs() {
    let docArray = [];
    docArray = docArray.concat(docHelper(Object.values(skills), 'skills'));
    docArray = docArray.concat(docHelper(Object.values(world), 'world'));
    return docArray;
}
```

The `docHelper()` function:
1. Iterates through all skill functions
2. Extracts JSDoc comment (between `/**` and `**/`)
3. Prepends function name: `skills.functionName`
4. Returns array of formatted docs

**Result:**
```
[
  "skills.playerDetection\nFind and attack player targets...",
  "skills.goToPlayer\nNavigate to a player...",
  "world.getPosition\nGet your position in the world...",
  ...
]
```

### Skill Selection by Similarity

**File:** `skill_library.js` → `getRelevantSkillDocs(message, select_num)`

**Algorithm:**

1. **Embed the user message** (using embedding model):
   ```
   message = "COMBAT MISSION: Attack TheBoss with 2 soldiers"
   embedding = await model.embed(message)
   ```

2. **Compare to all skill embeddings** (pre-computed and cached):
   ```javascript
   skill_doc_similarities = Object.keys(this.skill_docs_embeddings)
       .map(doc_key => ({
           doc_key,
           similarity_score: cosineSimilarity(
               latest_message_embedding, 
               this.skill_docs_embeddings[doc_key]
           )
       }))
       .sort((a, b) => b.similarity_score - a.similarity_score);
   ```

3. **Select top N** (default N=8):
   ```javascript
   let selected_docs = new Set(
       skill_doc_similarities.slice(0, select_num).map(doc => doc.doc_key)
   );
   ```

4. **Always include certain skills**:
   ```javascript
   // Always show these regardless of similarity
   this.always_show_skills = ['skills.placeBlock', 'skills.wait', 'skills.breakBlockAt']
   ```

5. **Return formatted docs**:
   ```
   #### RELEVANT CODE DOCS ###
   The following functions are available to use:
   skills.playerDetection
   ...
   skills.goToPlayer
   ...
   ```

### Embedding Cache

**File:** `src/utils/embedding_cache.js`

Pre-computed embeddings stored in `embeddings.json`:
```json
{
  "skills": {
    "playerDetection": {
      "doc": "skills.playerDetection\nFind and attack...",
      "embedding": [-0.0159, -0.0178, 0.0165, ...]
    },
    "goToPlayer": {
      "doc": "skills.goToPlayer\nNavigate to a player...",
      "embedding": [0.0234, -0.0089, 0.0412, ...]
    },
    ...
  }
}
```

**Why pre-compute?**
- Embedding API calls are slow (100+ skills × N embeddings)
- Cache makes skill selection instant
- Generated on startup, regenerated if skills change

---

## 4. The Examples System: Teaching Code Patterns

**Location:** `src/utils/examples.js`

### Purpose

Provide concrete code examples that teach the LLM HOW to structure code responses.

**Problem it solves:**
- LLM alone might generate wrong API patterns
- Examples show correct patterns for similar tasks
- Example-based retrieval > prompt engineering alone

### Example Structure

**File:** `default.json` → `coding` array

```javascript
[
  {
    "role": "user",
    "content": "COMBAT MISSION: Attack enemy with 2 soldiers\n\nSOLDIER: Soldier1\nROLE: TANK\n\nOBJECTIVE: Engage target immediately...\n\nTARGET: target_player (player)\n\nINSTRUCTIONS:\nEquip your best sword or axe. Search for the target within 30 blocks..."
  },
  {
    "role": "assistant",
    "content": "```js\n// Detect and attack player target - NO PATHFINDING\nlet target = bot.players['target_player'];\n\nif (!target || !target.entity) {\n    console.log('Target not found');\n} else {\n    const distance = target.entity.position.distanceTo(bot.entity.position);\n    if (distance <= 3.5) {\n        await bot.attack(target);\n    }\n}\n```"
  },
  {
    "role": "system",
    "content": "Code execution finished successfully."
  },
  {
    "role": "assistant",
    "content": "Combat complete. Target was found and attacked using direct movement."
  }
]
```

### Example Selection by Similarity

**File:** `src/utils/examples.js` → `getRelevant(turns)`

**Algorithm:**

1. **Extract text from conversation turns** (excluding assistant responses):
   ```javascript
   turnsToText(turns) {
       let messages = '';
       for (let turn of turns) {
           if (turn.role !== 'assistant')
               messages += turn.content.substring(...).trim() + '\n';
       }
       return messages.trim();
   }
   ```

2. **Embed the conversation text**:
   ```javascript
   let embedding = await this.model.embed(turn_text);
   ```

3. **Compare to all example embeddings**:
   ```javascript
   this.examples.sort((a, b) => 
       cosineSimilarity(embedding, this.embeddings[this.turnsToText(b)]) -
       cosineSimilarity(embedding, this.embeddings[this.turnsToText(a)])
   );
   ```

4. **Select top N** (default N=2):
   ```javascript
   let selected = this.examples.slice(0, this.select_num);
   ```

5. **Format for prompt**:
   ```
   Examples of how to respond:
   
   Example 1:
   [Full conversation turn shown here]
   
   Example 2:
   [Full conversation turn shown here]
   ```

### Problem: Wrong Examples Selected

**What happened before:**
- New combat example in `default.json` wasn't being selected
- Old navigation examples (`"zZZn98: come here"`) were ranked higher
- LLM copied navigation patterns instead of combat patterns

**Why:**
- Embedding cache was stale (pre-computed before new example added)
- Cosine similarity favored old examples

**Solution:**
- Delete `embeddings.json`
- Restart system to regenerate embeddings
- New example gets cached and selected properly

---

## 5. Complete Code Generation Flow

### Step-by-Step Process

```
1. User sends task via newAction API
   ↓
2. ExternalAPI.handleNewAction() receives request
   ↓
3. Response sent immediately (202 Accepted)
   ↓
4. Background task executes:
   
   a. Prompter.promptCoding(agent, conversationHistory)
      
      i. Load base coding prompt from settings
      ii. Create conversation with system message + user message
      iii. Call skillLibrary.getRelevantSkillDocs(userMessage)
           → Cosine similarity to select skills
           → Format docs into $CODE_DOCS
      iv. Call examples.getRelevant(conversationTurns)
           → Cosine similarity to select examples
           → Format examples into $EXAMPLES
      v. Inject: $STATS, $INVENTORY, $MEMORY
      vi. Replace all placeholders with actual values
      vii. Send final prompt to LLM
   
   b. LLM generates code
      (Sees $CODE_DOCS, $EXAMPLES, $STATS, $INVENTORY)
      → Generates JavaScript with correct skill patterns
      → Generates correct bot.players vs bot.nearestEntity patterns
   
   c. Coder receives generated code
      
      i. Lint code: check for skill errors
      ii. Extract referenced skills
      iii. Compare to available skills
      iv. Report errors or proceed
   
   d. Code execution
      
      i. Execute in bot context
      ii. Capture output
      iii. Report results
   
   e. Callback
      
      i. Report task completion via webhook
      ii. Include taskId, sessionId, duration
      iii. Include result/error

↓
5. n8n receives webhook callback
```

---

## 6. Skills Available: Two Types

### Type 1: Skills (Minecraft Actions)

**Location:** `src/agent/library/skills.js`

**Purpose:** Execute Minecraft-specific actions

**Examples:**
- `await skills.playerDetection(bot, 'PlayerName')` - Detect players
- `await skills.goToPlayer(bot, playerName, distance)` - Navigate to player
- `await skills.wait(bot, ms)` - Wait/sleep
- `await skills.placeBlock(bot, 'oak_log', x, y, z)` - Place block
- `await skills.breakBlockAt(bot, x, y, z)` - Break block
- `await skills.craftRecipe(bot, 'stick', 1)` - Craft item

**Key characteristic:** Interact with Minecraft world

### Type 2: World (Environment Queries)

**Location:** `src/agent/library/world.js`

**Purpose:** Query world state without modifying

**Examples:**
- `world.getPosition(bot)` - Get bot position
- `world.getNearestBlock(bot, 'diamond_ore', 32)` - Find nearest block
- `world.getNearbyPlayers(bot, 16)` - List nearby players
- `world.getInventoryCounts(bot)` - Get items and quantities
- `world.getNearbyEntityTypes(bot)` - List nearby mob types
- `world.isClearPath(bot, target)` - Check if path exists

**Key characteristic:** Query only, no side effects

### All Available Functions

**Skills (33 total):**
```
log, craftRecipe, placeBlock, breakBlockAt, collectBlocks,
attackNearestBlock, moveAway, moveAwayFromEntity, pickupNearbyItems,
goToNearestBlock, goToNearestEntity, goToPlayer, goToPosition, 
goToCoordinates, placeTorches, defendSelf, fight, eat, consume,
putInChest, takeFromChest, activateNearestBlock, openDoor, mineBlock,
giveToPlayer, followPlayer, stayAway, buildColumn, lookAtPlayer, 
lookAtEntity, lookAtPosition, playerDetection
```

**World (18 total):**
```
getPosition, getNearestBlock, getNearestBlocks, getNearbyEntities,
getNearestEntityWhere, getNearbyPlayers, getNearbyPlayerNames,
getNearbyBlockTypes, getNearbyEntityTypes, getInventoryStacks,
getInventoryCounts, getCraftableItems, getSurroundingBlocks,
getBlockAtPosition, getFirstBlockAboveHead, getBiomeName, shouldPlaceTorch,
isClearPath
```

---

## 7. Anti-Pattern Guidance: playerDetection Example

### The Problem

Generated code was using:
```javascript
let target = bot.nearestEntity(entity => entity.username === 'TheBoss');
```

This fails because **players are not in `bot.entities`**.

### The Solution: Skill Documentation

Added `playerDetection` skill with explicit anti-patterns:

```javascript
export async function playerDetection(bot, playerName) {
    /**
     * Find and attack player targets in combat. CRITICAL: Use ONLY for players, NOT mobs.
     * 
     * CORRECT USAGE FOR PLAYERS:
     * let target = bot.players['PlayerName'];
     * if (target?.entity) {
     *     const distance = target.entity.position.distanceTo(bot.entity.position);
     *     if (distance <= 3.5) {
     *         await bot.attack(target);  // Pass player object, not entity
     *     }
     * }
     * 
     * ANTI-PATTERNS - DO NOT USE:
     * ❌ bot.nearestEntity(entity => entity.username === 'PlayerName')  // WRONG - players are not entities
     * ❌ Object.values(bot.entities).find(e => e.username === 'PlayerName')  // WRONG - players not in entities
     * ❌ bot.nearestEntity() for player targets  // WRONG - only works for mobs
     * 
     * RULES:
     * - Players are ONLY in bot.players, NEVER in bot.entities
     * - Use bot.players[name] for player/bot targets
     * - Use bot.nearestEntity() or Object.values(bot.entities) for mobs/animals ONLY
     * - Always check target?.entity exists before using it
     * - Pass player object to bot.attack(), not the entity
     */
    return bot.players[playerName] || null;
}
```

### How It Works

1. **Skill is extracted** by `docHelper()` in `index.js`
2. **Embeddings regenerated** when `embeddings.json` deleted
3. **Skill selected** when message contains "combat" + "player"
4. **LLM sees doc** in `$CODE_DOCS` with correct pattern
5. **LLM generates** correct code using `bot.players`

---

## 8. Key Insight: Embedding Similarity is Everything

### Why Examples/Skills Get Selected

**The system relies on cosine similarity matching:**

```
User prompt embedding ← cosine similarity → Skill doc embedding
                                 ↓
                        Similarity score (0.0 to 1.0)
                                 ↓
                        Top N highest scores selected
```

### Example Matching

```
User: "COMBAT MISSION: Attack TheBoss with 2 soldiers..."
       ↓
Embedding created for user message
       ↓
Compare to all example embeddings:
- Combat example: similarity = 0.89 ✅ HIGH (selected)
- Building example: similarity = 0.23 ❌ LOW
- Navigation example: similarity = 0.34 ❌ LOW
       ↓
Combat example selected, shown to LLM
       ↓
LLM sees correct code pattern, generates similar code
```

### Skill Matching

```
User: "...attack from within 3.5 blocks..."
       ↓
Embedding created
       ↓
Compare to all skill embeddings:
- playerDetection: similarity = 0.87 ✅ HIGH (selected)
- goToPlayer: similarity = 0.65 (selected)
- placeBlock: similarity = 0.12 (not selected)
- wait: similarity = 0.08 (not selected, but always shown)
       ↓
playerDetection doc included in $CODE_DOCS
       ↓
LLM sees correct bot.players pattern
```

---

## 9. Debugging Tips

### If Wrong Code is Generated

1. **Check Selected Skills:**
   ```
   Selected skill docs: [
     'world.isClearPath',
     'skills.goToPlayer',
     ...
   ]
   ```
   - Are the right skills there?
   - Is `skills.playerDetection` included for player targets?

2. **Check Selected Examples:**
   ```
   selected examples:
   Example: zZZn98: come here
   Example: 234jeb: build a little tower with a torch on the side
   ```
   - Are examples relevant to the task?
   - Is the combat example showing up?

3. **If Embeddings Stale:**
   ```
   [SkillLibrary] Loaded 34 skill docs from file
   ```
   - Delete `embeddings.json`
   - Restart system
   - Embeddings regenerate with new skills

### If Skill Not Found

1. **Check JSDoc comment:**
   ```javascript
   export async function mySkill(bot) {
       /**
        * Description here
        * @param {Bot} bot
        */
   }
   ```
   - Must have `/**` and `**/`
   - Must be inside function, not before it

2. **Regenerate embeddings:**
   - Delete cache file
   - Restart system

---

## 10. Complete Example: Combat Code Generation

### Input

```
COMBAT MISSION: Attack TheBoss with 2 soldiers

SOLDIER: Soldier1
ROLE: TANK

INSTRUCTIONS:
Equip your best sword or axe. Search for TheBoss within 30 blocks. 
Attack from within 3.5 blocks. Keep attacking for up to 60 seconds. 
If health drops below 7 hearts (14 HP), retreat immediately.
```

### Skill Selection

```
Message: "Attack TheBoss with 2 soldiers...Search...within 30 blocks...within 3.5 blocks..."

Cosine similarity scores:
- skills.playerDetection: 0.87 ✅
- skills.goToPlayer: 0.65 ✅
- world.isClearPath: 0.52 ✅
- skills.wait: 0.41 ✅
- skills.defendSelf: 0.38 ✅
- skills.giveToPlayer: 0.22
- skills.consumeFood: 0.15

Selected: Top 8 (includes always_show: placeBlock, wait, breakBlockAt)
```

### Example Selection

```
Conversation: "COMBAT MISSION: Attack TheBoss..."

Cosine similarity scores:
- Combat example (bot.players pattern): 0.89 ✅
- Navigation example ("come here"): 0.34
- Building example ("tower with torch"): 0.23

Selected: Top 2 (combat example + 1 other)
```

### Prompt Injection

```
Base prompt: "You are an intelligent mineflayer bot $NAME..."

After injection:
"You are an intelligent mineflayer bot Lead329_W1...

$STATS:
Position: -419, -60, 7
Health: 20
Hunger: 20
Gamemode: survival

$INVENTORY:
iron_sword (1), oak_log (5), dirt (64), ...

$CODE_DOCS:
#### RELEVANT CODE DOCS ###
The following functions are available to use:

skills.playerDetection
Find and attack player targets in combat. CRITICAL: Use ONLY for players, NOT mobs.

CORRECT USAGE FOR PLAYERS:
let target = bot.players['PlayerName'];
if (target?.entity) {
    const distance = target.entity.position.distanceTo(bot.entity.position);
    if (distance <= 3.5) {
        await bot.attack(target);
    }
}

ANTI-PATTERNS - DO NOT USE:
❌ bot.nearestEntity(entity => entity.username === 'PlayerName')

skills.goToPlayer
Navigate to a player within the given distance...
...

$EXAMPLES:
Examples of how to respond:

Example 1:
user: COMBAT MISSION: Attack enemy with 2 soldiers...
assistant: ```js
let target = bot.players['target_player'];
if (!target?.entity) {
    console.log('Target not found');
} else {
    const distance = target.entity.position.distanceTo(bot.entity.position);
    if (distance <= 3.5) {
        await bot.attack(target);
    }
}
```

Conversation:
user: COMBAT MISSION: Attack TheBoss with 2 soldiers..."
```

### LLM Output

```javascript
// COMBAT MISSION: Tank role - engage TheBoss immediately
let target = bot.players['TheBoss'];

if (target?.entity) {
    let distance = target.entity.position.distanceTo(bot.entity.position);
    
    if (distance <= 30) {
        if (distance > 3.5) {
            await skills.goToPlayer(bot, 'TheBoss', 2);
        }
        
        while (bot.health > 14 && Date.now() - startTime < 60000) {
            target = bot.players['TheBoss'];
            
            if (!target?.entity) break;
            
            let currentDistance = target.entity.position.distanceTo(bot.entity.position);
            
            if (bot.health < 14) {
                break;
            }
            
            if (currentDistance <= 3.5) {
                await bot.attack(target);
            }
            
            await skills.wait(bot, 100);
        }
    }
}
```

✅ **Correct:** Uses `bot.players`, checks distance, attacks with `bot.attack(target)`

---

## Summary

| Component | Purpose | Location |
|-----------|---------|----------|
| **newAction API** | Entry point for code generation | external_api.js |
| **Prompter** | Injects context into LLM prompt | prompter.js |
| **SkillLibrary** | Selects relevant skills by similarity | skill_library.js |
| **Examples** | Provides code patterns | examples.js |
| **Skills** | Minecraft actions (with JSDoc) | skills.js |
| **World** | Environment queries (with JSDoc) | world.js |
| **Embedding Cache** | Pre-computed similarities | embeddings.json |
| **LLM** | Generates code | OpenRouter API |

**The key insight:** Everything relies on **cosine similarity matching** to select the right context (skills, examples) that guide the LLM toward correct code patterns.
