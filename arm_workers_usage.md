


// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example 1: Arm all soldiers in a session with default gear (iron sword + armor)
 * 
 * curl -X POST http://localhost:4001/api/orchestration/arm-workers \
 *   -H "Content-Type: application/json" \
 *   -d '{"sessionId": "combat_123"}'
 * 
 * Response:
 * {
 *   "success": true,
 *   "sessionId": "combat_123",
 *   "workersArmed": 2,
 *   "totalWorkers": 2,
 *   "equipment": {
 *     "weapon": "iron_sword",
 *     "armor": ["iron_helmet", "iron_chestplate", "iron_leggings", "iron_boots"],
 *     "offhand": "shield"
 *   },
 *   "results": [...]
 * }
 */

/**
 * Example 2: Arm soldiers with diamond gear
 * 
 * curl -X POST http://localhost:4001/api/orchestration/arm-workers \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "sessionId": "combat_123",
 *     "equipment": {
 *       "weapon": "diamond_sword",
 *       "armor": ["diamond_helmet", "diamond_chestplate", "diamond_leggings", "diamond_boots"],
 *       "offhand": "shield",
 *       "extras": [{"item": "golden_apple", "count": 5}]
 *     }
 *   }'
 */

/**
 * Example 3: Arm soldiers with ranged weapons (for ranged combat role)
 * 
 * curl -X POST http://localhost:4001/api/orchestration/arm-workers \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "sessionId": "combat_123",
 *     "equipment": {
 *       "weapon": "bow",
 *       "armor": ["leather_helmet", "leather_chestplate", "leather_leggings", "leather_boots"],
 *       "offhand": null,
 *       "extras": [{"item": "arrow", "count": 64}]
 *     }
 *   }'
 */

/**
 * Example 4: Arm a single worker
 * 
 * curl -X POST http://localhost:4001/api/orchestration/arm-worker \
 *   -H "Content-Type: application/json" \
 *   -d '{"workerName": "Soldier1", "equipment": {"weapon": "netherite_sword"}}'
 */


// ============================================================================
// COMBAT WORKFLOW WITH ARMING
// ============================================================================

/**
 * Complete combat workflow:
 * 
 * 1. Spawn workers
 *    POST /api/orchestration/spawn-worker { name: "Soldier1", port: 4002, sessionId: "combat_123" }
 *    POST /api/orchestration/spawn-worker { name: "Soldier2", port: 4003, sessionId: "combat_123" }
 * 
 * 2. Wait for workers ready
 *    POST /api/orchestration/wait-workers { workers: [...], timeoutMs: 30000 }
 * 
 * 3. Create session
 *    POST /api/orchestration/create-session { sessionId: "combat_123", buildRequest: "Kill iron golem", workerCount: 2 }
 * 
 * 4. Register workers
 *    POST /api/orchestration/register-workers { sessionId: "combat_123", workers: [...] }
 * 
 * 5. ⚔️ ARM WORKERS (NEW STEP)
 *    POST /api/orchestration/arm-workers { sessionId: "combat_123" }
 * 
 * 6. Reserve location
 *    POST /api/orchestration/reserve-location { sessionId: "combat_123", preferredLocation: {...} }
 * 
 * 7. Teleport workers
 *    POST /api/orchestration/teleport-workers { sessionId: "combat_123", buildLocation: {...} }
 * 
 * 8. Send combat tasks
 *    POST /api/orchestration/send-task { workerPort: 4002, taskPrompt: "..." }
 *    POST /api/orchestration/send-task { workerPort: 4003, taskPrompt: "..." }
 */