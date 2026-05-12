// src/presentation/handlers/tiktokHandler.ts

import { Context } from "telegraf";
import { join } from "path";
import * as fs from "fs";
import { config } from "../../config/config";
import { TikTokDownloadService } from "../../infrastructure/persistence/TikTokDownloadService";
import { VideoDownloadService } from "../../infrastructure/persistence/VideoDownloadService";
import { VideoProcessingService } from "../../infrastructure/persistence/VideoProcessingService";
import { QueueManager } from "../../infrastructure/persistence/QueueManager";

const TMP_DIR = join(process.cwd(), "tmp");

// Initialize services
const tiktokDownloadService = new TikTokDownloadService(config, TMP_DIR);
const videoDownloadService = new VideoDownloadService(config, TMP_DIR);
const videoProcessingService = new VideoProcessingService(TMP_DIR);
const queueManager = new QueueManager(config.MAX_CONCURRENT_PROCESSING);

// Store user TikTok preferences
interface TikTokUserPrefs {
  audioMode: 'mix' | 'replace';  // mix with original or replace entirely
  originalVolume: number;
  tiktokVolume: number;
  loopAudio: boolean;  // loop if TikTok audio is shorter than video
  addEffects: boolean;
  effect: 'vibrant' | 'vintage' | 'glow' | 'none';
}

const userTikTokPrefs = new Map<number, TikTokUserPrefs>();

// Pending TikTok links
interface PendingTikTok {
  videoPath: string;
  timeout: NodeJS.Timeout;
}

const pendingTikToks = new Map<number, PendingTikTok>();

function getDefaultTikTokPrefs(): TikTokUserPrefs {
  return {
    audioMode: 'mix',
    originalVolume: 0.2,  // Lower original volume for TikTok
    tiktokVolume: 0.8,     // Higher TikTok volume
    loopAudio: true,       // Loop short TikTok sounds
    addEffects: false,
    effect: 'none',
  };
}

function getUserTikTokPrefs(chatId: number): TikTokUserPrefs {
  if (!userTikTokPrefs.has(chatId)) {
    userTikTokPrefs.set(chatId, getDefaultTikTokPrefs());
  }
  return userTikTokPrefs.get(chatId)!;
}

/**
 * Update status message
 */
async function updateStatus(ctx: Context, chatId: number, messageId: number | undefined, text: string) {
  try {
    if (messageId) {
      await ctx.telegram.editMessageText(chatId, messageId, undefined, text);
    }
  } catch {
    const sent = await ctx.telegram.sendMessage(chatId, text);
    return sent.message_id;
  }
  return messageId;
}

/**
 * Process video with TikTok audio
 */
async function processVideoWithTikTokAudio(
  ctx: Context,
  chatId: number,
  videoPath: string,
  tiktokUrl: string,
  prefs: TikTokUserPrefs
): Promise<string> {
  let statusMessageId: number | undefined;
  const filesToCleanup: string[] = [videoPath];

  try {
    // Step 1: Download TikTok audio
    statusMessageId = await updateStatus(
      ctx, chatId, statusMessageId, 
      "🎵 Downloading TikTok audio...\nThis may take a moment..."
    );
    
    const { audioPath, info } = await tiktokDownloadService.downloadAudio(tiktokUrl);
    filesToCleanup.push(audioPath);
    
    console.log('TikTok audio downloaded:', info);
    
    // Show TikTok info to user
    if (info.musicTitle) {
      await updateStatus(
        ctx, chatId, statusMessageId,
        `🎵 TikTok Audio: "${info.musicTitle}"\n` +
        `👤 Creator: ${info.author}\n` +
        `⏱️ Duration: ${Math.floor(info.duration)}s\n\n` +
        `Processing your video...`
      );
    }
    
    // Step 2: Get video info
    const videoInfo = await videoProcessingService.getVideoInfo(videoPath);
    const audioDuration = await tiktokDownloadService.getAudioDuration(audioPath);
    
    console.log(`Video: ${videoInfo.duration}s, TikTok: ${audioDuration}s`);
    
    // Step 3: Process based on mode
    let processedPath: string;
    
    if (prefs.audioMode === 'replace' || !videoInfo.hasAudio) {
      // Replace original audio entirely
      statusMessageId = await updateStatus(
        ctx, chatId, statusMessageId,
        "🔄 Replacing audio with TikTok sound..."
      );
      
      if (prefs.loopAudio && audioDuration < videoInfo.duration) {
        // Need to loop the audio
        processedPath = await videoProcessingService['mixAudioWithLoop'](
          videoPath, audioPath, videoInfo.duration, {
            originalVolume: 0,    // Mute original
            musicVolume: prefs.tiktokVolume,
          }
        );
      } else {
        processedPath = await videoProcessingService.replaceAudio(videoPath, audioPath);
      }
    } else {
      // Mix with original audio
      statusMessageId = await updateStatus(
        ctx, chatId, statusMessageId,
        "🎚️ Mixing TikTok sound with video..."
      );
      
      if (prefs.loopAudio && audioDuration < videoInfo.duration) {
        processedPath = await videoProcessingService['mixAudioWithLoop'](
          videoPath, audioPath, videoInfo.duration, {
            originalVolume: prefs.originalVolume,
            musicVolume: prefs.tiktokVolume,
            fadeIn: true,
            fadeOut: true,
          }
        );
      } else {
        processedPath = await videoProcessingService.mixAudio(
          videoPath, audioPath, {
            originalVolume: prefs.originalVolume,
            musicVolume: prefs.tiktokVolume,
          }
        );
      }
    }
    filesToCleanup.push(processedPath);
    
    // Step 4: Add effects if requested
    if (prefs.addEffects && prefs.effect !== 'none') {
      statusMessageId = await updateStatus(
        ctx, chatId, statusMessageId,
        `✨ Adding ${prefs.effect} effect...`
      );
      
      const effectPath = await videoProcessingService.addTikTokStyleEffect(
        processedPath, prefs.effect
      );
      filesToCleanup.push(effectPath);
      processedPath = effectPath;
    }
    
    // Step 5: Compress if needed
    const stats = await fs.promises.stat(processedPath);
    if (stats.size > config.MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      statusMessageId = await updateStatus(
        ctx, chatId, statusMessageId,
        "📦 Compressing video..."
      );
      const compressedPath = await videoProcessingService.compressVideo(processedPath);
      filesToCleanup.push(compressedPath);
      processedPath = compressedPath;
    }
    
    // Clean up other temp files, keep only the final output
    await tiktokDownloadService.cleanupFiles(
      filesToCleanup.filter(f => f !== processedPath)
    );
    
    return processedPath;
    
  } catch (error) {
    await tiktokDownloadService.cleanupFiles(filesToCleanup);
    throw error;
  }
}

