"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
// api/webhook.ts
const telegraf_1 = require("telegraf");
// Initialize bot
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is required!');
}
const bot = new telegraf_1.Telegraf(BOT_TOKEN);
// Import and register your handlers
// Note: Use dynamic imports for Vercel compatibility
let handlersLoaded = false;
async function loadHandlers() {
    if (handlersLoaded)
        return;
    const { startHandler } = await Promise.resolve().then(() => __importStar(require('../src/presentation/handlers/startHandler')));
    // Register commands
    bot.command('start', startHandler);
    // Register other handlers
    bot.command('help', async (ctx) => {
        await ctx.reply('🆘 *Help Menu*\n\n' +
            '• /start - Main menu\n' +
            '• /help - This help\n' +
            '• Send photos for logo\n' +
            '• Send videos for TikTok audio', { parse_mode: 'Markdown' });
    });
    // Handle text messages
    bot.on('text', async (ctx) => {
        const text = ctx.message.text;
        // Handle menu buttons
        if (text === '🖼️ Add Logo' || text === '🎵 TikTok Sound') {
            await ctx.reply(`✅ *${text} service activated!*\n\nSend your media now.`, {
                parse_mode: 'Markdown'
            });
            return;
        }
        // Default response
        await ctx.reply('Use the menu buttons or commands:\n' +
            '• /start - Main menu\n' +
            '• /help - Help');
    });
    // Handle photos
    bot.on('photo', async (ctx) => {
        await ctx.reply('📸 Photo received! Processing...');
        // Add your photo processing logic here
    });
    // Handle videos
    bot.on('video', async (ctx) => {
        await ctx.reply('🎬 Video received! Send a TikTok link for background sound.');
        // Add your video processing logic here
    });
    handlersLoaded = true;
    console.log('Handlers loaded successfully');
}
// Vercel serverless function handler
async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    try {
        // Load handlers on first request
        await loadHandlers();
        if (req.method === 'POST') {
            // Handle Telegram webhook update
            if (!req.body) {
                return res.status(400).json({ error: 'No update data received' });
            }
            await bot.handleUpdate(req.body);
            return res.status(200).json({ status: 'ok' });
        }
        if (req.method === 'GET') {
            // Health check endpoint
            return res.status(200).json({
                status: 'Bot is running',
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV,
                mode: 'webhook'
            });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    }
    catch (error) {
        console.error('Webhook error:', error.message);
        // Don't expose internal error details in production
        const message = process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : error.message;
        return res.status(500).json({ error: message });
    }
}
//# sourceMappingURL=webhook.js.map