// src/presentation/handlers/albumHandler.ts
import { Context } from "telegraf";
import { join, resolve } from "path";
// import { promises as fs } from "fs";
import sharp from "sharp";
import { config } from "../../config/config";
import * as fs from "fs";


// Define logo paths for different colors
const LOGO_PATHS = {
  white: resolve(__dirname, "..", "..", "assets", "vaam_white_logo.png"),
  black: resolve(__dirname, "..", "..", "assets", "vaam_black_logo.png"),
  default: resolve(__dirname, "..", "..", "assets", "vaam_logo.png")
};

// const LOGO_PATH = resolve(__dirname, "..", "..", "assets", "vaam_logo.png");
const TMP_DIR = join(process.cwd(), "tmp");


/* Initialisation that runs once when the module is imported.
 * It can live anywhere – here we put it in an async IIFE.
 */
(async () => {
  try {
    await fs.promises.mkdir(TMP_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create temp dir", err);
    process.exit(1);
  }
})();

// Store pending albums per chat and media group
interface PendingAlbum {
  messages: any[];
  timeout: NodeJS.Timeout;
}

// Key format: "chatId:mediaGroupId"
const pendingAlbums = new Map<string, PendingAlbum>();


// Store user's logo preference (in memory - will reset on bot restart)
// For production, use database or session store
const userLogoPreference = new Map<number, string>();

// Command to set logo color
export const setLogoHandler = async (ctx: any) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  
  const args = ctx.message?.text?.split(' ');
  const color = args?.[1]?.toLowerCase();
  
  if (color === 'white' || color === 'black') {
    userLogoPreference.set(chatId, color);
    await ctx.reply(`✅ Logo color set to ${color}. Now send me photos!`);
  } else {
    await ctx.reply('❌ Please specify either "white" or "black".\nExample: /setlogo white');
  }
};

/**
 * Download a photo file from Telegram and return local path.
 * @param ctx Telegraf context
 * @param msg  The photo message (one of the photos in the album)
 */
async function downloadPhoto(ctx: Context, msg: any): Promise<string> {

  console.log("Downloading photo ...");

  const fileId = msg.file_id;
  const file = await ctx.telegram.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

  // Download into a buffer
  const res = (await fetch(url)) as any;

  console.log("res", res)
  
  // 👉 **Important**: no .buffer() here!
  const buffer = Buffer.from(await res.arrayBuffer());

  console.log("Saving to disk ...")

  // Save to disk
  const localPath = join(TMP_DIR, `${fileId}.jpg`);
  await fs.promises.writeFile(localPath, buffer);
  return localPath;
}

// Get logo path based on user preference
function getLogoPath(chatId: number, caption?: string): string {
  console.log("caption", caption)
  // Check caption first (takes priority)
  if (caption) {
    const lowerCaption = caption.toLowerCase();
    if (lowerCaption.includes('white')) return LOGO_PATHS.white;
    if (lowerCaption.includes('black')) return LOGO_PATHS.black;
  }

  // Then check stored preference
  const preference = userLogoPreference.get(chatId);
  if (preference === 'white') return LOGO_PATHS.white;
  if (preference === 'black') return LOGO_PATHS.black;
  
  // Default
  return LOGO_PATHS.default;
}

/**
 * Composite the logo onto the photo at the requested position.
 * Returns the path to the new image.
 */
async function addLogoToImage(imagePath: string, logoPath: string): Promise<string> {
  const logo = await sharp(logoPath)
    .resize({ width: 150 }) // optional: scale logo
    .png()
    .toBuffer();

  // const { width: imgW, height: imgH } = await sharp(imagePath).metadata();
  // const { width: logoW, height: logoH } = await sharp(logo).metadata();

  // Get dimensions of both images
  const imageMetadata = await sharp(imagePath).metadata();
  const logoMetadata = await sharp(logo).metadata();
  
  const imageWidth = imageMetadata.width || 0;
  const imageHeight = imageMetadata.height || 0;
  const logoWidth = logoMetadata.width || 0;
  const logoHeight = logoMetadata.height || 0;

  // Calculate position
  // X: center horizontally
  const left = Math.floor((imageWidth - logoWidth) / 2);
  
  // Y: 25% from the bottom (75% from the top)
  // This means: imageHeight - (imageHeight * 0.25) - logoHeight
  const top = Math.floor(imageHeight - (imageHeight * 0.25) - logoHeight);

  const outputPath = imagePath.replace(".jpg", "_logo.jpg");

  await sharp(imagePath)
    .composite([
      {
        input: logo,
        left: left,
        top: top,
      },
    ])
    .toFile(outputPath);

  return outputPath;
}

async function cleanupTempFiles(filePaths: string[]) {
  for (const filePath of filePaths) {
    try {
      await fs.promises.unlink(filePath).catch(() => {});
      console.log(`Deleted temp file: ${filePath}`);
    } catch (error) {
      // Ignore deletion errors
    }
  }
}

