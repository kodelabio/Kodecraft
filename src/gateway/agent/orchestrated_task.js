import { Task } from '#mc/agent/tasks/task.js';

export class OrchestratedTask extends Task {
  constructor(agent, task_data, orchestrationAPI, taskStartTime = null) {
    super(agent, task_data, taskStartTime);
    this.orchestration = orchestrationAPI;
    this.sessionId = null;
    this.workerPorts = [];
  }

  async initBotTask() {
    // Spawn workers before parent initialization
    if (this.data.agent_count && this.data.agent_count > 1) {
      await this.spawnWorkers();
    }
    
    // Call parent's initBotTask
    await super.initBotTask();
  }

  async spawnWorkers() {
    const sessionId = `task_${this.data.task_id}_${Date.now()}`;
    const basePort = 4002;
    
    console.log(`Spawning ${this.data.agent_count - 1} workers for task ${this.data.task_id}`);
    
    for (let i = 0; i < this.data.agent_count - 1; i++) {
      const workerName = `Worker_${i + 1}`;
      const workerPort = basePort + i;
      
      const result = await this.orchestration.spawnWorker(
        workerName,
        workerPort,
        sessionId,
        null
      );
      
      if (!result.success) {
        throw new Error(`Failed to spawn ${workerName}: ${result.error}`);
      }
      
      this.workerPorts.push(workerPort);
    }
    
    this.sessionId = sessionId;
    console.log(`Spawned ${this.workerPorts.length} workers for session ${sessionId}`);
  }

  async stopWorkers() {
    if (this.sessionId && this.orchestration) {
      console.log(`Stopping workers for session ${this.sessionId}`);
      await this.orchestration.stopAllWorkers();
    }
  }

  isDone() {
    // Override parent's isDone if needed
    const result = super.isDone();
    
    if (result && result.message === 'Task successful') {
      // Clean up workers on success
      this.stopWorkers();
    }
    
    return result;
  }
}