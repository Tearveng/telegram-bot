// api/webhook.ts (at root level, NOT inside src/)

import { Telegraf } from 'telegraf';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new Telegraf(BOT_TOKEN);

// Import your handlers
import { startHandler } from '../src/presentation/handlers/startHandler';
import { albumHandler } from '../src/presentation/handlers/albumHandler';
import { videoHandler } from '../src/presentation/handlers/videoHandler';
import { tiktokVideoHandler } from '../src/presentation/handlers/tiktokHandler';

// Register commands
bot.command('start', startHandler);
bot.command('help', async (ctx) => {
  await ctx.reply('Help message here...');
});

// Register handlers
bot.on('photo', albumHandler);
bot.on('video', videoHandler);
// Add all your other handlers...

// Important: Do NOT call bot.launch() here

// Export the serverless function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      return res.status(200).json({ status: 'ok' });
    }
    
    // GET request for health check
    return res.status(200).json({ 
      status: 'Bot is running',
      timestamp: new Date().toISOString(),
      mode: 'webhook'
    });
  } catch (error: any) {
    console.error('Webhook error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}