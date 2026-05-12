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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.albumHandler = exports.setLogoHandler = void 0;
const path_1 = require("path");
// import { promises as fs } from "fs";
const sharp_1 = __importDefault(require("sharp"));
const config_1 = require("../../config/config");
const fs = __importStar(require("fs"));
// Define logo paths for different colors
const LOGO_PATHS = {
    white: (0, path_1.resolve)(__dirname, "..", "..", "assets", "vaam_white_logo.png"),
    black: (0, path_1.resolve)(__dirname, "..", "..", "assets", "vaam_black_logo.png"),
    default: (0, path_1.resolve)(__dirname, "..", "..", "assets", "vaam_logo.png")
};
// const LOGO_PATH = resolve(__dirname, "..", "..", "assets", "vaam_logo.png");
const TMP_DIR = (0, path_1.join)(process.cwd(), "tmp");
/* Initialisation that runs once when the module is imported.
 * It can live anywhere – here we put it in an async IIFE.
 */
(async () => {
    try {
        await fs.promises.mkdir(TMP_DIR, { recursive: true });
    }
    catch (err) {
        console.error("Failed to create temp dir", err);
        process.exit(1);
    }
})();
// Key format: "chatId:mediaGroupId"
const pendingAlbums = new Map();
// Store user's logo preference (in memory - will reset on bot restart)
// For production, use database or session store
const userLogoPreference = new Map();
// Command to set logo color
const setLogoHandler = async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId)
        return;
    const args = ctx.message?.text?.split(' ');
    const color = args?.[1]?.toLowerCase();
    if (color === 'white' || color === 'black') {
        userLogoPreference.set(chatId, color);
        await ctx.reply(`✅ Logo color set to ${color}. Now send me photos!`);
    }
    else {
        await ctx.reply('❌ Please specify either "white" or "black".\nExample: /setlogo white');
    }
};
exports.setLogoHandler = setLogoHandler;
/**
 * Download a photo file from Telegram and return local path.
 * @param ctx Telegraf context
 * @param msg  The photo message (one of the photos in the album)
 */
async function downloadPhoto(ctx, msg) {
    console.log("Downloading photo ...");
    const fileId = msg.file_id;
    const file = await ctx.telegram.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${config_1.config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    // Download into a buffer
    const res = (await fetch(url));
    console.log("res", res);
    // 👉 **Important**: no .buffer() here!
    const buffer = Buffer.from(await res.arrayBuffer());
    console.log("Saving to disk ...");
    // Save to disk
    const localPath = (0, path_1.join)(TMP_DIR, `${fileId}.jpg`);
    await fs.promises.writeFile(localPath, buffer);
    return localPath;
}
// Get logo path based on user preference
function getLogoPath(chatId, caption) {
    console.log("caption", caption);
    // Check caption first (takes priority)
    if (caption) {
        const lowerCaption = caption.toLowerCase();
        if (lowerCaption.includes('white'))
            return LOGO_PATHS.white;
        if (lowerCaption.includes('black'))
            return LOGO_PATHS.black;
    }
    // Then check stored preference
    const preference = userLogoPreference.get(chatId);
    if (preference === 'white')
        return LOGO_PATHS.white;
    if (preference === 'black')
        return LOGO_PATHS.black;
    // Default
    return LOGO_PATHS.default;
}
/**
 * Composite the logo onto the photo at the requested position.
 * Returns the path to the new image.
 */
async function addLogoToImage(imagePath, logoPath) {
    const logo = await (0, sharp_1.default)(logoPath)
        .resize({ width: 150 }) // optional: scale logo
        .png()
        .toBuffer();
    // const { width: imgW, height: imgH } = await sharp(imagePath).metadata();
    // const { width: logoW, height: logoH } = await sharp(logo).metadata();
    // Get dimensions of both images
    const imageMetadata = await (0, sharp_1.default)(imagePath).metadata();
    const logoMetadata = await (0, sharp_1.default)(logo).metadata();
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
    await (0, sharp_1.default)(imagePath)
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
async function cleanupTempFiles(filePaths) {
    for (const filePath of filePaths) {
        try {
            await fs.promises.unlink(filePath).catch(() => { });
            console.log(`Deleted temp file: ${filePath}`);
        }
        catch (error) {
            // Ignore deletion errors
        }
    }
}
async function processAlbum(ctx, chatId, mediaGroupId, messages) {
    let originalFiles = [];
    let processedFiles = [];
    try {
        console.log(`Processing album for chat ${chatId}, group ${mediaGroupId} with ${messages.length} photos`);
        console.log("messages", messages);
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
            type: "photo",
            media: {
                source: fs.createReadStream(filePath),
                filename: filePath.split('/').pop() || 'image.jpg'
            }
        }));
        // Send the processed album back to the SAME chat
        await ctx.telegram.sendMediaGroup(chatId, mediaGroup, {
            caption: "Here is your album with logo 🎉"
        });
        console.log(`Successfully sent processed album to chat ${chatId}`);
        // Clean up temp files
        await cleanupTempFiles([...originalFiles, ...processedFiles]);
    }
    catch (error) {
        console.error(`Error processing album for chat ${chatId}:`, error);
        await ctx.telegram.sendMessage(chatId, "Sorry, there was an error processing your album.");
        // Clean up temp files even on error
        await cleanupTempFiles([...originalFiles, ...processedFiles]);
    }
}
/**
 * Process a single photo (used for both single photos and album photos)
 */
async function processSinglePhoto(ctx, photoObj, chatId, caption) {
    const originalFile = await downloadPhoto(ctx, photoObj);
    const logoPath = getLogoPath(chatId, caption);
    const processedFile = await addLogoToImage(originalFile, logoPath);
    // Send back the processed photo
    await ctx.telegram.sendPhoto(chatId, {
        source: fs.createReadStream(processedFile),
        filename: processedFile.split('/').pop() || 'image.jpg'
    }, {
        caption: `Here's your photo with ${logoPath.includes('white') ? 'white' : 'black'} logo 🎉`
    });
    // Clean up temp files
    await cleanupTempFiles([originalFile, processedFile]);
    return processedFile;
}
/**
 * Telegraf handler for photos (handles single photos or album)
 */
const albumHandler = async (ctx) => {
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
            await processSinglePhoto(ctx, photoObj, chatId, msg.caption);
        }
        catch (error) {
            console.error(`Error processing single photo:`, error);
            await ctx.reply("Sorry, there was an error processing your photo.");
        }
        return;
    }
    // Create unique key for this chat + album
    const albumKey = `${chatId}:${mediaGroupId}`;
    // Clear existing timeout if this album is already pending
    if (pendingAlbums.has(albumKey)) {
        const existing = pendingAlbums.get(albumKey);
        clearTimeout(existing.timeout);
    }
    // Add this message to the pending album
    const pending = pendingAlbums.get(albumKey) || { messages: [], timeout: null };
    pending.messages.push(msg);
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
exports.albumHandler = albumHandler;
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
//# sourceMappingURL=albumHandler.js.map