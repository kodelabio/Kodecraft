## [1.1.1] 
### Fixed
- Added teleportWorker skill to allow the leader to teleport workers
- Added !teleportWorker action to execute the skill
- Added /api/agent/teleport-worker endpoint in external_api.js
- Updated spawnWorker() to teleport workers to safe locations near the leader when they spawn
- Fixed profile loading in agent.js to use settings.profile if available
- Loaded modes from kodecraft.json so cheat mode is enabled
- Rebuilt Docker to pick up the updated profile with cheat mode

The workers now spawn and are instantly teleported to safe positions near the leader, solving the pathfinding distance problem we had earlier.

## [1.1.2]
### Fixed 
- bugs on pathfinding and teleporting

## [1.1.3]
### Fixed
- leader to join game close to related player

## [1.1.4]
### Fixed
- disabled hunting mode as default
- fixed Oracle prompt to avoid confusion between Leader and Player
- Added "collect" action to the Collaborative Tasks workflow.
- Removed duplicated teleport when spawning workers (causing timeout exception)
- Fixed max-tokens error whem using GPT-5-mini, using max_completion_tokens instead
- Increased max_completion_tokens to 4096
- changed GPT class to use new OpenAI class
- workers hanging while collecting blocks

## [1.1.5]
### Fixed
- Bot does not move to player if too far from spawning location, changed to use teleport
- Fixed timeout on all movement API, set to 120 secs
- Workers callbacks

### Added
- teleport skill
- teleport to player skill

## [1.1.6]
### Fixed
- attack API changed to have a duration parameter to prevent hanging caused by unstuck mode
- Combat Execute Workflow changed to use move instead of Teleport

## [1.1.7]
### Fixed
- added an offset to workers return position (leader position) after a task so they do not overlap each other.
- mode set to item-collecting:false
```
  modified:   n8n/workflows/Execute-Collaborative-Task-mx65EmvqY85dm21O.json
  modified:   n8n/workflows/ExecuteCombatMulti-NoCode-AiQrHDm9C5iI218o.json
  modified:   n8n/workflows/Kodecraft-MultiBot-qlnYUVCrpRcQPuEH.json
  modified:   profiles/kodecraft.json
```

## [1.1.8]
### Fixed
- remove console.log from modes.js causing exception
- mode elbowroom set false by default
```
  modified:   src/agent/modes.js
```


## [1.1.9]
### Fixed
- workers are terminated in case leader receives a SIGINT
- changed the spawn workers logic to manage workers as a set instead with sequential numbers
- safe spawn location for workers nearby leader with random component
- disabled cowardice mode

```
        modified:   n8n/datatables/KodecraftPrompts.json
        modified:   n8n/workflows/Execute-Collaborative-Task-mx65EmvqY85dm21O.json
        modified:   n8n/workflows/ExecuteCombatMulti-NoCode-AiQrHDm9C5iI218o.json
        modified:   n8n/workflows/Kodecraft-MultiBot-qlnYUVCrpRcQPuEH.json
        modified:   n8n/workflows/Smart-Builder-Ae1zRtp4qBDhnxJW.json
        modified:   n8n/workflows/SpawnWorkers--Orchestrated--Multibot-kyIh8pdVMa2aWFYo.json
        modified:   n8n/workflows/startCollaborativeCombat-nzxC7sP3BpaXzKwQ.json
        modified:   profiles/kodecraft.json
        modified:   src/agent/api_server.js
        modified:   src/agent/external_api.js
        modified:   src/agent/leader_bot_manager.js
        modified:   src/agent/orchestration_api.js
  ```

## [1.2.0]
### Added
- build a structure based on a blueprint
- assign realms to agent
- workers can use alternate profiles
- limit movements do coordinates inside the realm

### Fixed
- avoid agents names conflict
- realms created starting close to spawn point
- workers movement validation

