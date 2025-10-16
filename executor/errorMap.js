class ErrorMapper {
    constructor() {
        this.errorMappings = new Map([
            // Connection/Bot errors
            ['ECONNREFUSED', { code: 503, message: 'Cannot connect to Minecraft server' }],
            ['ENOTFOUND', { code: 503, message: 'Minecraft server not found' }],
            ['ETIMEDOUT', { code: 504, message: 'Connection to Minecraft server timed out' }],
            
            // Action execution errors
            ['TIMEOUT', { code: 408, message: 'Action timed out' }],
            ['BUSY', { code: 409, message: 'Bot is already executing another action' }],
            ['INTERRUPTED', { code: 409, message: 'Action was interrupted' }],
            
            // Game state errors
            ['NoPath', { code: 422, message: 'Cannot find path to destination' }],
            ['UnloadedChunk', { code: 422, message: 'Target location is in an unloaded chunk' }],
            ['InvalidPosition', { code: 422, message: 'Target position is invalid or unreachable' }],
            
            // Inventory/Item errors
            ['NotEnoughItems', { code: 422, message: 'Not enough items in inventory' }],
            ['InventoryFull', { code: 422, message: 'Inventory is full' }],
            ['InvalidItem', { code: 400, message: 'Invalid item or block type' }],
            
            // Permission/Safety errors
            ['NotAllowed', { code: 403, message: 'Action not allowed in current context' }],
            ['OutOfRange', { code: 422, message: 'Target is out of reach' }],
            ['Unsafe', { code: 422, message: 'Action would be unsafe to execute' }],
            
            // Default fallbacks
            ['GENERIC', { code: 500, message: 'Internal server error' }]
        ]);
    }

    mapError(error) {
        if (!error) {
            return { code: 500, message: 'Unknown error occurred' };
        }

        // Handle different error formats
        let errorKey = '';
        let originalMessage = '';

        if (typeof error === 'string') {
            errorKey = error;
            originalMessage = error;
        } else if (error instanceof Error) {
            errorKey = error.code || error.name || error.message;
            originalMessage = error.message;
        } else if (error.message) {
            errorKey = error.code || error.message;
            originalMessage = error.message;
        }

        // Try exact match first
        if (this.errorMappings.has(errorKey)) {
            return this.errorMappings.get(errorKey);
        }

        // Try pattern matching for common error types
        const patterns = [
            { pattern: /no path/i, key: 'NoPath' },
            { pattern: /unloaded chunk/i, key: 'UnloadedChunk' },
            { pattern: /not enough/i, key: 'NotEnoughItems' },
            { pattern: /inventory.*full/i, key: 'InventoryFull' },
            { pattern: /invalid.*item/i, key: 'InvalidItem' },
            { pattern: /invalid.*block/i, key: 'InvalidItem' },
            { pattern: /out of range/i, key: 'OutOfRange' },
            { pattern: /too far/i, key: 'OutOfRange' },
            { pattern: /timeout/i, key: 'TIMEOUT' },
            { pattern: /busy/i, key: 'BUSY' },
            { pattern: /interrupted/i, key: 'INTERRUPTED' },
            { pattern: /connection/i, key: 'ECONNREFUSED' },
        ];

        for (const { pattern, key } of patterns) {
            if (pattern.test(originalMessage)) {
                return this.errorMappings.get(key);
            }
        }

        // Validation errors (usually 4xx)
        if (originalMessage.toLowerCase().includes('invalid')) {
            return { code: 400, message: originalMessage };
        }

        // Return generic error with original message
        return { 
            code: 500, 
            message: originalMessage || 'Internal server error' 
        };
    }

    // Helper method to check if an error should be retried
    isRetryable(error) {
        const retryableCodes = [503, 504, 408];
        const mapped = this.mapError(error);
        return retryableCodes.includes(mapped.code);
    }

    // Helper method to determine if error is client fault
    isClientError(error) {
        const mapped = this.mapError(error);
        return mapped.code >= 400 && mapped.code < 500;
    }
}

export { ErrorMapper };