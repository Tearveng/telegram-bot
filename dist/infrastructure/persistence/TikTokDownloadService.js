"use strict";
// src/services/TikTokDownloadService.ts
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
exports.TikTokDownloadService = void 0;
const fs = __importStar(require("fs"));
const path_1 = require("path");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class TikTokDownloadService {
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
            console.error("Failed to create temp directory:", err);
            throw err;
        }
    }
    /**
     * Extract TikTok URL from text
     */
    extractTikTokUrl(text) {
        if (!text)
            return null;
        const patterns = [
            // Video URLs (existing patterns)
            /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/i,
            /https?:\/\/(?:www\.)?tiktok\.com\/t\/(\w+)/i,
            /https?:\/\/(?:vm\.)?tiktok\.com\/(\w+)\/?/i,
            /https?:\/\/(?:vt\.)?tiktok\.com\/(\w+)\/?/i,
            /https?:\/\/m\.tiktok\.com\/v\/(\d+)\.html/i,
            // NEW: Music/Sound URLs
            /https?:\/\/(?:www\.)?tiktok\.com\/music\/[\w-]+-(\d+)/i,
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return match[0].replace(/\/$/, "");
            }
        }
        return null;
    }
    /**
     * Extract video ID from TikTok URL
     */
    extractVideoId(url) {
        // Pattern for /video/123456 format
        const videoMatch = url.match(/\/video\/(\d+)/i);
        if (videoMatch)
            return videoMatch[1];
        // Pattern for /t/xxxxx format (short links)
        // These usually redirect, so we'll let yt-dlp handle it
        // Pattern for vm.tiktok.com/xxxxx
        const shortMatch = url.match(/tiktok\.com\/(\w+)\/?$/i);
        if (shortMatch)
            return shortMatch[1];
        return null;
    }
    /**
     * Download TikTok audio using yt-dlp (primary method)
     */
    async downloadAudio(url) {
        console.log(`\n📥 Downloading TikTok audio from: ${url}`);
        // CHECK IF IT'S A MUSIC URL (this is the key part!)
        const isMusicUrl = url.includes("/music/");
        if (isMusicUrl) {
            console.log("🎵 Detected MUSIC/SOUND URL - using special handler");
            return await this.downloadFromMusicPage(url);
        }
        // For regular video URLs, use existing methods
        console.log("📹 Detected VIDEO URL - using standard methods");
        const errors = [];
        // Try yt-dlp first
        try {
            return await this.downloadWithYtDlp(url);
        }
        catch (error) {
            console.log("yt-dlp failed:", error.message);
            errors.push(`yt-dlp: ${error.message}`);
        }
        // Try alternative APIs
        try {
            return await this.downloadWithAlternativeAPI(url);
        }
        catch (error) {
            console.log("Alternative API failed:", error.message);
            errors.push(`API: ${error.message}`);
        }
        // Try TikWM
        try {
            return await this.downloadWithTikWM(url);
        }
        catch (error) {
            console.log("TikWM failed:", error.message);
            errors.push(`TikWM: ${error.message}`);
        }
        throw new Error(`All download methods failed:\n${errors.map((e) => `• ${e}`).join("\n")}`);
    }
    /**
     * Method 1: Download using yt-dlp (MOST RELIABLE)
     */
    async downloadWithYtDlp(url) {
        console.log("📥 Downloading with yt-dlp...");
        // Check if yt-dlp is installed
        try {
            const { stdout } = await execAsync("yt-dlp --version");
            console.log("yt-dlp version:", stdout.trim());
        }
        catch (error) {
            throw new Error("yt-dlp is not installed. Install it:\n" +
                "• Mac: brew install yt-dlp\n" +
                "• Linux: sudo apt install yt-dlp\n" +
                "• Windows: winget install yt-dlp\n\n" +
                "Or visit: https://github.com/yt-dlp/yt-dlp#installation");
        }
        const timestamp = Date.now();
        const outputTemplate = (0, path_1.join)(this.tmpDir, `tiktok_${timestamp}.%(ext)s`);
        try {
            // Get video info first
            console.log("Getting video info...");
            const { stdout: infoJson } = await execAsync(`yt-dlp --dump-json --no-check-certificate "${url}"`, { timeout: 15000, maxBuffer: 1024 * 1024 * 5 });
            // Parse JSON (yt-dlp might output multiple lines)
            let videoInfo;
            try {
                videoInfo = JSON.parse(infoJson);
            }
            catch {
                const lines = infoJson.trim().split("\n");
                videoInfo = JSON.parse(lines[lines.length - 1]);
            }
            console.log("Video info:", {
                title: videoInfo.title,
                duration: videoInfo.duration,
                uploader: videoInfo.uploader,
            });
            // Check duration
            const duration = videoInfo.duration || 0;
            if (duration > this.config.MAX_YOUTUBE_DURATION_SECONDS) {
                throw new Error(`TikTok audio too long (${Math.floor(duration / 60)}m ${duration % 60}s). ` +
                    `Max: ${Math.floor(this.config.MAX_YOUTUBE_DURATION_SECONDS / 60)}m`);
            }
            // Download audio only
            console.log("Downloading audio...");
            const downloadCmd = [
                "yt-dlp",
                "-x", // Extract audio
                "--audio-format",
                "mp3",
                "--audio-quality",
                "0", // Best quality
                "-o",
                `"${outputTemplate}"`,
                `"${url}"`,
                "--no-check-certificate",
                "--no-warnings",
                "--force-overwrites",
                "--extract-audio",
                "--no-playlist",
                "--socket-timeout",
                "30",
                "--retries",
                "5",
                "--no-progress", // Reduce output noise
            ].join(" ");
            await execAsync(downloadCmd, {
                timeout: 60000,
                maxBuffer: 1024 * 1024 * 10,
            });
            // Find the downloaded file
            const files = await fs.promises.readdir(this.tmpDir);
            const audioFile = files.find((f) => f.includes(`tiktok_${timestamp}`) &&
                (f.endsWith(".mp3") ||
                    f.endsWith(".m4a") ||
                    f.endsWith(".webm") ||
                    f.endsWith(".opus")));
            if (!audioFile) {
                console.log("All files:", files.filter((f) => f.includes("tiktok")));
                throw new Error("Downloaded file not found");
            }
            const audioPath = (0, path_1.join)(this.tmpDir, audioFile);
            const stats = await fs.promises.stat(audioPath);
            if (stats.size === 0) {
                await fs.promises.unlink(audioPath);
                throw new Error("Downloaded file is empty");
            }
            console.log(`✅ Audio downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
            return {
                audioPath,
                info: {
                    id: videoInfo.id || videoInfo.display_id || "",
                    description: videoInfo.description || "",
                    author: videoInfo.uploader || videoInfo.creator || "",
                    duration: duration,
                    musicTitle: videoInfo.track || videoInfo.title || "",
                    musicAuthor: videoInfo.artist || videoInfo.creator || "",
                    videoUrl: url,
                    musicUrl: videoInfo.extractor_url || "",
                },
            };
        }
        catch (error) {
            // Clean up partial downloads
            const files = await fs.promises.readdir(this.tmpDir);
            for (const file of files) {
                if (file.includes(`tiktok_${timestamp}`)) {
                    await fs.promises.unlink((0, path_1.join)(this.tmpDir, file)).catch(() => { });
                }
            }
            throw error;
        }
    }
    /**
     * Method 2: Download using alternative free API (TikWM)
     */
    async downloadWithTikWM(url) {
        console.log("📥 Trying TikWM API...");
        const timestamp = Date.now();
        try {
            // TikWM is a free TikTok downloader API
            const apiUrl = `https://www.tikwm.com/api/`;
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    Accept: "application/json",
                },
                body: new URLSearchParams({
                    url: url,
                    count: "12",
                    cursor: "0",
                    web: "1",
                    hd: "1",
                }).toString(),
            });
            if (!response.ok) {
                throw new Error(`TikWM API returned ${response.status}`);
            }
            const data = await response.json();
            if (data.code !== 0 || !data.data) {
                throw new Error(`TikWM API error: ${data.msg || "Unknown error"}`);
            }
            console.log("TikWM response:", {
                title: data.data.title,
                author: data.data.author?.nickname,
                duration: data.data.duration,
            });
            // Get the music URL
            const musicUrl = data.data.music || data.data.music_info?.play;
            if (!musicUrl) {
                throw new Error("No music URL found in TikWM response");
            }
            console.log("Downloading audio from:", musicUrl);
            // Download the audio file
            const audioResponse = await fetch(musicUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    Referer: "https://www.tikwm.com/",
                },
            });
            if (!audioResponse.ok) {
                throw new Error(`Failed to download audio: ${audioResponse.status}`);
            }
            const buffer = Buffer.from(await audioResponse.arrayBuffer());
            // Determine file extension from URL or content-type
            const contentType = audioResponse.headers.get("content-type") || "";
            let extension = ".mp3";
            if (contentType.includes("m4a"))
                extension = ".m4a";
            else if (contentType.includes("ogg"))
                extension = ".ogg";
            const audioPath = (0, path_1.join)(this.tmpDir, `tiktok_${timestamp}${extension}`);
            await fs.promises.writeFile(audioPath, buffer);
            const stats = await fs.promises.stat(audioPath);
            console.log(`✅ Audio downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
            return {
                audioPath,
                info: {
                    id: data.data.id || this.extractVideoId(url) || "",
                    description: data.data.title || "",
                    author: data.data.author?.nickname || data.data.author?.unique_id || "",
                    duration: data.data.duration || 0,
                    musicTitle: data.data.music_info?.title || data.data.title || "",
                    musicAuthor: data.data.music_info?.author || data.data.author?.nickname || "",
                    videoUrl: url,
                    musicUrl: musicUrl,
                },
            };
        }
        catch (error) {
            // Clean up any partial download
            const files = await fs.promises.readdir(this.tmpDir);
            for (const file of files) {
                if (file.includes(`tiktok_${timestamp}`)) {
                    await fs.promises.unlink((0, path_1.join)(this.tmpDir, file)).catch(() => { });
                }
            }
            throw error;
        }
    }
    /**
     * Method 3: Alternative API (TikTok oEmbed + direct download)
     */
    async downloadWithAlternativeAPI(url) {
        console.log("📥 Trying alternative API...");
        const timestamp = Date.now();
        try {
            // Step 1: Get oEmbed info
            const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
            const oembedResponse = await fetch(oembedUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
            });
            if (!oembedResponse.ok) {
                throw new Error(`oEmbed API failed: ${oembedResponse.status}`);
            }
            const oembedData = await oembedResponse.json();
            console.log("oEmbed data:", {
                title: oembedData.title,
                author: oembedData.author_name,
            });
            // Step 2: Try to get direct URL from TikTok page
            // Extract the username and video ID from oEmbed
            //   const authorUrl = oembedData.author_url;
            //   const username = authorUrl.split('/').pop();
            // Try several alternative APIs
            const apis = [
                // API 1: tikcdn
                {
                    name: "tikcdn",
                    url: `https://tikcdn.io/ssstik/${encodeURIComponent(url)}`,
                    parser: (data) => data?.music?.play_url || data?.audio?.url,
                },
                // API 2: Another TikTok downloader
                {
                    name: "tiktok-downloader",
                    url: `https://api.tiktok-downloader.com/api/download?url=${encodeURIComponent(url)}`,
                    parser: (data) => data?.music || data?.audio,
                },
            ];
            for (const api of apis) {
                try {
                    console.log(`Trying ${api.name}...`);
                    const apiResponse = await fetch(api.url, {
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        },
                    });
                    if (apiResponse.ok) {
                        const data = await apiResponse.json();
                        const musicUrl = api.parser(data);
                        if (musicUrl) {
                            console.log(`Found music URL from ${api.name}`);
                            // Download the audio
                            const audioResponse = await fetch(musicUrl, {
                                headers: {
                                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                    Referer: "https://www.tiktok.com/",
                                },
                            });
                            if (audioResponse.ok) {
                                const buffer = Buffer.from(await audioResponse.arrayBuffer());
                                const audioPath = (0, path_1.join)(this.tmpDir, `tiktok_${timestamp}.mp3`);
                                await fs.promises.writeFile(audioPath, buffer);
                                const stats = await fs.promises.stat(audioPath);
                                console.log(`✅ Audio downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
                                return {
                                    audioPath,
                                    info: {
                                        id: this.extractVideoId(url) || "",
                                        description: oembedData.title || "",
                                        author: oembedData.author_name || "",
                                        duration: 0,
                                        musicTitle: data?.music_title || "",
                                        musicAuthor: data?.music_author || "",
                                        videoUrl: url,
                                        musicUrl: musicUrl,
                                    },
                                };
                            }
                        }
                    }
                }
                catch (e) {
                    console.log(`${api.name} failed:`, e);
                }
            }
            throw new Error("All alternative APIs failed");
        }
        catch (error) {
            // Clean up
            const files = await fs.promises.readdir(this.tmpDir);
            for (const file of files) {
                if (file.includes(`tiktok_${timestamp}`)) {
                    await fs.promises.unlink((0, path_1.join)(this.tmpDir, file)).catch(() => { });
                }
            }
            throw error;
        }
    }
    /**
     * Clean up temporary files
     */
    async cleanupFiles(filePaths) {
        for (const path of filePaths) {
            try {
                if (path && fs.existsSync(path)) {
                    await fs.promises.unlink(path);
                    console.log(`🧹 Cleaned up: ${path}`);
                }
            }
            catch (error) {
                console.error(`Failed to cleanup ${path}:`, error);
            }
        }
    }
    /**
     * Handle TikTok music/sound page URLs
     */
    async downloadFromMusicPage(url) {
        console.log("🎵 Processing TikTok music/sound page...");
        // Step 1: Extract the sound ID from the URL
        const soundIdMatch = url.match(/\/music\/[\w-]+-(\d+)/);
        if (!soundIdMatch) {
            throw new Error("Invalid TikTok music URL format");
        }
        const soundId = soundIdMatch[1];
        console.log("📋 Sound ID extracted:", soundId);
        const timestamp = Date.now();
        try {
            // Method A: Try using yt-dlp first (it might handle music URLs)
            try {
                console.log("Trying yt-dlp for music URL...");
                return await this.downloadWithYtDlp(url);
            }
            catch (ytDlpError) {
                console.log("yt-dlp failed for music URL:", ytDlpError.message);
                console.log("Falling back to direct API...");
            }
            // Method B: Use TikTok's internal API to get music info
            return await this.downloadSoundDirectly(soundId, url, timestamp);
        }
        catch (error) {
            // Clean up any partial downloads
            const files = await fs.promises.readdir(this.tmpDir);
            for (const file of files) {
                if (file.includes(`tiktok_${timestamp}`)) {
                    await fs.promises.unlink((0, path_1.join)(this.tmpDir, file)).catch(() => { });
                }
            }
            throw error;
        }
    }
    /**
     * Download sound directly using TikTok API
     */
    async downloadSoundDirectly(soundId, originalUrl, timestamp) {
        console.log("📡 Calling TikTok API for sound ID:", soundId);
        // API endpoint for music details
        const apiUrl = `https://www.tiktok.com/api/music/detail/?musicId=${soundId}&language=en`;
        console.log("API URL:", apiUrl);
        try {
            const response = await fetch(apiUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    Referer: "https://www.tiktok.com/",
                    Accept: "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            });
            if (!response.ok) {
                console.log(`API returned ${response.status}, trying alternative...`);
                // Try alternative API format
                return await this.downloadSoundAlternative(soundId, originalUrl, timestamp);
            }
            const responseText = await response.text();
            let data;
            try {
                data = JSON.parse(responseText);
            }
            catch {
                console.log("Failed to parse JSON, trying alternative...");
                return await this.downloadSoundAlternative(soundId, originalUrl, timestamp);
            }
            console.log("API Response status:", data?.statusCode || data?.status_code);
            // Extract music info - TikTok API structure can vary
            const musicInfo = data?.musicInfo || data?.music || data?.itemInfo?.itemStruct?.music;
            if (!musicInfo) {
                console.log("API Response keys:", Object.keys(data));
                console.log("Trying alternative method...");
                return await this.downloadSoundAlternative(soundId, originalUrl, timestamp);
            }
            console.log("Music info found:", {
                title: musicInfo.title,
                author: musicInfo.authorName,
                duration: musicInfo.duration,
            });
            // Get the play URL
            const playUrl = musicInfo.playUrl ||
                musicInfo.play_url ||
                musicInfo.musicUrl ||
                musicInfo.shareUrl;
            if (!playUrl) {
                console.log("Music info keys:", Object.keys(musicInfo));
                throw new Error("No play URL found in API response");
            }
            console.log("Play URL found, downloading...");
            // Download the audio file
            const audioResponse = await fetch(playUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    Referer: "https://www.tiktok.com/",
                },
            });
            if (!audioResponse.ok) {
                throw new Error(`Failed to download audio: ${audioResponse.status}`);
            }
            const buffer = Buffer.from(await audioResponse.arrayBuffer());
            if (buffer.length === 0) {
                throw new Error("Downloaded audio is empty");
            }
            // Save the file
            const audioPath = (0, path_1.join)(this.tmpDir, `tiktok_music_${timestamp}.mp3`);
            await fs.promises.writeFile(audioPath, buffer);
            const stats = await fs.promises.stat(audioPath);
            console.log(`✅ Music downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
            // Get actual duration using ffprobe
            let duration = musicInfo.duration || 0;
            if (duration === 0) {
                duration = await this.getAudioDuration(audioPath);
            }
            return {
                audioPath,
                info: {
                    id: soundId,
                    description: musicInfo.title || "",
                    author: musicInfo.authorName || "Unknown Artist",
                    duration: duration,
                    musicTitle: musicInfo.title || "TikTok Sound",
                    musicAuthor: musicInfo.authorName || "Unknown Artist",
                    videoUrl: originalUrl,
                    musicUrl: playUrl,
                },
            };
        }
        catch (error) {
            console.error("Direct API download failed:", error.message);
            throw error;
        }
    }
    /**
     * Alternative method to download sound
     */
    async downloadSoundAlternative(soundId, originalUrl, timestamp) {
        console.log("🔄 Trying alternative download method...");
        // Try TikWM API with the music URL
        const tikwmUrl = "https://www.tikwm.com/api/";
        try {
            const response = await fetch(tikwmUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    Accept: "application/json",
                },
                body: new URLSearchParams({
                    url: originalUrl,
                    count: "12",
                    cursor: "0",
                    web: "1",
                    hd: "1",
                }).toString(),
            });
            if (!response.ok) {
                throw new Error(`TikWM API returned ${response.status}`);
            }
            const data = await response.json();
            console.log("TikWM response code:", data.code);
            if (data.code !== 0 || !data.data) {
                throw new Error(`TikWM error: ${data.msg || "Unknown error"}`);
            }
            // Try to get music URL from response
            const musicUrl = data.data.music || data.data.music_url || data.data.music_info?.play;
            if (!musicUrl) {
                console.log("TikWM data keys:", Object.keys(data.data));
                throw new Error("No music URL in TikWM response");
            }
            console.log("Music URL found from TikWM, downloading...");
            const audioResponse = await fetch(musicUrl);
            if (!audioResponse.ok) {
                throw new Error(`Failed to download: ${audioResponse.status}`);
            }
            const buffer = Buffer.from(await audioResponse.arrayBuffer());
            const audioPath = (0, path_1.join)(this.tmpDir, `tiktok_music_${timestamp}.mp3`);
            await fs.promises.writeFile(audioPath, buffer);
            console.log(`✅ Music downloaded: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
            return {
                audioPath,
                info: {
                    id: soundId,
                    description: data.data.title || "",
                    author: data.data.author?.nickname || "",
                    duration: data.data.duration || 0,
                    musicTitle: data.data.music_info?.title || data.data.title || "",
                    musicAuthor: data.data.music_info?.author || data.data.author?.nickname || "",
                    videoUrl: originalUrl,
                    musicUrl: musicUrl,
                },
            };
        }
        catch (error) {
            console.error("Alternative method failed:", error.message);
            throw new Error("All download methods failed for this music URL");
        }
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
exports.TikTokDownloadService = TikTokDownloadService;
//# sourceMappingURL=TikTokDownloadService.js.map