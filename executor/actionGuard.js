class ActionGuard {
    constructor() {
        this.currentAction = null;
        this.actionStartTime = null;
        this.actionTimeout = null;
    }

    isBusy() {
        return this.currentAction !== null;
    }

    startAction(actionName) {
        if (this.isBusy()) {
            throw new Error(`Cannot start ${actionName}: already executing ${this.currentAction}`);
        }

        this.currentAction = actionName;
        this.actionStartTime = Date.now();
        
        // Set a reasonable timeout (30 seconds for most actions)
        const timeoutMs = this.getTimeoutForAction(actionName);
        this.actionTimeout = setTimeout(() => {
            console.warn(`Action ${actionName} timed out after ${timeoutMs}ms`);
            this.endAction();
        }, timeoutMs);
    }

    endAction() {
        if (this.actionTimeout) {
            clearTimeout(this.actionTimeout);
            this.actionTimeout = null;
        }

        this.currentAction = null;
        this.actionStartTime = null;
    }

    getTimeoutForAction(actionName) {
        const timeouts = {
            'move': 30000,      // 30 seconds for movement
            'collect': 60000,   // 60 seconds for collection
            'place': 15000,     // 15 seconds for placement
            'break': 15000,     // 15 seconds for breaking
            'craft': 30000,     // 30 seconds for crafting
            'default': 30000    // Default timeout
        };

        return timeouts[actionName] || timeouts['default'];
    }

    getExecutionTime() {
        if (!this.actionStartTime) return 0;
        return Date.now() - this.actionStartTime;
    }
}

export { ActionGuard };