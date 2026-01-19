import { loadConfig } from '#src/config/loader.js';
import { apiServer } from '#src/gateway/agent/api_server.js';
import { leaderBotManager } from '#src/gateway/agent/leader_bot_manager.js';
//import { userManager } from './src/api/user_manager.js';

console.log('🚀 Starting Minecraft Multi-User Bot System');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const config = await loadConfig();

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