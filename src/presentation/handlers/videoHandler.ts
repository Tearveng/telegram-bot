// src/presentation/handlers/videoHandler.ts

import { Context } from "telegraf";
import { join } from "path";
import * as fs from "fs";
import { config } from "../../config/config";
import { VideoDownloadService } from "../../infrastructure/persistence/VideoDownloadService";
import { VideoProcessingService } from "../../infrastructure/persistence/VideoProcessingService";
import { QueueManager } from "../../infrastructure/persistence/QueueManager";

const TMP_DIR = join(process.cwd(), "tmp");

// Initialize services
const videoDownloadService = new VideoDownloadService(config, TMP_DIR);
const videoProcessingService = new VideoProcessingService(TMP_DIR);
const queueManager = new QueueManager(config.MAX_CONCURRENT_PROCESSING);

// User settings storage (in-memory - use DB in production)
const userSettings = new Map<number, {
  mixMode: 'mix' | 'replace' | 'music_only';
  originalVolume: number;
  musicVolume: number;
  fadeIn: boolean;
  fadeOut: boolean;
  addLogo: boolean;
}>();

// Pending video storage
interface PendingVideo {
  videoPath: string;
  fileId: string;
  messageId: number;
  timeout: NodeJS.Timeout;
  statusMessageId?: number;
}

const pendingVideos = new Map<number, PendingVideo>();

// Ensure temp directory
(async () => {
  await fs.promises.mkdir(TMP_DIR, { recursive: true });
})();

// Start periodic cleanup
setInterval(() => {
  videoProcessingService.periodicCleanup(config.TEMP_FILE_MAX_AGE_MS);
}, config.TEMP_FILE_MAX_AGE_MS);

/**
 * Get or create user settings
 */
function getUserSettings(chatId: number) {
  if (!userSettings.has(chatId)) {
    userSettings.set(chatId, {
      mixMode: 'mix',
      originalVolume: config.DEFAULT_ORIGINAL_VOLUME,
      musicVolume: config.DEFAULT_MUSIC_VOLUME,
      fadeIn: true,
      fadeOut: true,
      addLogo: false,
    });
  }
  return userSettings.get(chatId)!;
}

/**
 * Validate YouTube URL
 */
