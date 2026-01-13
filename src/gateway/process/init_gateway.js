import { telegramRouter } from '../api/telegram_router.js';
import { leaderBotManager } from '../agent/leader_bot_manager.js';

const API_GATEWAY_PORT = process.env.API_GATEWAY_PORT || 4001;

console.log('🚀 Starting Telegram Router Gateway...');

// Start the main API gateway
await telegramRouter.start(API_GATEWAY_PORT);

console.log(`✓ Gateway running on port ${API_GATEWAY_PORT}`);
console.log(`✓ Leader bot manager ready (base port: 5000)`);
console.log(`✓ Ready to route Telegram user requests`);

// Handle shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await leaderBotManager.stopAllLeaderBots();
    process.exit(0);
});