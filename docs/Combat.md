# Combat System Documentation

## Overview

The Kodecraft Combat System enables multi-bot coordinated attacks on mobs, animals, players, and other bots. It uses the existing orchestration infrastructure to spawn soldier bots, arm them with equipment, position them tactically, and execute coordinated combat missions.

---

## Table of Contents

1. [Combat Types](#combat-types)
2. [API Endpoints](#api-endpoints)
3. [Combat Workflow](#combat-workflow)
4. [Combat Prompt (Tactician)](#combat-prompt-tactician)
5. [Code Patterns](#code-patterns)
6. [Equipment System](#equipment-system)
7. [Configuration](#configuration)
8. [Troubleshooting](#troubleshooting)
9. [Known Issues & Fixes](#known-issues--fixes)

---

## Combat Types

The system supports six combat types:

| Combat Type | Description | Execution Type |
|------------|-------------|----------------|
| `mob_hunt` | Attack hostile mobs (zombie, skeleton, iron_golem, etc.) | single/multibot |
| `animal_hunt` | Attack passive animals (cow, pig, sheep, etc.) | single/multibot |
| `pvp_player` | Attack a specific player by name | single/multibot |
| `internal_pvp` | Sparring between bots from same leader | multibot |
| `cross_user_pvp` | Attack bots from different leaders | multibot |
| `combat_mode` | Sustained area defense against hostiles | single/multibot |

### Target Type Detection

| Keywords in Request | Target Type | Code Pattern |
|--------------------|-------------|--------------|
| zombie, skeleton, creeper, iron_golem | `mob` | `e.name === 'zombie'` |
| cow, pig, sheep, chicken | `animal` | `e.name === 'cow'` |
| "attack [PlayerName]", "pvp" | `player` | `bot.players['Name']?.entity` |
| "spar", "bot vs bot" | `friendly_bot` | `bot.players['BotName']?.entity` |
| "combat mode", "defend" | `hostiles` | `hostileTypes.includes(e.name)` |

---

## API Endpoints

### Core Orchestration Endpoints (Existing)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orchestration/spawn-worker` | POST | Spawn a soldier bot |
| `/api/orchestration/wait-workers` | POST | Wait for soldiers to be ready |
| `/api/orchestration/create-session` | POST | Create combat session |
| `/api/orchestration/register-workers` | POST | Register soldiers for session |
| `/api/orchestration/reserve-location` | POST | Reserve combat location |
| `/api/orchestration/teleport-workers` | POST | Position soldiers |
| `/api/orchestration/send-task` | POST | Send combat task to soldier |
| `/api/orchestration/status` | GET | Get orchestration status |
| `/api/orchestration/stop-all` | POST | Stop all soldiers |

### Combat-Specific Endpoints (New)

#### ARM Workers
Equip soldiers with weapons and armor.

```
POST /api/orchestration/arm-workers
```

**Request Body:**
```json
{
  "sessionId": "combat_123456",
  "equipment": {
    "weapon": "iron_sword",
    "armor": ["iron_helmet", "iron_chestplate", "iron_leggings", "iron_boots"],
    "offhand": "shield",
    "extras": [{"item": "golden_apple", "count": 3}]
  }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "combat_123456",
  "workersArmed": 2,
  "totalWorkers": 2,
  "equipment": { ... },
  "results": [
    {
      "workerName": "Soldier1",
      "itemsGiven": ["iron_sword", "iron_helmet", ...],
      "errors": [],
      "success": true
    }
  ]
}
```

#### ARM Single Worker
Equip a specific soldier.

```
POST /api/orchestration/arm-worker
```

**Request Body:**
```json
{
  "workerName": "Soldier1",
  "equipment": {
    "weapon": "diamond_sword"
  }
}
```

### Default Equipment Loadout

If no equipment is specified, soldiers receive:
- **Weapon:** `iron_sword`
- **Armor:** Full iron set (helmet, chestplate, leggings, boots)
- **Offhand:** `shield`

---

## Combat Workflow

### Complete Combat Sequence

```
┌─────────────────────────────────────────────────────────────┐
│                    COMBAT WORKFLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. SPAWN SOLDIERS                                          │
│     POST /api/orchestration/spawn-worker (×N)               │
│     └─ Creates worker bots on specified ports               │
│                                                             │
│  2. WAIT FOR READY                                          │
│     POST /api/orchestration/wait-workers                    │
│     └─ Polls health endpoints until all respond             │
│                                                             │
│  3. CREATE SESSION                                          │
│     POST /api/orchestration/create-session                  │
│     └─ Initializes session tracking                         │
│                                                             │
│  4. REGISTER WORKERS                                        │
│     POST /api/orchestration/register-workers                │
│     └─ Associates soldiers with session                     │
│                                                             │
│  5. ⚔️ ARM WORKERS (CRITICAL FOR COMBAT)                    │
│     POST /api/orchestration/arm-workers                     │
│     └─ Gives weapons/armor via /give command                │
│     └─ Wait 2-3 seconds for items to enter inventory        │
│                                                             │
│  6. RESERVE LOCATION                                        │
│     POST /api/orchestration/reserve-location                │
│     └─ Uses leader's Y position for ground level            │
│                                                             │
│  7. TELEPORT WORKERS                                        │
│     POST /api/orchestration/teleport-workers                │
│     └─ Positions soldiers around target area                │
│                                                             │
│  8. SEND COMBAT TASKS                                       │
│     POST /api/orchestration/send-task (×N)                  │
│     └─ Each soldier receives role-specific instructions     │
│                                                             │
│  9. MONITOR / WAIT                                          │
│     Workers execute independently                           │
│     └─ Callbacks report completion                          │
│                                                             │
│  10. CLEANUP                                                │
│      POST /api/orchestration/stop-all                       │
│      └─ Terminates all soldier processes                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Example: 2-Soldier Iron Golem Attack

```bash
# 1. Spawn soldiers
curl -X POST http://localhost:4001/api/orchestration/spawn-worker \
  -H "Content-Type: application/json" \
  -d '{"name": "Soldier1", "port": 4002, "sessionId": "combat_123"}'

curl -X POST http://localhost:4001/api/orchestration/spawn-worker \
  -H "Content-Type: application/json" \
  -d '{"name": "Soldier2", "port": 4003, "sessionId": "combat_123"}'

# 2. Wait for ready
curl -X POST http://localhost:4001/api/orchestration/wait-workers \
  -H "Content-Type: application/json" \
  -d '{"workers": [{"name": "Soldier1", "port": 4002}, {"name": "Soldier2", "port": 4003}]}'

# 3. Create session
curl -X POST http://localhost:4001/api/orchestration/create-session \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "combat_123", "buildRequest": "Kill iron golem", "workerCount": 2}'

# 4. Register workers
curl -X POST http://localhost:4001/api/orchestration/register-workers \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "combat_123", "workers": [{"name": "Soldier1", "port": 4002}, {"name": "Soldier2", "port": 4003}]}'

# 5. ARM WORKERS (critical!)
curl -X POST http://localhost:4001/api/orchestration/arm-workers \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "combat_123"}'

# Wait 2-3 seconds for items to enter inventory

# 6. Reserve location
curl -X POST http://localhost:4001/api/orchestration/reserve-location \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "combat_123", "preferredLocation": {"x": 100, "y": 64, "z": 200}}'

# 7. Teleport workers
curl -X POST http://localhost:4001/api/orchestration/teleport-workers \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "combat_123", "buildLocation": {"x": 100, "y": 64, "z": 200}}'

# 8. Send combat tasks (generated by Combat Tactician prompt)
curl -X POST http://localhost:4001/api/orchestration/send-task \
  -H "Content-Type: application/json" \
  -d '{"workerPort": 4002, "taskPrompt": "COMBAT MISSION: ..."}'
```

---

## Combat Prompt (Tactician)

The Combat Tactician is a system prompt that generates combat instructions for soldiers.

### Key Responsibilities

1. **Detect combat type** from user request
2. **Determine worker count** (single vs multibot)
3. **Assign roles** (Tank, Flanker, Ranged, Support)
4. **Generate tactical instructions** for each soldier
5. **Ensure code patterns** follow constraints

### Combat Roles

| Role | Engage Delay | Position | Health Threshold |
|------|--------------|----------|------------------|
| **Tank** | 0ms (first) | Front | 12 HP (6 hearts) |
| **Flanker** | 1500ms | Side/rear | 14 HP (7 hearts) |
| **Ranged** | 1000ms | 15+ blocks | 10 HP (5 hearts) |
| **Support** | 2000ms | Behind | 16 HP (8 hearts) |

### Coordination Strategies

| Strategy | Description | Soldiers |
|----------|-------------|----------|
| `pincer` | Attack from opposite sides | 2+ |
| `frontal-assault` | All attack from front | any |
| `defensive-hold` | Hold position, attack threats | any |
| `kiting` | Ranged attack with retreat | 2+ |
| `surround` | Encircle target | 3+ |

---

## Code Patterns

### Banned Code (Will Break)

```javascript
// ❌ NEVER USE - Pathfinder not available
bot.pathfinder.goto()
bot.pathfinder.setGoal()
new GoalNear()
new GoalBlock()
new GoalFollow()
bot.navigate

// ❌ NEVER USE - Infinite loops
skills.stay(bot, -1)    // Hangs forever
while (true) { }        // No exit condition
```

### Required Code Patterns

#### Combat Template (Mandatory Structure)

```javascript
// === COMBAT TEMPLATE ===
const SOLDIER_NAME = 'Soldier1';
const TARGET_TYPE = 'iron_golem';
const SEARCH_RANGE = 30;
const MELEE_RANGE = 3.5;
const RETREAT_HEALTH = 12;
const MAX_COMBAT_TIME = 60000;  // 60 seconds

console.log(`[${SOLDIER_NAME}] === COMBAT START ===`);

// STEP 1: Equip weapon
const weapon = bot.inventory.items().find(i => i.name.includes('sword')) || 
               bot.inventory.items().find(i => i.name.includes('axe')) || null;
console.log(`[${SOLDIER_NAME}] Weapon:`, weapon ? weapon.name : 'NONE (fists)');
if (weapon) await bot.equip(weapon, 'hand');

// STEP 2: Find target
let target = Object.values(bot.entities).find(e => 
    e.name === TARGET_TYPE && 
    e.position.distanceTo(bot.entity.position) < SEARCH_RANGE
);

if (!target) {
    console.log(`[${SOLDIER_NAME}] ERROR: No target found`);
    return;
}

// STEP 3: Combat loop with timeout
const startTime = Date.now();
let hits = 0;

while (target && target.isValid) {
    // TIMEOUT CHECK (mandatory)
    if (Date.now() - startTime > MAX_COMBAT_TIME) {
        console.log(`[${SOLDIER_NAME}] TIMEOUT`);
        break;
    }
    
    // HEALTH CHECK (mandatory)
    if (bot.health < RETREAT_HEALTH) {
        console.log(`[${SOLDIER_NAME}] LOW HEALTH, RETREATING`);
        bot.setControlState('back', true);
        await skills.wait(bot, 1500);
        bot.setControlState('back', false);
        break;
    }
    
    const distance = target.position.distanceTo(bot.entity.position);
    
    // RANGE CHECK
    if (distance > SEARCH_RANGE) break;
    
    await bot.lookAt(target.position);
    
    // MELEE RANGE CHECK (mandatory)
    if (distance <= MELEE_RANGE) {
        await bot.attack(target);
        hits++;
    } else {
        // Close distance
        bot.setControlState('forward', true);
        bot.setControlState('sprint', true);
        await skills.wait(bot, 300);
        bot.setControlState('forward', false);
        bot.setControlState('sprint', false);
    }
    
    await skills.wait(bot, 350);
    target = bot.entities[target.id];  // Refresh target
}

console.log(`[${SOLDIER_NAME}] Combat complete. Hits: ${hits}`);
```

#### Target Finding Patterns

```javascript
// For mobs/animals
let target = Object.values(bot.entities).find(e => 
    e.name === 'iron_golem' && 
    e.position.distanceTo(bot.entity.position) < 30
);

// For players/bots (PvP)
let target = bot.players['PlayerName']?.entity;

// For combat mode (multiple hostiles)
const hostileTypes = ['zombie', 'skeleton', 'creeper', 'spider'];
let target = Object.values(bot.entities)
    .filter(e => hostileTypes.includes(e.name))
    .filter(e => e.position.distanceTo(bot.entity.position) < 20)
    .sort((a, b) => a.position.distanceTo(bot.entity.position) - 
                   b.position.distanceTo(bot.entity.position))[0];
```

#### Movement Without Pathfinder

```javascript
// Move forward
bot.setControlState('forward', true);
bot.setControlState('sprint', true);
await skills.wait(bot, 300);
bot.setControlState('forward', false);
bot.setControlState('sprint', false);

// Retreat
bot.setControlState('back', true);
await skills.wait(bot, 1500);
bot.setControlState('back', false);

// Strafe (for flanking)
bot.setControlState('left', true);  // or 'right'
await skills.wait(bot, 500);
bot.setControlState('left', false);
```

---

## Equipment System

### How Arming Works

1. Leader bot executes `/give` commands via `bot.chat()`
2. Items are given to soldiers by name
3. Soldiers must equip items manually in combat code

### Equipment Options

| Slot | Options | Default |
|------|---------|---------|
| weapon | `iron_sword`, `diamond_sword`, `netherite_sword`, `bow` | `iron_sword` |
| armor | Array of pieces | Full iron set |
| offhand | `shield`, `totem_of_undying`, `null` | `shield` |
| extras | Array of items with counts | `[]` |

### Example Equipment Configurations

```json
// Standard melee
{
  "weapon": "iron_sword",
  "armor": ["iron_helmet", "iron_chestplate", "iron_leggings", "iron_boots"],
  "offhand": "shield"
}

// Diamond elite
{
  "weapon": "diamond_sword",
  "armor": ["diamond_helmet", "diamond_chestplate", "diamond_leggings", "diamond_boots"],
  "offhand": "shield",
  "extras": [{"item": "golden_apple", "count": 5}]
}

// Ranged
{
  "weapon": "bow",
  "armor": ["leather_helmet", "leather_chestplate", "leather_leggings", "leather_boots"],
  "offhand": null,
  "extras": [{"item": "arrow", "count": 64}]
}
```

---

## Configuration

### Combat Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `maxCombatTime` | 60000ms | Combat timeout |
| `searchRange` | 30 blocks | Max target detection range |
| `meleeRange` | 3.5 blocks | Attack range |
| `retreatHealth` | 12 HP | Health threshold to retreat |

### Superflat World Support

The system uses the leader bot's Y position as ground level, which works correctly for:
- Normal worlds (Y ~64)
- Superflat worlds (Y ~-60)
- Custom worlds (any Y)

```javascript
// In orchestration_api.js
getLeaderGroundLevel() {
    const bot = this.agent?.bot;
    return Math.floor(bot.entity.position.y);
}
```

---

## Troubleshooting

### Common Issues

#### 1. Soldiers Fighting with Fists

**Symptom:** Logs show `Weapon: NONE (fists)`

**Causes:**
- `/give` command not executed
- Items dropped on ground (inventory full)
- Items not in inventory when combat starts

**Solutions:**
- Add 2-3 second delay after arming before combat
- Verify inventory via `/api/agent/inventory`
- Check for "Unknown entity item" errors (items on ground)

#### 2. "No Target Found" Error

**Symptom:** `[Soldier1] ERROR: No iron_golem found within 30 blocks!`

**Causes:**
- Target not in range
- Target name doesn't match exactly
- Chunks not loaded

**Solutions:**
- Move soldiers closer to target
- Verify target type name (e.g., `iron_golem` not `irongolem`)
- Increase search range

#### 3. Combat Timeout Without Kill

**Symptom:** `TIMEOUT - combat exceeded 60s` with many hits

**Causes:**
- Fighting with fists (1 damage vs 100 HP)
- Attacking from outside melee range
- Multiple targets (switching between them)

**Solutions:**
- Ensure weapons are equipped
- Verify melee range check is working
- Pass target coordinates for shared targeting

#### 4. Pathfinding Errors

**Symptom:** `Pathfinding stopped: Path was stopped before it could be completed!`

**Causes:**
- Soldiers spawned at wrong Y level
- Obstacles blocking path

**Solutions:**
- Verify `getLeaderGroundLevel()` returns correct Y
- Move leader to clear area before spawning

#### 5. Bot Disconnects During Combat

**Symptom:** `Bot disconnected! Killing agent process.`

**Causes:**
- Invalid commands (e.g., `/give undefined`)
- Server kicked bot
- Network issues

**Solutions:**
- Verify worker names in session
- Check server logs for kick reasons
- Add error handling around commands

---

## Known Issues & Fixes

### Issue: Y=-60 Treated as Void

**Problem:** Superflat worlds use Y=-60 as surface, but code assumed Y=64.

**Fix:** Use leader's current Y position instead of scanning:
```javascript
// orchestration_api.js
reserveBuildLocation(sessionId, preferredLocation, minDistance = 30) {
    const leaderY = this.getLeaderGroundLevel();
    buildLocation.y = leaderY;  // Use leader's Y directly
}
```

### Issue: Worker Names Undefined

**Problem:** `armWorkers()` gave items to `undefined` because worker objects lacked `name` property.

**Fix:** Look up worker name by port from workers Map:
```javascript
let resolvedName = worker.name;
if (!resolvedName && worker.port) {
    for (const [name, info] of this.workers.entries()) {
        if (info.port === worker.port) {
            resolvedName = name;
            break;
        }
    }
}
```

### Issue: `_wait` Not a Function

**Problem:** Helper method missing from OrchestrationAPI class.

**Fix:** Add the helper method:
```javascript
_wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Issue: Items Dropped on Ground

**Problem:** `/give` executes but items appear as ground entities instead of inventory.

**Cause:** Workers not fully spawned when `/give` runs.

**Fix:** Add delay after worker spawn before arming:
```javascript
// In armWorkers, at the start:
await this._wait(3000);  // Wait 3 seconds for full spawn
```

---

## Files Modified

| File | Changes |
|------|---------|
| `orchestration_api.js` | Added `armWorkers()`, `armWorker()`, `_wait()`, `getLeaderGroundLevel()`, fixed `reserveBuildLocation()` |
| `external_api.js` | Added routes and handlers for `/api/orchestration/arm-workers`, `/api/orchestration/arm-worker` |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01 | Initial combat system |
| 1.1 | 2025-01 | Added arming API |
| 1.2 | 2025-01 | Fixed superflat Y coordinate handling |
| 1.3 | 2025-01 | Fixed worker name resolution |

---

## Future Improvements

- [ ] Add inventory verification after arming
- [ ] Support ranged combat with bows
- [ ] Add potion support (healing, strength)
- [ ] Implement retreat to rally point
- [ ] Add target sharing via coordinates
- [ ] Combat statistics and reporting
