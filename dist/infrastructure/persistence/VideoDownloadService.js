"use strict";
// src/services/VideoDownloadService.ts
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
exports.VideoDownloadService = void 0;
const fs = __importStar(require("fs"));
const path_1 = require("path");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class VideoDownloadService {
    config;
    tmpDir;
    constructor(config, tmpDir) {
        this.config = config;
        this.tmpDir = tmpDir;
        this.ensureTmpDir();
    }
    async ensureTmpDir() {
        try {
            await fs.promises.mkdir(this.tmpDir, { recursive: true });
        }
        catch (err) {
            console.error('Failed to create temp directory:', err);
            throw err;
        }
    }
    async downloadFromTelegram(ctx, fileId) {
        console.log(`Downloading Telegram file: ${fileId}`);
        const file = await ctx.telegram.getFile(fileId);
        if (!file.file_path) {
            throw new Error('File path not available');
        }
        const token = this.config.TELEGRAM_BOT_TOKEN;
        const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        // Download with retry logic
        for (let attempt = 1; attempt <= this.config.MAX_RETRIES; attempt++) {
            try {
                console.log(`Download attempt ${attempt}/${this.config.MAX_RETRIES}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.YOUTUBE_REQUEST_TIMEOUT_MS);
                const response = await fetch(url, {
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const buffer = Buffer.from(await response.arrayBuffer());
                if (buffer.length === 0) {
                    throw new Error('Downloaded file is empty');
                }
                const localPath = (0, path_1.join)(this.tmpDir, `telegram_${fileId}_${Date.now()}.mp4`);
                await fs.promises.writeFile(localPath, buffer);
                console.log(`Downloaded to: ${localPath} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
                return localPath;
            }
            catch (error) {
                console.error(`Download attempt ${attempt} failed:`, error.message);
                if (attempt === this.config.MAX_RETRIES) {
                    throw new Error(`Failed to download after ${this.config.MAX_RETRIES} attempts: ${error.message}`);
                }
                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw new Error('Download failed');
    }
    /**
     * Download YouTube audio using multiple methods with fallbacks
     */
    async downloadFromYouTube(url) {
        console.log(`Downloading YouTube audio from: ${url}`);
        const errors = [];
        // Method 1: Try ytdl-core
        try {
            return await this.downloadWithYtdlCore(url);
        }
        catch (error) {
            console.log('ytdl-core method failed:', error.message);
            errors.push(`ytdl-core: ${error.message}`);
        }
        // Method 2: Try youtube-dl-exec (if installed)
        try {
            return await this.downloadWithYoutubeDl(url);
        }
        catch (error) {
            console.log('youtube-dl method failed:', error.message);
            errors.push(`youtube-dl: ${error.message}`);
        }
        // Method 3: Try yt-dlp (if installed)
        try {
            return await this.downloadWithYtDlp(url);
        }
        catch (error) {
            console.log('yt-dlp method failed:', error.message);
            errors.push(`yt-dlp: ${error.message}`);
        }
        // Method 4: Try using a different version of ytdl-core
        try {
            return await this.downloadWithYtdlCoreAlternative(url);
        }
        catch (error) {
            console.log('Alternative ytdl-core method failed:', error.message);
            errors.push(`Alternative ytdl-core: ${error.message}`);
        }
        throw new Error(`All download methods failed:\n${errors.map(e => `• ${e}`).join('\n')}\n\n` +
            `Try:\n` +
            `1. Install yt-dlp: brew install yt-dlp (Mac) or apt install yt-dlp (Linux)\n` +
            `2. Or use a different YouTube URL`);
    }
    /**
     * Method 1: Standard ytdl-core download
     */
    async downloadWithYtdlCore(url) {
        console.log('Trying download with @distube/ytdl-core...');
        const ytdl = (await Promise.resolve().then(() => __importStar(require('@distube/ytdl-core')))).default;
        // Validate URL
        if (!ytdl.validateURL(url)) {
            throw new Error('Invalid YouTube URL');
        }
        // Get video info with retry
        let info;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                info = await ytdl.getInfo(url);
                break;
            }
            catch (error) {
                console.log(`Info fetch attempt ${attempt} failed:`, error.message);
                if (attempt === 3)
                    throw error;
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
        }
        if (!info) {
            throw new Error('Failed to get video info');
        }
        // Log available formats for debugging
        console.log('Available formats:', info.formats.map(f => ({
            quality: f.quality,
            container: f.container,
            hasAudio: f.hasAudio,
            hasVideo: f.hasVideo
        })));
        const duration = parseInt(info.videoDetails.lengthSeconds);
        if (duration > this.config.MAX_YOUTUBE_DURATION_SECONDS) {
            throw new Error(`Video too long (${Math.floor(duration / 60)}m ${duration % 60}s). ` +
                `Maximum allowed: ${Math.floor(this.config.MAX_YOUTUBE_DURATION_SECONDS / 60)} minutes`);
        }
        const outputPath = (0, path_1.join)(this.tmpDir, `youtube_${Date.now()}.mp3`);
        // Try to download with different quality options
        const audioFormats = info.formats.filter(f => f.hasAudio && !f.hasVideo);
        console.log(`Found ${audioFormats.length} audio-only formats`);
        if (audioFormats.length === 0) {
            // If no audio-only formats, try formats with both audio and video
            const mixedFormats = info.formats.filter(f => f.hasAudio && f.hasVideo);
            if (mixedFormats.length > 0) {
                console.log('No audio-only formats, using mixed format with lowest quality');
                return await this.downloadWithFormat(url, outputPath, mixedFormats[mixedFormats.length - 1]);
            }
            throw new Error('No playable formats found');
        }
        // Try highest quality audio first, fall back to lower qualities
        for (const format of audioFormats.reverse()) {
            try {
                console.log(`Trying format: ${format.quality} (${format.container})`);
                return await this.downloadWithFormat(url, outputPath, format);
            }
            catch (error) {
                console.log(`Format ${format.quality} failed:`, error.message);
                continue;
            }
        }
        throw new Error('Failed to download with any available format');
    }
    /**
     * Download with specific format
     */
    async downloadWithFormat(url, outputPath, format) {
        const ytdl = (await Promise.resolve().then(() => __importStar(require('@distube/ytdl-core')))).default;
        return new Promise((resolve, reject) => {
            const stream = ytdl(url, {
                format: format,
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    }
                }
            });
            const writeStream = fs.createWriteStream(outputPath);
            const timeout = setTimeout(() => {
                stream.destroy();
                writeStream.destroy();
                reject(new Error('Download timeout'));
            }, this.config.YOUTUBE_REQUEST_TIMEOUT_MS * 3);
            stream.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            writeStream.on('finish', () => {
                clearTimeout(timeout);
                const stats = fs.statSync(outputPath);
                console.log(`Downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
                resolve({ audioPath: outputPath, duration: parseInt(format.approxDurationMs || '0') / 1000 });
            });
            writeStream.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            stream.pipe(writeStream);
        });
    }
    /**
     * Method 2: Download using youtube-dl-exec
     */
    async downloadWithYoutubeDl(url) {
        console.log('Trying download with youtube-dl...');
        const outputPath = (0, path_1.join)(this.tmpDir, `youtube_${Date.now()}.mp3`);
        const outputTemplate = (0, path_1.join)(this.tmpDir, `youtube_${Date.now()}.%(ext)s`);
        try {
            // Check if youtube-dl is installed
            await execAsync('youtube-dl --version');
        }
        catch {
            throw new Error('youtube-dl not installed. Install it with: pip install youtube-dl');
        }
        // Download audio
        const command = `youtube-dl -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${url}" --no-check-certificate --no-warnings --prefer-ffmpeg`;
        console.log('Running command:', command);
        const { stdout } = await execAsync(command, {
            timeout: this.config.YOUTUBE_REQUEST_TIMEOUT_MS * 3,
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        });
        console.log('youtube-dl output:', stdout);
        // Find the actual output file
        const files = await fs.promises.readdir(this.tmpDir);
        const outputFile = files.find(f => f.startsWith(`youtube_${outputPath.split('_')[1].split('.')[0]}`) &&
            f.endsWith('.mp3'));
        if (!outputFile) {
            throw new Error('Downloaded file not found');
        }
        const actualPath = (0, path_1.join)(this.tmpDir, outputFile);
        const stats = await fs.promises.stat(actualPath);
        if (stats.size === 0) {
            throw new Error('Downloaded file is empty');
        }
        // Get duration using ffprobe
        const duration = await this.getAudioDuration(actualPath);
        return { audioPath: actualPath, duration };
    }
    /**
     * Method 3: Download using yt-dlp (newer, more reliable)
     */
    async downloadWithYtDlp(url) {
        console.log('Trying download with yt-dlp...');
        const outputTemplate = (0, path_1.join)(this.tmpDir, `youtube_${Date.now()}.%(ext)s`);
        try {
            // Check if yt-dlp is installed
            await execAsync('yt-dlp --version');
        }
        catch {
            throw new Error('yt-dlp not installed. Install it with: brew install yt-dlp (Mac) or pip install yt-dlp');
        }
        // Download best audio
        const command = `yt-dlp -f "bestaudio[ext=m4a]/bestaudio/best" -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${url}" --no-check-certificate --no-warnings --force-overwrites`;
        console.log('Running command:', command);
        const { stdout } = await execAsync(command, {
            timeout: this.config.YOUTUBE_REQUEST_TIMEOUT_MS * 3,
            maxBuffer: 1024 * 1024 * 10
        });
        console.log('yt-dlp output:', stdout);
        // Find the output file
        const files = await fs.promises.readdir(this.tmpDir);
        const outputFile = files.find(f => f.startsWith(`youtube_${outputTemplate.split('_')[1].split('.')[0]}`) &&
            (f.endsWith('.mp3') || f.endsWith('.m4a')));
        if (!outputFile) {
            throw new Error('Downloaded file not found');
        }
        const actualPath = (0, path_1.join)(this.tmpDir, outputFile);
        const stats = await fs.promises.stat(actualPath);
        if (stats.size === 0) {
            throw new Error('Downloaded file is empty');
        }
        const duration = await this.getAudioDuration(actualPath);
        return { audioPath: actualPath, duration };
    }
    /**
     * Method 4: Alternative ytdl-core with different options
     */
    async downloadWithYtdlCoreAlternative(url) {
        console.log('Trying alternative ytdl-core method...');
        const ytdl = (await Promise.resolve().then(() => __importStar(require('@distube/ytdl-core')))).default;
        const outputPath = (0, path_1.join)(this.tmpDir, `youtube_${Date.now()}.mp3`);
        return new Promise((resolve, reject) => {
            const stream = ytdl(url, {
                quality: 'lowestaudio',
                filter: 'audioonly',
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                    }
                },
                highWaterMark: 1024 * 1024 * 10, // 10MB buffer
            });
            const writeStream = fs.createWriteStream(outputPath);
            const timeout = setTimeout(() => {
                stream.destroy();
                writeStream.destroy();
                reject(new Error('Download timeout'));
            }, this.config.YOUTUBE_REQUEST_TIMEOUT_MS * 3);
            stream.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            writeStream.on('finish', () => {
                clearTimeout(timeout);
                const stats = fs.statSync(outputPath);
                console.log(`Alternative download: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
                // Get duration from the downloaded file
                this.getAudioDuration(outputPath)
                    .then(duration => resolve({ audioPath: outputPath, duration }))
                    .catch(() => resolve({ audioPath: outputPath, duration: 0 }));
            });
            writeStream.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            stream.pipe(writeStream);
        });
    }
    /**
     * Get audio duration using ffprobe
     */
    async getAudioDuration(filePath) {
        try {
            const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
            return parseFloat(stdout.trim()) || 0;
        }
        catch {
            return 0;
        }
    }
}
exports.VideoDownloadService = VideoDownloadService;
//# sourceMappingURL=VideoDownloadService.js.map