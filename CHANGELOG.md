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

[1.1.3]
### Fixed
- leader to join game close to related player

[1.1.4]
### Fixed
- disabled hunting mode as default
- fixed Oracle prompt to avoid confusion between Leader and Player
- Added "collect" action to the Collaborative Tasks workflow.
- Removed duplicated teleport when spawning workers (causing timeout exception)
- Fixed max-tokens error whem using GPT-5-mini, using max_completion_tokens instead
- Increased max_completion_tokens to 4096
- changed GPT class to use new OpenAI class
- workers hanging while collecting blocks

[1.1.5]
### Fixed
- Bot does not move to player if too far from spawning location, changed to use teleport
- Fixed timeout on all movement API, set to 120 secs
- Workers callbacks

### Added
- teleport skill
- teleport to player skill





