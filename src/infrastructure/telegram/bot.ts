// src/infrastructure/telegram/bot.ts
import { Telegraf, Context } from "telegraf";
import { config } from "../../config/config";
// import { GreetUserUseCase } from "../../application/useCases/GreetUserUseCase";
// import { InMemoryUserRepo } from "../persistence/InMemoryUserRepo";
import { BotResponse } from "../../application/interfaces/BotResponse";
import { helpHandler } from "../../presentation/handlers/helpHandler";
import {
  getServiceState,
  startHandler,
  textMessageHandler,
} from "../../presentation/handlers/startHandler";
import {
  albumHandler,
  setLogoHandler,
} from "../../presentation/handlers/albumHandler";
import {
  mixSettingsHandler,
  videoHandler,
} from "../../presentation/handlers/videoHandler";
import {
  tiktokSettingsHandler,
  tiktokTextHandler,
  tiktokVideoHandler,
} from "../../presentation/handlers/tiktokHandler";

// Instantiate the framework
export const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

// Create instance at module level
// Wire the use‑case
// const userRepo = new InMemoryUserRepo();
// const greetUseCase = new GreetUserUseCase(userRepo);

/**
 * Helper to transform BotResponse into Telegraf replies
 */
export const sendResponse = async (
  ctx: Context,
  response: BotResponse,
): Promise<void> => {
  if (response.options) {
    await ctx.reply(response.text, response.options[0]);
  } else {
    await ctx.reply(response.text);
  }
};

/**
 * Register all handlers here
 */
export const registerHandlers = async () => {
  bot.start(startHandler);

  // Help command
  bot.command("help", async (ctx: any) => {
    const userId = ctx.from?.id;
    if (userId) {
      const { textMessageHandler } =
        await import("../../presentation/handlers/startHandler");
      ctx.message = { text: "❓ Help" } as any;
      ctx.from = { id: userId } as any;
      await textMessageHandler(ctx);
    }
  });

  // Settings command
  bot.command("setlogo", setLogoHandler);
  bot.command("mix", mixSettingsHandler);
  bot.command("tiktok", tiktokSettingsHandler);

  // Menu command (back to main menu)
  bot.command("menu", async (ctx) => {
    const { backToMenu } =
      await import("../../presentation/handlers/startHandler");
    await backToMenu(ctx);
  });

  bot.on("photo", async (ctx) => {
    const userId = ctx.from?.id;
    const service = userId ? getServiceState(userId) : null;

    if (service === "logo" || !service) {
      // Process logo if service is logo or no service selected (default)
      return albumHandler(ctx);
    } else if (service === "tiktok") {
      // If TikTok service is active, tell user to send video instead
      await ctx.reply(
        "🎵 *TikTok Sound Service is Active!*\n\n" +
          "Please send a *video* (not photo) to add TikTok sound.\n\n" +
          "Or switch back to logo service: /start",
        { parse_mode: "Markdown" },
      );
    }
  });

  bot.on("video", (ctx) => {
    const userId = ctx.from?.id;
    const service = userId ? getServiceState(userId) : null;
    const caption = (ctx.message as any)?.caption || "";

    // Check if it has TikTok link
    const tiktokUrlPattern = /tiktok\.com/i;

    if (service === "tiktok" || tiktokUrlPattern.test(caption)) {
      // Process as TikTok video
      return tiktokVideoHandler(ctx);
    } else {
      // Process as regular video
      return videoHandler(ctx);
    }
  });

  bot.on("video_note", videoHandler);

  // Text message handler
  bot.on("text", async (ctx) => {
    const text = (ctx.message as any)?.text || "";

    // Check for TikTok URLs in text
    const tiktokUrlPattern = /tiktok\.com/i;
    if (tiktokUrlPattern.test(text)) {
      return tiktokTextHandler(ctx);
    }

    // Handle menu buttons
    const menuButtons = [
      "🖼️ Add Logo to Photos",
      "🎵 TikTok Sound to Video",
      "⚙️ Settings",
      "❓ Help",
    ];

    if (menuButtons.includes(text)) {
      return textMessageHandler(ctx);
    }

    // // Handle YouTube links for video processing
    // const youtubeUrlPattern = /youtube\.com|youtu\.be/i;
    // if (youtubeUrlPattern.test(text)) {
    //   return videoTextHandler(ctx);
    // }
  });

  // Register TikTok settings command
  bot.command("tiktok", tiktokSettingsHandler);

  bot.help(helpHandler);
  // You can also add a command to echo the chat id (for debugging)
  bot.command("me", (ctx) => ctx.reply(`Your chat id is ${ctx.chat.id}`));
  // Add more handlers here...

  // Error handler
  bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply("An error occurred. Please try again later.").catch(() => {});
  });
};
