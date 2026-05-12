// src/main.ts
import { bot, registerHandlers } from './infrastructure/telegram/bot';

async function main() {
  try {
    console.log('📡 Starting bot application...');
    console.log('🔧 Registering handlers...');
    
    // Register all handlers before launching
    await registerHandlers();
    
    console.log('✅ Handlers registered successfully');
    console.log('🚀 Launching bot...');
    
    // Launch the bot
    await bot.launch();
    
    console.log(`✨ Bot is running! Bot username: @${bot.botInfo?.username}`);
    console.log(`💬 Chat ID: Use /me command to get your chat ID`);
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Run the main function
main();


// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Received SIGINT, stopping bot...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, stopping bot...');
  bot.stop('SIGTERM');
  process.exit(0);
});