function extractYoutubeUrl(text: string): string | null {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([\w-]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([\w-]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([\w-]+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

/**
 * Update status message
 */
async function updateStatus(ctx: Context, chatId: number, messageId: number | undefined, text: string) {
  try {
    if (messageId) {
      await ctx.telegram.editMessageText(chatId, messageId, undefined, text);
    }
  } catch (error) {
    // If edit fails, send new message
    const sent = await ctx.telegram.sendMessage(chatId, text);
    return sent.message_id;
  }
  return messageId;
}

/**
 * Main video handler
 */
export const videoHandler = async (ctx: Context) => {
  if (!ctx.message || !('video' in ctx.message || 'video_note' in ctx.message)) {
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const msg = ctx.message as any;
  const video = msg.video || msg.video_note;
  
  if (!video) {
    await ctx.reply("❌ No video found in message.");
    return;
  }

  const caption = msg.caption || '';
  const youtubeUrl = extractYoutubeUrl(caption);

  try {
    if (youtubeUrl) {
      // Video with YouTube link - process immediately
      await ctx.reply("🎬 Starting video processing...");
      await processAndSendVideo(ctx, chatId, video.file_id, youtubeUrl);
    } else {
      // Video without YouTube link - wait for link
      await ctx.reply("📹 Video received! Now send me a YouTube link for background music.");
      await savePendingVideo(ctx, chatId, msg, video.file_id);
    }
  } catch (error: any) {
    console.error('Video handler error:', error);
    await ctx.reply(`❌ Error: ${error.message || 'Failed to process video'}`);
  }
};

/**
 * Text message handler (for YouTube links)
 */
export const textHandler = async (ctx: Context) => {
  if (!ctx.message || !('text' in ctx.message)) return;

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const text = ctx.message.text;
  const youtubeUrl = extractYoutubeUrl(text);

  if (youtubeUrl && pendingVideos.has(chatId)) {
    const pending = pendingVideos.get(chatId)!;
    clearTimeout(pending.timeout);
    pendingVideos.delete(chatId);

    await ctx.reply("🎬 Processing your video with the provided YouTube link...");
    await processAndSendVideo(ctx, chatId, pending.fileId, youtubeUrl);
  }
};

/**
 * Save pending video for later processing
 */
async function savePendingVideo(ctx: Context, chatId: number, msg: any, fileId: string) {
  const videoPath = await videoDownloadService.downloadFromTelegram(ctx, fileId);

  const timeout = setTimeout(async () => {
    if (pendingVideos.has(chatId)) {
      pendingVideos.delete(chatId);
      await videoProcessingService.cleanupFiles([videoPath]);
      await ctx.telegram.sendMessage(
        chatId,
        "⏰ Timeout: No YouTube link received. Video deleted. Please try again."
      );
    }
  }, config.VIDEO_PROCESSING_TIMEOUT_MS);

  pendingVideos.set(chatId, {
    videoPath,
    fileId,
    messageId: msg.message_id,
    timeout,
  });
}

/**
 * Settings commands
 */
export const mixSettingsHandler = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const args = (ctx.message as any)?.text?.split(' ') || [];
  const command = args[1]?.toLowerCase();

  switch (command) {
    case 'mode':
      const mode = args[2]?.toLowerCase();
      if (['mix', 'replace', 'music_only'].includes(mode)) {
        getUserSettings(chatId).mixMode = mode as any;
        await ctx.reply(`✅ Audio mode set to: ${mode}`);
      } else {
        await ctx.reply("❌ Invalid mode. Use: /mix mode [mix|replace|music_only]");
      }
      break;

    case 'volume':
      const type = args[2]?.toLowerCase();
      const value = parseFloat(args[3]);
      
      if (isNaN(value) || value < 0 || value > 1) {
        await ctx.reply("❌ Volume must be between 0 and 1. Example: /mix volume original 0.5");
        return;
      }
      
      if (type === 'original') {
        getUserSettings(chatId).originalVolume = value;
        await ctx.reply(`✅ Original audio volume set to: ${value * 100}%`);
      } else if (type === 'music') {
        getUserSettings(chatId).musicVolume = value;
        await ctx.reply(`✅ Music volume set to: ${value * 100}%`);
      } else {
        await ctx.reply("❌ Use: /mix volume [original|music] [0-1]");
      }
      break;

    case 'fade':
      const fadeType = args[2]?.toLowerCase();
      const enable = args[3]?.toLowerCase() === 'on';
      
      if (fadeType === 'in') {
        getUserSettings(chatId).fadeIn = enable;
        await ctx.reply(`✅ Fade in ${enable ? 'enabled' : 'disabled'}`);
      } else if (fadeType === 'out') {
        getUserSettings(chatId).fadeOut = enable;
        await ctx.reply(`✅ Fade out ${enable ? 'enabled' : 'disabled'}`);
      } else {
        await ctx.reply("❌ Use: /mix fade [in|out] [on|off]");
      }
      break;

    case 'logo':
      const enableLogo = args[2]?.toLowerCase() === 'on';
      getUserSettings(chatId).addLogo = enableLogo;
      await ctx.reply(`✅ Logo overlay ${enableLogo ? 'enabled' : 'disabled'}`);
      break;

    case 'status':
      const settings = getUserSettings(chatId);
      const queueStats = queueManager.getStats();
      
      await ctx.reply(
        `🎬 Current Settings:\n\n` +
        `Mode: ${settings.mixMode}\n` +
        `Original Volume: ${settings.originalVolume * 100}%\n` +
        `Music Volume: ${settings.musicVolume * 100}%\n` +
        `Fade In: ${settings.fadeIn ? 'On' : 'Off'}\n` +
        `Fade Out: ${settings.fadeOut ? 'On' : 'Off'}\n` +
        `Logo: ${settings.addLogo ? 'On' : 'Off'}\n\n` +
        `📊 Queue Status:\n` +
        `Processing: ${queueStats.processing}\n` +
        `Queued: ${queueStats.queueSize}\n` +
        `Paused: ${queueStats.isPaused ? 'Yes' : 'No'}`
      );
      break;

    default:
      await ctx.reply(
        "🎬 Video Mix Settings\n\n" +
        "/mix mode [mix|replace|music_only] - Set audio mode\n" +
        "/mix volume original [0-1] - Set original audio volume\n" +
        "/mix volume music [0-1] - Set music volume\n" +
        "/mix fade in [on|off] - Toggle fade in effect\n" +
        "/mix fade out [on|off] - Toggle fade out effect\n" +
        "/mix logo [on|off] - Toggle logo overlay\n" +
        "/mix status - Show current settings and queue"
      );
  }
};

/**
 * Admin commands
 */
export const adminHandler = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // Add admin check here
  const args = (ctx.message as any)?.text?.split(' ') || [];
  const command = args[1]?.toLowerCase();

  switch (command) {
    case 'queue':
      const stats = queueManager.getStats();
      await ctx.reply(
        `📊 Queue Status:\n` +
        `Processing: ${stats.processing}/${config.MAX_CONCURRENT_PROCESSING}\n` +
        `Queued: ${stats.queueSize}\n` +
        `Paused: ${stats.isPaused}`
      );
      break;

    case 'pause':
      queueManager.pause();
      await ctx.reply("⏸️ Queue paused");
      break;

    case 'resume':
      queueManager.resume();
      await ctx.reply("▶️ Queue resumed");
      break;

    case 'clear':
      queueManager.clear();
      await ctx.reply("🗑️ Queue cleared");
      break;

    default:
      await ctx.reply(
        "🔧 Admin Commands:\n" +
        "/admin queue - View queue status\n" +
        "/admin pause - Pause processing\n" +
        "/admin resume - Resume processing\n" +
        "/admin clear - Clear queue"
      );
  }
}; 

// Update in src/presentation/handlers/videoHandler.ts

// Add this helper function at the top
async function validateYouTubeUrl(url: string): Promise<boolean> {
  try {
    const ytdl = (await import('@distube/ytdl-core')).default;
    return ytdl.validateURL(url);
  } catch {
    return false;
  }
}

// Update the processAndSendVideo function to include validation
async function processAndSendVideo(
  ctx: Context,
  chatId: number,
  fileId: string,
  youtubeUrl: string
) {
  // Validate YouTube URL first
  const isValid = await validateYouTubeUrl(youtubeUrl);
  if (!isValid) {
    await ctx.reply(
      "❌ Invalid YouTube URL. Please make sure:\n" +
      "• The URL is a valid YouTube video link\n" +
      "• The video is not private or deleted\n" +
      "• The video is available in your region\n\n" +
      "Supported formats:\n" +
      "• https://youtube.com/watch?v=VIDEO_ID\n" +
      "• https://youtu.be/VIDEO_ID\n" +
      "• https://youtube.com/shorts/VIDEO_ID"
    );
    return;
  }

  // Add to queue with progress
  await queueManager.add(async () => {
    let statusMessageId: number | undefined;
    
    try {
      const userPrefs = getUserSettings(chatId);
      
      // Send initial status
      const statusMsg = await ctx.telegram.sendMessage(
        chatId, 
        "🎬 Starting video processing...\n\n⏳ This may take a few minutes."
      );
      statusMessageId = statusMsg.message_id;
      
      // Step 1: Download video
      await updateStatus(ctx, chatId, statusMessageId, "📥 Downloading your video...");
      const videoPath = await videoDownloadService.downloadFromTelegram(ctx, fileId);
      
      // Step 2: Download YouTube audio
      await updateStatus(ctx, chatId, statusMessageId, "📥 Downloading YouTube audio...");
      const { audioPath, duration } = await videoDownloadService.downloadFromYouTube(youtubeUrl);
      
      // Step 3: Process video
      await updateStatus(
        ctx, 
        chatId, 
        statusMessageId, 
        `🎚️ Processing video (${Math.floor(duration / 60)}m ${duration % 60}s audio)...`
      );
      
      let processedPath;
      try {
        processedPath = await videoProcessingService.mixAudio(
          videoPath,
          audioPath,
          {
            originalVolume: userPrefs.originalVolume,
            musicVolume: userPrefs.musicVolume,
            fadeIn: userPrefs.fadeIn,
            fadeOut: userPrefs.fadeOut,
          }
        );
      } catch (mixError) {
        console.error('Mixing failed, trying replace:', mixError);
        await updateStatus(ctx, chatId, statusMessageId, "🔄 Trying alternative audio method...");
        processedPath = await videoProcessingService.replaceAudio(videoPath, audioPath);
      }
      
      // Step 4: Add logo if requested
      if (userPrefs.addLogo) {
        const logoPath = join(process.cwd(), 'assets', 'vaam_logo.png');
        if (fs.existsSync(logoPath)) {
          await updateStatus(ctx, chatId, statusMessageId, "🎨 Adding logo...");
          const logoOutputPath = await videoProcessingService.addLogoToVideo(processedPath, logoPath);
          await videoProcessingService.cleanupFiles([processedPath]);
          processedPath = logoOutputPath;
        }
      }
      
      // Step 5: Compress if needed
      const stats = await fs.promises.stat(processedPath);
      if (stats.size > config.MAX_VIDEO_SIZE_MB * 1024 * 1024) {
        await updateStatus(
          ctx, 
          chatId, 
          statusMessageId, 
          `📦 Compressing video (${(stats.size / 1024 / 1024).toFixed(1)}MB → ${config.MAX_VIDEO_SIZE_MB}MB)...`
        );
        const compressedPath = await videoProcessingService.compressVideo(
          processedPath,
          config.MAX_VIDEO_SIZE_MB
        );
        await videoProcessingService.cleanupFiles([processedPath]);
        processedPath = compressedPath;
      }
      
      // Step 6: Send video
      await updateStatus(ctx, chatId, statusMessageId, "📤 Sending processed video...");
      await ctx.telegram.deleteMessage(chatId, statusMessageId).catch(() => {});
      
      await ctx.telegram.sendVideo(
        chatId,
        { source: fs.createReadStream(processedPath) },
        {
          caption: `✅ Here's your video with background music!\n\n🎵 Original: ${userPrefs.originalVolume * 100}%\n🎵 Music: ${userPrefs.musicVolume * 100}%`,
          supports_streaming: true,
        }
      );
      
      // Clean up
      await videoProcessingService.cleanupFiles([videoPath, audioPath, processedPath]);
      
    } catch (error: any) {
      console.error('Processing error:', error);
      
      const errorMessage = error.message || 'Unknown error';
      let userMessage = "❌ Processing failed.\n\n";
      
      if (errorMessage.includes('Video too long')) {
        userMessage += errorMessage;
      } else if (errorMessage.includes('Invalid YouTube URL')) {
        userMessage += "The YouTube link is invalid or the video is not accessible.";
      } else if (errorMessage.includes('timeout')) {
        userMessage += "The operation timed out. Please try with a shorter video.";
      } else if (errorMessage.includes('ffmpeg')) {
        userMessage += "There was an error processing the video. Please make sure the video is not corrupted.";
      } else {
        userMessage += `Error: ${errorMessage}`;
      }
      
      if (statusMessageId) {
        await ctx.telegram.editMessageText(
          chatId,
          statusMessageId,
          undefined,
          userMessage
        ).catch(async () => {
          await ctx.telegram.sendMessage(chatId, userMessage);
        });
      } else {
        await ctx.telegram.sendMessage(chatId, userMessage);
      }
      
      throw error;
    }
  });
}