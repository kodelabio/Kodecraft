// src/agent/leader_bot_manager.js
import { AgentProcess } from '../process/agent_process.js';
import settings from '../../settings.js';

export class LeaderBotManager {
    constructor() {
        this.leaderBots = new Map();  // userId → { agentProcess, port, status }
        this.portToUserId = new Map();
        
        this.baseLeaderPort = settings.leader_base_port || 5000;
        this.nextLeaderPort = this.baseLeaderPort;
        this.botIdleTimeout = settings.leader_bot_idle_timeout || 3600000;
        
        this.startCleanupTimer();
    }
    
    async isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(false);
                } else {
                    resolve(false);
                }
            });
            
            server.once('listening', () => {
                server.close();
                resolve(true);
            });
            
            server.listen(port, '127.0.0.1');
        });
    }

    async checkBotHealth(port) {
        try {
            const response = await fetch(`http://localhost:${port}/api/health`, {
                method: 'GET',
                timeout: 2000
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async getOrSpawnLeaderBot(userId, botName) {
            const startTime = Date.now();
            console.log(`[LeaderBotManager] 🔍 getOrSpawnLeaderBot - userId: ${userId}, botName: ${botName}`);
            console.log(`   Map size: ${this.leaderBots.size}/${settings.max_leader_bots}`);

            if (this.leaderBots.has(userId)) {
                const existing = this.leaderBots.get(userId);
                console.log(`[LeaderBotManager] 📋 Found existing - port: ${existing.port}, running: ${existing.agentProcess?.running}`);
                
                // Verify the bot is actually responding
                if (existing.agentProcess?.running) {
                    const isHealthy = await this.checkBotHealth(existing.port);
                    
                    if (isHealthy) {
                        console.log(`[LeaderBotManager] ✅ Reusing on port ${existing.port}`);
                        existing.lastActivity = Date.now();
                        return { success: true, userId, port: existing.port, status: 'existing' };
                    } else {
                        console.warn(`[LeaderBotManager] ⚠️  Bot marked running but not responding, cleaning up`);
                        existing.agentProcess?.stop();
                        this.leaderBots.delete(userId);
                        this.portToUserId.delete(existing.port);
                    }
                }
            }

            if (this.leaderBots.size >= settings.max_leader_bots) {
                console.error(`[LeaderBotManager] ❌ CAPACITY EXCEEDED: ${this.leaderBots.size}/${settings.max_leader_bots}`);
                console.error(`   Active users: ${Array.from(this.leaderBots.keys()).join(', ')}`);
                return { success: false, error: `Max bots (${settings.max_leader_bots}) reached`, code: 'capacity_exceeded' };
            }

            console.log(`[LeaderBotManager] 🚀 Spawning new bot...`);
            const result = await this.spawnLeaderBot(userId, botName);
            console.log(`[LeaderBotManager] ⏱️  Done in ${Date.now() - startTime}ms - success: ${result.success}`);
            return result;
        }

    async spawnLeaderBot(userId, botName) {
        const port = this.nextLeaderPort++; 
        const countId = this.leaderBots.size;
    
        this.nextLeaderPort = port + 1;

    
        userId = String(userId);  // ← Normalize to string
        
        console.log(`[LeaderBotManager] 🚀 Spawning leader bot for user ${userId} on port ${port}`);

        try {
            // Create AgentProcess with name = botName
            const agentProcess = new AgentProcess(botName, port);
            
            // Handle process exit
            agentProcess.on('exit', async (name) => {
                console.log(`[LeaderBotManager] ⚠️  Leader bot ${name} exited`);
                
                this.leaderBots.delete(userId);
                this.portToUserId.delete(port);
            });

            // Start the agent (load_memory=true, init_message=null, count_id=userId)
            agentProcess.start(true, null, countId);

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
            console.log(`[LeaderBotManager] Stored port ${port} for user ${userId}`);

            console.log(`[LeaderBotManager] ✓ Leader bot spawned for ${userId} (PID: ${agentProcess.process.pid})`);

            // Wait for bot to be ready
            const ready = await this.isWorkerReady(port, 30000);
            
            if (!ready) {
                console.error(`[LeaderBotManager] ❌ Leader bot ${userId} not ready after 60s`);
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
            agentProcess.running = true;  // ← THIS ONE GOES HERE
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
        let attempts = 0;

        while (Date.now() - startTime < timeout) {
            attempts++;
            try {
                const response = await fetch(`http://localhost:${port}/api/health`, {
                    method: 'GET',
                    timeout: 2000
                });

                if (response.ok) {
                    console.log(`[LeaderBotManager] ✓ Bot on port ${port} is ready (attempt ${attempts})`);
                    return true;
                } else {
                    console.warn(`[LeaderBotManager] Health check returned status ${response.status}`);
                }
            } catch (error) {
                console.warn(`[LeaderBotManager] Health check failed (attempt ${attempts}): ${error.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        console.error(`[LeaderBotManager] ❌ Port ${port} not responding after ${attempts} attempts in ${timeout}ms`);
        return false;
    }

    getLeaderBotForUser(userId) {
        console.log(`[LeaderBotManager] Looking for bot for userId: ${userId}`);
        userId = String(userId);  // ✅ Always convert to string
        const info = this.leaderBots.get(userId);
        
        if (!info) {
            console.warn(`[LeaderBotManager] No info found for userId ${userId}`);
            return null;
        }
        console.log(`[LeaderBotManager] Found bot! Port: ${info.port}, Running: ${info.agentProcess.running}`);
        // Check if bot is actually running
        if (info.agentProcess && !info.agentProcess.running) {
            console.warn(`[LeaderBotManager] Bot for ${userId} is not running`);
            this.leaderBots.delete(userId);
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