"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
// src/config/config.ts
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    BOT_ADMIN_CHAT_ID: process.env.BOT_ADMIN_CHAT_ID,
    // Video processing limits
    MAX_VIDEO_SIZE_MB: 50,
    MAX_YOUTUBE_DURATION_SECONDS: 600, // 10 minutes
    MAX_CONCURRENT_PROCESSING: 2,
    VIDEO_PROCESSING_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
    // Audio mix defaults
    DEFAULT_ORIGINAL_VOLUME: 0.3, // 30%
    DEFAULT_MUSIC_VOLUME: 0.7, // 70%
    // Cleanup
    TEMP_FILE_MAX_AGE_MS: 60 * 60 * 1000, // 1 hour
    // YouTube
    YOUTUBE_REQUEST_TIMEOUT_MS: 30000, // 30 seconds
    MAX_RETRIES: 3,
};
//# sourceMappingURL=config.js.map