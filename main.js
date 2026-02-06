import { loadConfig } from './config/loader.js';
import { APIServer } from './src/agent/api_server.js';
import { setSettings } from './src/agent/settings.js';
import { leaderBotManager } from './src/agent/leader_bot_manager.js';

console.log('🚀 Starting Minecraft Multi-User Bot System');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

setSettings(await loadConfig());
const apiServer = new APIServer();

try {

    // Start API Gateway
    console.log('\n🌐 Starting API Gateway...');
    await apiServer.start();  // Reads API_GATEWAY_PORT from settings

    console.log('\n✅ System Started Successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Ready for Telegram user connections! 🎮\n');

} catch (error) {
    console.error('\n❌ Startup Failed:', error.message);
    console.error(error.stack);
    process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    try {
        await leaderBotManager.stopAllLeaderBots();
        //await userManager.close();
        apiServer.stop();
        console.log('✓ Shutdown complete\n');
    } catch (error) {
        console.error('Error during shutdown:', error.message);
    }
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled rejection:', reason);
    process.exit(1);
});