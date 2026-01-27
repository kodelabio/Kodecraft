[1.1.1] 
### Fixed
- Added teleportWorker skill to allow the leader to teleport workers
- Added !teleportWorker action to execute the skill
- Added /api/agent/teleport-worker endpoint in external_api.js
- Updated spawnWorker() to teleport workers to safe locations near the leader when they spawn
- Fixed profile loading in agent.js to use settings.profile if available
- Loaded modes from kodecraft.json so cheat mode is enabled
- Rebuilt Docker to pick up the updated profile with cheat mode

The workers now spawn and are instantly teleported to safe positions near the leader, solving the pathfinding distance problem we had earlier.

[1.1.2]
### Fixed bugs on pathfinding and teleporting




