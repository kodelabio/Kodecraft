#!/usr/bin/env node

/**
 * Test script for N8N Integration Server
 * 
 * This script demonstrates the integration server functionality by:
 * 1. Starting the integration server
 * 2. Sending test commands
 * 3. Polling for updates
 * 4. Displaying filtered responses
 */

import fetch from 'node-fetch';
import { setTimeout } from 'timers/promises';

const BASE_URL = 'http://localhost:8080';

class N8NIntegrationTester {
    constructor() {
        this.lastTimestamp = 0;
    }

    async waitForServer(maxAttempts = 30) {
        console.log('🔍 Waiting for server to be ready...');
        
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await fetch(`${BASE_URL}/health`);
                if (response.ok) {
                    console.log('✅ Server is ready!');
                    return true;
                }
            } catch (error) {
                // Server not ready yet
            }
            
            await setTimeout(1000);
            process.stdout.write('.');
        }
        
        throw new Error('Server failed to start within timeout period');
    }

    async sendCommand(user, command, bot = 'Kid') {
        console.log(`\n📤 Sending command to ${bot}: "${command}"`);
        
        try {
            const response = await fetch(`${BASE_URL}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user, command, bot })
            });

            const result = await response.json();
            
            if (response.ok) {
                console.log(`✅ Command sent successfully!`);
                console.log(`   Command ID: ${result.commandId}`);
                console.log(`   Bot: ${result.bot}`);
                return result;
            } else {
                console.log(`❌ Command failed: ${result.message}`);
                return null;
            }
        } catch (error) {
            console.log(`❌ Network error: ${error.message}`);
            return null;
        }
    }

    async getUpdates(bot = null) {
        try {
            let url = `${BASE_URL}/updates?since=${this.lastTimestamp}`;
            if (bot) {
                url += `&bot=${bot}`;
            }

            const response = await fetch(url);
            const result = await response.json();

            if (response.ok) {
                this.lastTimestamp = result.latestTimestamp || this.lastTimestamp;
                return result.updates || [];
            } else {
                console.log(`❌ Failed to get updates: ${response.statusText}`);
                return [];
            }
        } catch (error) {
            console.log(`❌ Network error getting updates: ${error.message}`);
            return [];
        }
    }

    async getBotStatus() {
        try {
            const response = await fetch(`${BASE_URL}/bots/status`);
            const result = await response.json();
            
            if (response.ok) {
                return result.bots || [];
            } else {
                console.log(`❌ Failed to get bot status: ${response.statusText}`);
                return [];
            }
        } catch (error) {
            console.log(`❌ Network error getting bot status: ${error.message}`);
            return [];
        }
    }

    displayUpdate(update) {
        const timestamp = new Date(update.ts).toLocaleTimeString();
        const typeEmoji = {
            'command_received': '📝',
            'worker_assignment': '👥',
            'milestone': '🏗️',
            'progress': '⏳',
            'response': '💬',
            'error': '❌',
            'info': 'ℹ️'
        };

        const emoji = typeEmoji[update.type] || '📡';
        console.log(`   ${emoji} [${timestamp}] ${update.from}: ${update.message}`);
        
        // Display additional data if available
        if (update.workerCount) {
            console.log(`      Workers: ${update.workerCount}`);
        }
        if (update.phase) {
            console.log(`      Phase: ${update.phase}`);
        }
        if (update.commandId) {
            console.log(`      Command ID: ${update.commandId}`);
        }
    }

    async pollUpdates(duration = 30000, interval = 2000) {
        console.log(`\n👁️  Polling for updates (${duration/1000}s, every ${interval/1000}s)...`);
        
        const endTime = Date.now() + duration;
        
        while (Date.now() < endTime) {
            const updates = await this.getUpdates();
            
            if (updates.length > 0) {
                console.log(`\n📨 Received ${updates.length} update(s):`);
                updates.forEach(update => this.displayUpdate(update));
            }
            
            await setTimeout(interval);
        }
        
        console.log('\n⏹️  Polling completed');
    }

    async runDemo() {
        console.log('🚀 Starting N8N Integration Server Test Demo');
        console.log('============================================');

        try {
            // Wait for server to be ready
            await this.waitForServer();
            
            // Check bot status
            console.log('\n📊 Checking bot status...');
            const bots = await this.getBotStatus();
            if (bots.length === 0) {
                console.log('⚠️  No bots connected. Make sure Kodecraft system is running.');
                console.log('   Start the bots first, then run this test.');
                return;
            }
            
            console.log(`✅ Found ${bots.length} bot(s):`);
            bots.forEach(bot => {
                const status = bot.connected ? '🟢 Online' : '🔴 Offline';
                console.log(`   - ${bot.name}: ${status} (${bot.updateCount} updates)`);
            });

            // Test various commands
            const testCommands = [
                { user: 'admin', command: '/kid build house with 3 workers', bot: 'Kid' },
                { user: 'admin', command: '/kid start foundation', bot: 'Kid' },
                { user: 'admin', command: '/boss assign 2 workers to mining', bot: 'Boss' }
            ];

            // Send test commands
            for (const cmd of testCommands) {
                if (bots.some(bot => bot.name === cmd.bot && bot.connected)) {
                    await this.sendCommand(cmd.user, cmd.command, cmd.bot);
                    await setTimeout(1000); // Brief delay between commands
                } else {
                    console.log(`⚠️  Skipping command for ${cmd.bot} (not connected)`);
                }
            }

            // Poll for responses
            await this.pollUpdates(30000, 2000);

            // Final status check
            console.log('\n📊 Final update counts:');
            const finalBots = await this.getBotStatus();
            finalBots.forEach(bot => {
                console.log(`   - ${bot.name}: ${bot.updateCount} updates`);
            });

            console.log('\n✅ Demo completed successfully!');
            console.log('\n🔗 Integration endpoints:');
            console.log(`   Commands: POST ${BASE_URL}/command`);
            console.log(`   Updates:  GET ${BASE_URL}/updates`);
            console.log(`   Status:   GET ${BASE_URL}/bots/status`);
            console.log(`   Health:   GET ${BASE_URL}/health`);

        } catch (error) {
            console.error('\n❌ Demo failed:', error.message);
            console.log('\n💡 Make sure to:');
            console.log('   1. Start the N8N integration server first');
            console.log('   2. Ensure Kodecraft bots are connected');
            console.log('   3. Check that port 8080 is available');
        }
    }
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new N8NIntegrationTester();
    tester.runDemo().then(() => process.exit(0));
}

export { N8NIntegrationTester };