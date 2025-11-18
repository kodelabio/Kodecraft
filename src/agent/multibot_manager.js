// Multi-bot manager for spawning and coordinating worker bots

import { spawn } from 'child_process';
import { join } from 'path';
import axios from 'axios';
import settings from '../../settings.js';

export class MultiBotManager {
    constructor(leaderAgent) {
        this.leaderAgent = leaderAgent;
        this.workers = new Map(); // workerName -> {process, port, status}
        this.basePort = settings.multibot_base_port || 4000;
        this.nextPort = this.basePort + 2; // Leader uses basePort+1
        this.sessionId = null;
    }

    
    // Spawn multiple worker bots for collaborative tasks

    async spawnWorkers(workerCount = 3, sessionId = null) {
        this.sessionId = sessionId || `session_${Date.now()}`;
        console.log(`[MultiBotManager] Spawning ${workerCount} workers for session ${this.sessionId}`);

        const spawnPromises = [];
        const spawnedWorkers = [];

        const results = [];
        
        // Spawn workers sequentially to avoid resource conflicts
        for (let i = 1; i <= workerCount; i++) {
            const workerName = `${this.leaderAgent.name}Worker${i}`;
            const workerPort = this.nextPort++;
            
            try {
                console.log(`[MultiBotManager] Spawning worker ${i}/${workerCount}: ${workerName}`);
                const result = await this.spawnSingleWorker(workerName, workerPort);
                results.push(result);
                spawnedWorkers.push({ name: workerName, port: workerPort });
                
                // Small delay between worker spawns to avoid conflicts
                if (i < workerCount) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            } catch (error) {
                console.error(`[MultiBotManager] Failed to spawn ${workerName}:`, error);
                results.push({ success: false, error: error.message });
            }
        }

        try {
            const successfulWorkers = results.filter(r => r.success);
            
            console.log(`[MultiBotManager] Successfully spawned ${successfulWorkers.length}/${workerCount} workers`);
            
            // Wait a bit for workers to fully initialize (bot spawning, etc.)
            if (successfulWorkers.length > 0) {
                console.log(`[MultiBotManager] Waiting 20 seconds for workers to fully initialize...`);
                await new Promise(resolve => setTimeout(resolve, 20000));
            }
            
            return {
                success: successfulWorkers.length > 0,
                workers: successfulWorkers.map(w => w.worker),
                sessionId: this.sessionId,
                spawnedCount: successfulWorkers.length,
                requestedCount: workerCount
            };
        } catch (error) {
            console.error(`[MultiBotManager] Error spawning workers:`, error);
            return {
                success: false,
                error: error.message,
                sessionId: this.sessionId,
                workers: [],
                spawnedCount: 0,
                requestedCount: workerCount
            };
        }
    }

    
    // Spawn a single worker process

    async spawnSingleWorker(workerName, port) {
        return new Promise((resolve) => {
            console.log(`[MultiBotManager] Spawning worker ${workerName} on port ${port}`);

            // Spawn worker process using init_worker.js
            const workerProcess = spawn('node', [
                join(process.cwd(), 'src/process/init_worker.js'),
                '--name', workerName,
                '--port', port.toString(),
                '--load_memory', 'false',
                '--init_message', `Hello, I am ${workerName}. Ready to work!`
            ], {
                stdio: ['pipe', 'pipe', 'pipe'], 
                detached: false
            });

            const worker = {
                name: workerName,
                port: port,
                process: workerProcess,
                status: 'starting',
                pid: workerProcess.pid
            };

            // Track worker
            this.workers.set(workerName, worker);

            // Handle worker process output
            workerProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                console.log(`[Worker ${workerName}] ${output}`);
                
                // Check if worker is ready - multiple possible indicators
                if (output.includes(`ready on port`) || 
                    output.includes(`Worker ${workerName} ready`) ||
                    output.includes(`API server running on port ${port}`) ||
                    (output.includes('logged into') && worker.status === 'starting')) {
                    worker.status = 'ready';
                    console.log(`[MultiBotManager] Worker ${workerName} is READY on port ${port}`);
                    resolve({ success: true, worker });
                }
            });

            workerProcess.stderr.on('data', (data) => {
                const error = data.toString().trim();
                console.error(`[Worker ${workerName} ERROR] ${error}`);
            });

            workerProcess.on('error', (error) => {
                console.error(`[MultiBotManager] Failed to spawn worker ${workerName}:`, error);
                worker.status = 'failed';
                this.workers.delete(workerName);
                resolve({ success: false, error: error.message });
            });

            workerProcess.on('exit', (code) => {
                console.log(`[MultiBotManager] Worker ${workerName} exited with code ${code}`);
                worker.status = code === 0 ? 'stopped' : 'crashed';
                if (worker.status === 'crashed') {
                    this.workers.delete(workerName);
                }
            });

            // Timeout for worker startup with fallback
            setTimeout(() => {
                if (worker.status === 'starting') {
                    // Check if process is still alive - might be ready but detection failed
                    if (workerProcess && !workerProcess.killed && workerProcess.exitCode === null) {
                        console.warn(`[MultiBotManager] Worker ${workerName} timeout, but process alive. Marking as ready anyway.`);
                        worker.status = 'ready';
                        resolve({ success: true, worker });
                    } else {
                        console.error(`[MultiBotManager] Worker ${workerName} startup timeout - process not responding`);
                        try {
                            workerProcess.kill('SIGKILL');
                        } catch (e) {}
                        worker.status = 'timeout';
                        this.workers.delete(workerName);
                        resolve({ success: false, error: 'Worker startup timeout' });
                    }
                }
            }, 60000); // 60 second timeout
        });
    }

    
    // Stop all worker processes (simplified - just kills processes)

    async stopWorkers() {
        console.log(`[MultiBotManager] Stopping ${this.workers.size} workers`);
        
        const stopped = [];
        const errors = [];

        for (const [workerName, worker] of this.workers.entries()) {
            try {
                console.log(`[MultiBotManager] Stopping worker ${workerName}`);
                
                // Kill the process
                if (worker.process && !worker.process.killed) {
                    worker.process.kill('SIGTERM');
                    
                    // Wait a bit then force kill if needed
                    setTimeout(() => {
                        if (!worker.process.killed) {
                            worker.process.kill('SIGKILL');
                        }
                    }, 3000);
                }

                worker.status = 'stopped';
                stopped.push(workerName);
            } catch (error) {
                console.error(`[MultiBotManager] Failed to stop worker ${workerName}:`, error);
                errors.push(`Failed to stop ${workerName}: ${error.message}`);
            }
        }

        // Clear workers map
        this.workers.clear();
        this.sessionId = null;

        return {
            success: stopped.length > 0,
            stopped,
            errors
        };
    }
}