/**
 * Main TikTok video handler
 */
export const tiktokVideoHandler = async (ctx: Context) => {
  if (!ctx.message || !('video' in ctx.message)) {
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const msg = ctx.message as any;
  const video = msg.video;
  const caption = msg.caption || '';

  // Check if caption has TikTok link
  const tiktokUrl = tiktokDownloadService.extractTikTokUrl(caption);

  if (tiktokUrl) {
    // Process immediately with TikTok link
    await handleTikTokVideo(ctx, chatId, video.file_id, tiktokUrl);
  } else {
    // Store video and wait for TikTok link
    await ctx.reply(
      "📹 Video received! Now send me a TikTok link for the sound.\n\n" +
      "Example: https://vm.tiktok.com/xxxxx or https://www.tiktok.com/@user/video/123456\n\n" +
      "⚠️ The TikTok video must be public."
    );
    
    try {
      const videoPath = await videoDownloadService.downloadFromTelegram(ctx, video.file_id);
      
      const timeout = setTimeout(async () => {
        if (pendingTikToks.has(chatId)) {
          pendingTikToks.delete(chatId);
          await videoProcessingService.cleanupFiles([videoPath]);
          await ctx.telegram.sendMessage(
            chatId,
            "⏰ Timeout: No TikTok link received. Please try again."
          ).catch(() => {});
        }
      }, 5 * 60 * 1000); // 5 minutes
      
      pendingTikToks.set(chatId, { videoPath, timeout });
      
    } catch (error) {
      console.error('Error saving video:', error);
      await ctx.reply("❌ Error saving your video. Please try again.");
    }
  }
};

/**
 * Text handler for TikTok links
 */
export const tiktokTextHandler = async (ctx: Context) => {
  if (!ctx.message || !('text' in ctx.message)) return;

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const text = ctx.message.text;
  const tiktokUrl = tiktokDownloadService.extractTikTokUrl(text);

  if (tiktokUrl && pendingTikToks.has(chatId)) {
    const pending = pendingTikToks.get(chatId)!;
    clearTimeout(pending.timeout);
    pendingTikToks.delete(chatId);
    
    await handleTikTokVideo(ctx, chatId, null, tiktokUrl, pending.videoPath);
  }
};

/**
 * Handle TikTok video processing
 */
async function handleTikTokVideo(
  ctx: Context,
  chatId: number,
  fileId: string | null,
  tiktokUrl: string,
  existingVideoPath?: string
) {
  await queueManager.add(async () => {
    let statusMessageId: number | undefined;
    const filesToCleanup: string[] = [];
    
    try {
      const prefs = getUserTikTokPrefs(chatId);
      
      // Send initial status
      const statusMsg = await ctx.telegram.sendMessage(
        chatId,
        "🎬 Starting video processing with TikTok sound..."
      );
      statusMessageId = statusMsg.message_id;
      
      // Download or use existing video
      let videoPath: string;
      if (existingVideoPath) {
        videoPath = existingVideoPath;
      } else if (fileId) {
        await updateStatus(ctx, chatId, statusMessageId, "📥 Downloading your video...");
        videoPath = await videoDownloadService.downloadFromTelegram(ctx, fileId);
      } else {
        throw new Error('No video provided');
      }
      filesToCleanup.push(videoPath);
      
      // Process video with TikTok audio
      const processedPath = await processVideoWithTikTokAudio(
        ctx, chatId, videoPath, tiktokUrl, prefs
      );
      
      // Send processed video
      await updateStatus(ctx, chatId, statusMessageId, "📤 Sending your video...");
      
      const caption = `✅ Video with TikTok sound!${
        prefs.audioMode === 'replace' ? '\n🎵 Original audio replaced' : ''
      }${
        prefs.loopAudio ? '\n🔄 Audio looped to match video length' : ''
      }`;
      
      await ctx.telegram.sendVideo(
        chatId,
        { source: fs.createReadStream(processedPath) },
        {
          caption,
          supports_streaming: true,
        }
      );
      
      // Delete status message
      if (statusMessageId) {
        await ctx.telegram.deleteMessage(chatId, statusMessageId).catch(() => {});
      }
      
      // Clean up
      await videoProcessingService.cleanupFiles([processedPath]);
      
    } catch (error: any) {
      console.error('TikTok processing error:', error);
      
      let errorMessage = "❌ Processing failed.\n\n";
      
      if (error.message?.includes('yt-dlp not installed')) {
        errorMessage += "Please install yt-dlp:\n brew install yt-dlp (Mac)\nor apt install yt-dlp (Linux)";
      } else if (error.message?.includes('public')) {
        errorMessage += "The TikTok video might be private. Please use a public video.";
      } else if (error.message?.includes('region')) {
        errorMessage += "This TikTok video might not be available in your region.";
      } else {
        errorMessage += error.message || 'Unknown error';
      }
      
      await ctx.telegram.sendMessage(chatId, errorMessage);
      
      // Clean up
      await videoProcessingService.cleanupFiles(filesToCleanup);
    }
  });
}

/**
 * TikTok settings handler
 */
export const tiktokSettingsHandler = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const args = (ctx.message as any)?.text?.split(' ') || [];
  const command = args[1]?.toLowerCase();

  switch (command) {
    case 'mode':
      const mode = args[2]?.toLowerCase();
      if (mode === 'mix' || mode === 'replace') {
        getUserTikTokPrefs(chatId).audioMode = mode;
        await ctx.reply(
          `✅ TikTok audio mode: ${mode === 'mix' ? 'Mix with original' : 'Replace original'}`
        );
      } else {
        await ctx.reply("❌ Use: /tiktok mode [mix|replace]");
      }
      break;

    case 'volume':
      const type = args[2]?.toLowerCase();
      const value = parseFloat(args[3]);
      
      if (isNaN(value) || value < 0 || value > 1) {
        await ctx.reply("❌ Volume must be between 0 and 1");
        return;
      }
      
      const prefs = getUserTikTokPrefs(chatId);
      if (type === 'original') {
        prefs.originalVolume = value;
        await ctx.reply(`✅ Original audio volume: ${value * 100}%`);
      } else if (type === 'tiktok') {
        prefs.tiktokVolume = value;
        await ctx.reply(`✅ TikTok audio volume: ${value * 100}%`);
      } else {
        await ctx.reply("❌ Use: /tiktok volume [original|tiktok] [0-1]");
      }
      break;

    case 'loop':
      const enable = args[2]?.toLowerCase() === 'on';
      getUserTikTokPrefs(chatId).loopAudio = enable;
      await ctx.reply(`✅ Audio looping ${enable ? 'enabled' : 'disabled'}`);
      break;

    case 'effect':
      const effect = args[2]?.toLowerCase();
      const validEffects = ['vibrant', 'vintage', 'glow', 'none'];
      
      if (validEffects.includes(effect)) {
        const prefs = getUserTikTokPrefs(chatId);
        prefs.addEffects = effect !== 'none';
        prefs.effect = effect as any;
        await ctx.reply(`✅ TikTok effect: ${effect}`);
      } else {
        await ctx.reply("❌ Use: /tiktok effect [vibrant|vintage|glow|none]");
      }
      break;

    case 'status':
      const status = getUserTikTokPrefs(chatId);
      await ctx.reply(
        `🎵 TikTok Settings:\n\n` +
        `Mode: ${status.audioMode}\n` +
        `Original Volume: ${status.originalVolume * 100}%\n` +
        `TikTok Volume: ${status.tiktokVolume * 100}%\n` +
        `Loop Audio: ${status.loopAudio ? 'Yes' : 'No'}\n` +
        `Effects: ${status.addEffects ? status.effect : 'None'}`
      );
      break;

    default:
      await ctx.reply(
        "🎵 TikTok Sound Settings:\n\n" +
        "/tiktok mode [mix|replace] - Audio mode\n" +
        "/tiktok volume original [0-1] - Original volume\n" +
        "/tiktok volume tiktok [0-1] - TikTok volume\n" +
        "/tiktok loop [on|off] - Loop short sounds\n" +
        "/tiktok effect [vibrant|vintage|glow|none] - Add effects\n" +
        "/tiktok status - View current settings\n\n" +
        "How to use:\n" +
        "1. Send a video\n" +
        "2. Send a TikTok link with the sound you want\n" +
        "3. Get your video with TikTok background music!"
      );
  }
};