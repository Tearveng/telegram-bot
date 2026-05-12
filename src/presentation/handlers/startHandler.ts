// src/presentation/handlers/startHandler.ts

import { Context, Markup } from 'telegraf';

// Store user's selected service state
const userServiceState = new Map<number, 'logo' | 'tiktok' | null>();

export const getServiceState = (userId: number): 'logo' | 'tiktok' | null => {
  return userServiceState.get(userId) || null;
};

export const setServiceState = (userId: number, service: 'logo' | 'tiktok' | null): void => {
  userServiceState.set(userId, service);
};

export const startHandler = async (ctx: Context): Promise<void> => {
  console.log("User started bot:", ctx.from);
  
  const userId = ctx.from?.id;
  const firstName = ctx.from?.first_name || 'User';
  
  if (!userId) {
    await ctx.reply('Unable to retrieve your Telegram ID.');
    return;
  }

  // Reset service state on /start
  userServiceState.set(userId, null);

  const welcomeMessage = `
🎉 *Welcome to VAAM Bot, ${firstName}!* 🎉

I can help you enhance your media content with these services:

*Available Services:*
• 🖼️ *Add Logo* — Add VAAM logo to your photos & albums
• 🎵 *TikTok Sound* — Add TikTok audio to your videos

👇 *Choose a service below to get started!*
  `;

  // Main menu with two services
  const keyboard = Markup.keyboard([
    ['🖼️ Add Logo to Photos', '🎵 TikTok Sound to Video'],
    ['⚙️ Settings', '❓ Help']
  ]).resize();
  
  await ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    ...keyboard
  });
};

/**
 * Handler for text messages from persistent keyboard
 */
export const textMessageHandler = async (ctx: any) => {
  const text = ctx.message?.text;
  const userId = ctx.from?.id;
  
  if (!text || !userId) return;
  
  switch (text) {
    case '🖼️ Add Logo to Photos':
      // Set service state
      userServiceState.set(userId, 'logo');
      
      await ctx.reply(
        '🖼️ *Add Logo Service Activated!*\n\n' +
        'Send me any photo or album, and I\'ll add the VAAM logo.\n\n' +
        '📸 *How to use:*\n' +
        '• Send a single photo or multiple photos (album)\n' +
        '• Logo will be added automatically\n' +
        '• I\'ll return your branded images\n\n' +
        '🎨 *Logo Color Options:*\n' +
        '• Use /setlogo white or /setlogo black\n' +
        '• Or add "white" or "black" in your photo caption\n\n' +
        '_Send your photos now!_ 📤',
        { parse_mode: 'Markdown' }
      );
      break;
      
    case '🎵 TikTok Sound to Video':
      // Set service state
      userServiceState.set(userId, 'tiktok');
      
      await ctx.reply(
        '🎵 *TikTok Sound Service Activated!*\n\n' +
        'Add trending TikTok sounds as background music to your videos.\n\n' +
        '📹 *How to use:*\n' +
        '1️⃣ Send me your video\n' +
        '2️⃣ Then send a TikTok link with the sound you want\n' +
        '3️⃣ I\'ll mix them and return your video\n\n' +
        '📋 *Supported TikTok Links:*\n' +
        '• Video links: tiktok.com/@user/video/123\n' +
        '• Short links: vm.tiktok.com/xxxxx\n' +
        '• Music links: tiktok.com/music/song-name-123\n\n' +
        '⚙️ *Customize:*\n' +
        '• /tiktok mode mix — Mix with original audio\n' +
        '• /tiktok mode replace — Replace original audio\n' +
        '• /tiktok status — View current settings\n\n' +
        '_Send your video now!_ 🎬',
        { parse_mode: 'Markdown' }
      );
      break;
      
    case '⚙️ Settings':
      const currentService = userServiceState.get(userId);
      const serviceName = currentService === 'logo' ? 'Add Logo' : 
                          currentService === 'tiktok' ? 'TikTok Sound' : 
                          'None selected';
      
      await ctx.reply(
        '⚙️ *Settings*\n\n' +
        `*Active Service:* ${serviceName}\n\n` +
        '*Logo Service:*\n' +
        '• /setlogo white — White logo\n' +
        '• /setlogo black — Black logo\n\n' +
        '*TikTok Service:*\n' +
        '• /tiktok mode mix — Mix audio\n' +
        '• /tiktok mode replace — Replace audio\n' +
        '• /tiktok volume tiktok 0.8 — Set TikTok volume\n\n' +
        '*General:*\n' +
        '• /start — Main menu\n' +
        '• /help — Help guide',
        { parse_mode: 'Markdown' }
      );
      break;
      
    case '❓ Help':
      await showHelp(ctx, userId);
      break;
      
    default:
      // Don't respond to random text messages
      break;
  }
};

/**
 * Back to main menu handler
 */
export const backToMenu = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (userId) {
    userServiceState.set(userId, null);
  }
  
  await ctx.reply(
    '🔙 *Returned to Main Menu*\n\n👇 Choose a service to get started:',
    {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        ['🖼️ Add Logo to Photos', '🎵 TikTok Sound to Video'],
        ['⚙️ Settings', '❓ Help']
      ]).resize()
    }
  );
};

/**
 * Help handler
 */
async function showHelp(ctx: Context, _: number) {
  const helpMessage = `
 *VAAM Bot Help Guide*

*Available Services:*

🖼️ *Add Logo Service*
• Click "Add Logo to Photos"
• Send single photos or albums
• Logo added automatically
• Use /setlogo to choose color

🎵 *TikTok Sound Service*
• Click "TikTok Sound to Video"
• Send your video first
• Then send a TikTok link
• Audio mixed automatically

*Commands:*
• /start — Main menu
• /setlogo [white/black] — Logo color
• /tiktok mode [mix/replace] — Audio mode
• /tiktok volume tiktok [0-1] — Audio volume
• /help — This guide

*Tips:*
• You can switch services anytime
• Send /start to reset
• Logo position is automatic
• TikTok audio loops if too short

*Need support?* Contact @vaam_support
  `;
  
  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
}

/**
 * Handler for inline button callbacks
 */
export const callbackHandler = async (ctx: any) => {
  const callbackData = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;
  
  if (!callbackData || !userId) return;
  
  switch (callbackData) {
    case 'choose_logo':
      userServiceState.set(userId, 'logo');
      await ctx.answerCbQuery('🖼️ Add Logo service activated!');
      await ctx.reply(
        '🖼️ *Add Logo Service*\n\nSend me your photos now!',
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'choose_tiktok':
      userServiceState.set(userId, 'tiktok');
      await ctx.answerCbQuery('🎵 TikTok Sound service activated!');
      await ctx.reply(
        '🎵 *TikTok Sound Service*\n\nSend me a video to get started!',
        { parse_mode: 'Markdown' }
      );
      break;
      
    case 'back_to_menu':
      await ctx.answerCbQuery('Returning to main menu');
      await backToMenu(ctx);
      break;
      
    default:
      await ctx.answerCbQuery();
  }
};

// Export for use in other handlers
export { userServiceState };