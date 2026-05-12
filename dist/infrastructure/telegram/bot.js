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
exports.registerHandlers = exports.sendResponse = exports.bot = void 0;
// src/infrastructure/telegram/bot.ts
const telegraf_1 = require("telegraf");
const config_1 = require("../../config/config");
const helpHandler_1 = require("../../presentation/handlers/helpHandler");
const startHandler_1 = require("../../presentation/handlers/startHandler");
const albumHandler_1 = require("../../presentation/handlers/albumHandler");
const videoHandler_1 = require("../../presentation/handlers/videoHandler");
const tiktokHandler_1 = require("../../presentation/handlers/tiktokHandler");
// Instantiate the framework
exports.bot = new telegraf_1.Telegraf(config_1.config.TELEGRAM_BOT_TOKEN);
// Create instance at module level
// Wire the use‑case
// const userRepo = new InMemoryUserRepo();
// const greetUseCase = new GreetUserUseCase(userRepo);
/**
 * Helper to transform BotResponse into Telegraf replies
 */
const sendResponse = async (ctx, response) => {
    if (response.options) {
        await ctx.reply(response.text, response.options[0]);
    }
    else {
        await ctx.reply(response.text);
    }
};
exports.sendResponse = sendResponse;
/**
 * Register all handlers here
 */
const registerHandlers = async () => {
    exports.bot.start(startHandler_1.startHandler);
    // Help command
    exports.bot.command("help", async (ctx) => {
        const userId = ctx.from?.id;
        if (userId) {
            const { textMessageHandler } = await Promise.resolve().then(() => __importStar(require("../../presentation/handlers/startHandler")));
            ctx.message = { text: "❓ Help" };
            ctx.from = { id: userId };
            await textMessageHandler(ctx);
        }
    });
    // Settings command
    exports.bot.command("setlogo", albumHandler_1.setLogoHandler);
    exports.bot.command("mix", videoHandler_1.mixSettingsHandler);
    exports.bot.command("tiktok", tiktokHandler_1.tiktokSettingsHandler);
    // Menu command (back to main menu)
    exports.bot.command("menu", async (ctx) => {
        const { backToMenu } = await Promise.resolve().then(() => __importStar(require("../../presentation/handlers/startHandler")));
        await backToMenu(ctx);
    });
    exports.bot.on("photo", async (ctx) => {
        const userId = ctx.from?.id;
        const service = userId ? (0, startHandler_1.getServiceState)(userId) : null;
        if (service === "logo" || !service) {
            // Process logo if service is logo or no service selected (default)
            return (0, albumHandler_1.albumHandler)(ctx);
        }
        else if (service === "tiktok") {
            // If TikTok service is active, tell user to send video instead
            await ctx.reply("🎵 *TikTok Sound Service is Active!*\n\n" +
                "Please send a *video* (not photo) to add TikTok sound.\n\n" +
                "Or switch back to logo service: /start", { parse_mode: "Markdown" });
        }
    });
    exports.bot.on("video", (ctx) => {
        const userId = ctx.from?.id;
        const service = userId ? (0, startHandler_1.getServiceState)(userId) : null;
        const caption = ctx.message?.caption || "";
        // Check if it has TikTok link
        const tiktokUrlPattern = /tiktok\.com/i;
        if (service === "tiktok" || tiktokUrlPattern.test(caption)) {
            // Process as TikTok video
            return (0, tiktokHandler_1.tiktokVideoHandler)(ctx);
        }
        else {
            // Process as regular video
            return (0, videoHandler_1.videoHandler)(ctx);
        }
    });
    exports.bot.on("video_note", videoHandler_1.videoHandler);
    // Text message handler
    exports.bot.on("text", async (ctx) => {
        const text = ctx.message?.text || "";
        // Check for TikTok URLs in text
        const tiktokUrlPattern = /tiktok\.com/i;
        if (tiktokUrlPattern.test(text)) {
            return (0, tiktokHandler_1.tiktokTextHandler)(ctx);
        }
        // Handle menu buttons
        const menuButtons = [
            "🖼️ Add Logo to Photos",
            "🎵 TikTok Sound to Video",
            "⚙️ Settings",
            "❓ Help",
        ];
        if (menuButtons.includes(text)) {
            return (0, startHandler_1.textMessageHandler)(ctx);
        }
        // // Handle YouTube links for video processing
        // const youtubeUrlPattern = /youtube\.com|youtu\.be/i;
        // if (youtubeUrlPattern.test(text)) {
        //   return videoTextHandler(ctx);
        // }
    });
    // Register TikTok settings command
    exports.bot.command("tiktok", tiktokHandler_1.tiktokSettingsHandler);
    exports.bot.help(helpHandler_1.helpHandler);
    // You can also add a command to echo the chat id (for debugging)
    exports.bot.command("me", (ctx) => ctx.reply(`Your chat id is ${ctx.chat.id}`));
    // Add more handlers here...
    // Error handler
    exports.bot.catch((err, ctx) => {
        console.error(`Error for ${ctx.updateType}:`, err);
        ctx.reply("An error occurred. Please try again later.").catch(() => { });
    });
};
exports.registerHandlers = registerHandlers;
//# sourceMappingURL=bot.js.map