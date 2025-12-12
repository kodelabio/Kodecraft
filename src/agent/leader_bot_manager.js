// src/agent/leader_bot_manager.js
import { AgentProcess } from '../process/agent_process.js';
import settings from '../../settings.js';

export class LeaderBotManager {
    constructor() {
        this.leaderBots = new Map();  // userId → { agentProcess, port, status }
        this.portToUserId = new Map();
        
        this.baseLeaderPort = settings.leader_bot_base_port || 5000;
        this.nextLeaderPort = this.baseLeaderPort;
        this.botIdleTimeout = settings.leader_bot_idle_timeout || 3600000;
        
        this.startCleanupTimer();
    }

    async getOrSpawnLeaderBot(userId, botName) {
        console.log(`[LeaderBotManager] getOrSpawnLeaderBot for user ${userId}`);

        if (this.leaderBots.has(userId)) {
            const existing = this.leaderBots.get(userId);
            
            if (existing.agentProcess.running) {
                console.log(`[LeaderBotManager] ♻️  Reusing existing leader bot for ${userId} on port ${existing.port}`);
                existing.lastActivity = Date.now();
                return {
                    success: true,
                    userId: userId,
                    port: existing.port,
                    status: 'existing'
                };
            } else {
                console.log(`[LeaderBotManager] ⚠️  Existing bot for ${userId} is dead, respawning...`);
                this.leaderBots.delete(userId);
                this.portToUserId.delete(existing.port);
            }
        }

        if (this.leaderBots.size >= settings.max_leader_bots) {
            console.error(`[LeaderBotManager] ❌ Maximum leader bots reached`);
            return {
                success: false,
                error: `Cannot spawn more leader bots. Maximum (${settings.max_leader_bots}) reached.`,
                code: 'capacity_exceeded'
            };
        }

        return await this.spawnLeaderBot(userId, botName);
    }

    async spawnLeaderBot(userId, botName) {
        const port = this.nextLeaderPort++;
        
        console.log(`[LeaderBotManager] 🚀 Spawning leader bot for user ${userId} on port ${port}`);

        try {
            // Create AgentProcess with name = botName
            const agentProcess = new AgentProcess(botName, port);
            
            // Handle process exit
            agentProcess.on('exit', (name) => {
                console.log(`[LeaderBotManager] ⚠️  Leader bot ${name} exited`);
                this.leaderBots.delete(userId);
                this.portToUserId.delete(port);
            });

            // Start the agent (load_memory=true, init_message=null, count_id=userId)
            agentProcess.start(true, null, userId);

            // Store leader bot info
            const leaderInfo = {
                userId: userId,
                port: port,
                botName: botName,
                agentProcess: agentProcess,
                status: 'spawning',
                spawnTime: Date.now(),
                lastActivity: Date.now()
            };

            this.leaderBots.set(userId, leaderInfo);
            this.portToUserId.set(port, userId);

            console.log(`[LeaderBotManager] ✓ Leader bot spawned for ${userId} (PID: ${agentProcess.process.pid})`);

            // Wait for bot to be ready
            const ready = await this.isWorkerReady(port, 30000);
            
            if (!ready) {
                console.error(`[LeaderBotManager] ❌ Leader bot ${userId} not ready after 30s`);
                agentProcess.stop();
                this.leaderBots.delete(userId);
                this.portToUserId.delete(port);
                
                return {
                    success: false,
                    userId: userId,
                    error: 'Leader bot failed to initialize',
                    code: 'initialization_timeout'
                };
            }

            leaderInfo.status = 'ready';

            return {
                success: true,
                userId: userId,
                port: port,
                status: 'ready',
                botName: botName,
                message: `Leader bot spawned successfully on port ${port}`
            };

        } catch (error) {
            console.error(`[LeaderBotManager] Failed to spawn leader bot for ${userId}:`, error);
            return {
                success: false,
                userId: userId,
                error: error.message,
                code: 'spawn_failed'
            };
        }
    }

    async isWorkerReady(port, timeout = 5000) {
        const startTime = Date.now();
        const checkInterval = 500;

        while (Date.now() - startTime < timeout) {
            try {
                const response = await fetch(`http://localhost:${port}/api/health`, {
                    method: 'GET',
                    timeout: 2000
                });

                if (response.ok) {
                    console.log(`[LeaderBotManager] ✓ Bot on port ${port} is ready`);
                    return true;
                }
            } catch (error) {
                // Not ready yet
            }

            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return false;
    }

    getLeaderBotForUser(userId) {
        const info = this.leaderBots.get(userId);
        
        if (!info) return null;

        if (!info.agentProcess.running) {
            this.leaderBots.delete(userId);
            this.portToUserId.delete(info.port);
            return null;
        }

        info.lastActivity = Date.now();
        return info;
    }

    getLeaderBotPort(userId) {
        const info = this.getLeaderBotForUser(userId);
        return info ? info.port : null;
    }

    cleanupIdleBots() {
        const currentTime = Date.now();
        const toDelete = [];

        this.leaderBots.forEach((info, userId) => {
            if (currentTime - info.lastActivity > this.botIdleTimeout) {
                console.log(`[LeaderBotManager] 🧹 Cleaning up idle bot for ${userId}`);
                toDelete.push(userId);
            }
        });

        toDelete.forEach(userId => {
            const info = this.leaderBots.get(userId);
            info.agentProcess.stop();
            this.leaderBots.delete(userId);
            this.portToUserId.delete(info.port);
        });

        if (toDelete.length > 0) {
            console.log(`[LeaderBotManager] ✓ Cleaned up ${toDelete.length} idle bots`);
        }
    }

    async stopAllLeaderBots() {
        console.log(`[LeaderBotManager] 🛑 Stopping all ${this.leaderBots.size} leader bots`);

        for (const [userId, info] of this.leaderBots) {
            try {
                info.agentProcess.stop();
                console.log(`[LeaderBotManager] ✓ Stopped leader bot for ${userId}`);
            } catch (error) {
                console.error(`[LeaderBotManager] Error stopping bot ${userId}:`, error.message);
            }
        }

        this.leaderBots.clear();
        this.portToUserId.clear();

        return { success: true, message: 'All leader bots stopped' };
    }

    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleBots();
        }, 600000); // 10 minutes

        console.log(`[LeaderBotManager] Started cleanup timer`);
    }

    getStatus() {
        const bots = [];
        
        this.leaderBots.forEach((info, userId) => {
            if (info.agentProcess.running) {
                bots.push({
                    userId: userId,
                    port: info.port,
                    botName: info.botName,
                    status: info.status,
                    uptime: Date.now() - info.spawnTime,
                    lastActivity: Date.now() - info.lastActivity,
                    pid: info.agentProcess.process.pid
                });
            }
        });

        return {
            totalLeaderBots: bots.length,
            maxCapacity: settings.max_leader_bots,
            utilizationPercent: Math.round((bots.length / settings.max_leader_bots) * 100),
            basePort: this.baseLeaderPort,
            nextPort: this.nextLeaderPort,
            bots: bots
        };
    }
}

export const leaderBotManager = new LeaderBotManager();