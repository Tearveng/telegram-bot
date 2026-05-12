"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/main.ts
const bot_1 = require("./infrastructure/telegram/bot");
async function main() {
    try {
        console.log('📡 Starting bot application...');
        console.log('🔧 Registering handlers...');
        // Register all handlers before launching
        await (0, bot_1.registerHandlers)();
        console.log('✅ Handlers registered successfully');
        console.log('🚀 Launching bot...');
        // Launch the bot
        await bot_1.bot.launch();
        console.log(`✨ Bot is running! Bot username: @${bot_1.bot.botInfo?.username}`);
        console.log(`💬 Chat ID: Use /me command to get your chat ID`);
    }
    catch (error) {
        console.error('❌ Failed to start bot:', error);
        process.exit(1);
    }
}
// Run the main function
main();
// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 Received SIGINT, stopping bot...');
    bot_1.bot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, stopping bot...');
    bot_1.bot.stop('SIGTERM');
    process.exit(0);
});
//# sourceMappingURL=main.js.map