async function processAlbum(ctx: Context, chatId: number, mediaGroupId: string, messages: any[]) {
  let originalFiles: string[] = [];
  let processedFiles: string[] = [];
  
  
  try {
    console.log(`Processing album for chat ${chatId}, group ${mediaGroupId} with ${messages.length} photos`);
    console.log("messages", messages)
    // Download and process each photo
    for (const msg of messages) {
      const photoObj = msg.photo[msg.photo.length - 1]; // highest quality
      const local = await downloadPhoto(ctx, photoObj);
      originalFiles.push(local);
      
      const caption = messages[0].caption; // Get caption if exists
      const logoPath = getLogoPath(chatId, caption);
      const withLogo = await addLogoToImage(local, logoPath);
      processedFiles.push(withLogo);
    }
    
    // Create media group with processed images
    const mediaGroup = processedFiles.map((filePath) => ({
      type: "photo" as const,
      media: {
        source: fs.createReadStream(filePath),
        filename: filePath.split('/').pop() || 'image.jpg'
      }
    }));
    
    // Send the processed album back to the SAME chat
    await ctx.telegram.sendMediaGroup(chatId, mediaGroup, {
      caption: "Here is your album with logo 🎉"
    } as any);
    
    console.log(`Successfully sent processed album to chat ${chatId}`);
    
    // Clean up temp files
    await cleanupTempFiles([...originalFiles, ...processedFiles]);
    
  } catch (error) {
    console.error(`Error processing album for chat ${chatId}:`, error);
    await ctx.telegram.sendMessage(chatId, "Sorry, there was an error processing your album.");
    
    // Clean up temp files even on error
    await cleanupTempFiles([...originalFiles, ...processedFiles]);
  }
}

/**
 * Process a single photo (used for both single photos and album photos)
 */
async function processSinglePhoto(ctx: Context, photoObj: any, chatId: number, caption: string): Promise<string> {
  const originalFile = await downloadPhoto(ctx, photoObj);
  const logoPath = getLogoPath(chatId, caption)
  const processedFile = await addLogoToImage(originalFile, logoPath);
  
  // Send back the processed photo
  await ctx.telegram.sendPhoto(
    chatId,
    {
      source: fs.createReadStream(processedFile),
      filename: processedFile.split('/').pop() || 'image.jpg'
    },
    {
      caption: `Here's your photo with ${logoPath.includes('white') ? 'white' : 'black'} logo 🎉`
    }
  );
  
  // Clean up temp files
  await cleanupTempFiles([originalFile, processedFile]);
  
  return processedFile;
}

/**
 * Telegraf handler for photos (handles single photos or album)
 */
export const albumHandler = async (ctx: Context) => {
  // Validate message
  if (!ctx.message || !('photo' in ctx.message)) {
    return;
  }
  
  const msg = ctx.message;
  const chatId = ctx.chat?.id;
  
  if (!chatId) {
    console.error("No chat ID found");
    return;
  }
  
  const mediaGroupId = msg.media_group_id;
  const photoObj = msg.photo[msg.photo.length - 1]; // Highest quality
  
  // If no media_group_id, it's a single photo, not an album
  if (!mediaGroupId) {
   console.log(`Single photo received from chat ${chatId}, processing...`);
    
    try {
      await processSinglePhoto(ctx, photoObj, chatId, msg.caption!);
    } catch (error) {
      console.error(`Error processing single photo:`, error);
      await ctx.reply("Sorry, there was an error processing your photo.");
    }
    
    return;
  }
  
  // Create unique key for this chat + album
  const albumKey = `${chatId}:${mediaGroupId}`;
  
  // Clear existing timeout if this album is already pending
  if (pendingAlbums.has(albumKey)) {
    const existing = pendingAlbums.get(albumKey)!;
    clearTimeout(existing.timeout);
  }
  
  // Add this message to the pending album
  const pending = pendingAlbums.get(albumKey) || { messages: [], timeout: null as any };
  pending.messages.push(msg as never);
  
  // Set timeout to process the album after all photos arrive
  const timeout = setTimeout(async () => {
    const albumToProcess = pendingAlbums.get(albumKey);
    if (albumToProcess) {
      await processAlbum(ctx, chatId, mediaGroupId, albumToProcess.messages);
      // pendingAlbums.delete(albumKey);
    }
  }, 4000); // Increased to 2 seconds for better reliability
  
  pending.timeout = timeout;
  pendingAlbums.set(albumKey, pending);
  
  console.log(`Added photo to album ${albumKey}, total: ${pending.messages.length}`);
};

// Add this at the bottom of your file
// async function periodicTempCleanup() {
//   const files = await fs.promises.readdir(TMP_DIR);
//   const now = Date.now();
  
//   for (const file of files) {
//     const filePath = join(TMP_DIR, file);
//     const stats = await fs.promises.stat(filePath);
//     // Delete files older than 1 hour
//     if (now - stats.mtimeMs > ONE_HOUR) {
//       await fs.promises.unlink(filePath).catch(console.error);
//       console.log(`Periodic cleanup deleted: ${filePath}`);
//     }
//   }
// }

// Run cleanup every hour
// setInterval(periodicTempCleanup, ONE_HOUR);
