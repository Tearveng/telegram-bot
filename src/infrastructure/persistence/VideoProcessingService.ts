// src/services/VideoProcessingService.ts

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { join } from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// Set ffmpeg path with fallback
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
} else {
  // Try to find ffmpeg in system path
  console.warn('ffmpeg-static not found, using system ffmpeg if available');
}

export interface MixOptions {
  originalVolume?: number;
  musicVolume?: number;
  fadeIn?: boolean;
  fadeOut?: boolean;
  fadeDuration?: number;
  addLogo?: boolean;
}

export interface TrimOptions {
  startTime?: number;
  duration?: number;
}

export class VideoProcessingService {
  private tmpDir: string;

  constructor(tmpDir: string) {
    this.tmpDir = tmpDir;
    this.ensureTmpDir();
  }

  private async ensureTmpDir(): Promise<void> {
    try {
      await fs.promises.mkdir(this.tmpDir, { recursive: true });
    } catch (err) {
      console.error('Failed to create temp directory:', err);
      throw err;
    }
  }

  /**
   * Verify ffmpeg is available and working
   */
  async verifyFfmpeg(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpegProcess = spawn('ffmpeg', ['-version']);
      
      ffmpegProcess.on('error', () => {
        console.error('ffmpeg is not installed or not in PATH');
        resolve(false);
      });
      
      ffmpegProcess.on('close', (code) => {
        resolve(code === 0);
      });
      
      // Set timeout
      setTimeout(() => {
        ffmpegProcess.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Mix YouTube audio with video's original audio
   */
  async mixAudio(
    videoPath: string,
    audioPath: string,
    options: MixOptions = {}
  ): Promise<string> {
    // Validate input files exist
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const {
      originalVolume = 0.3,
      musicVolume = 0.7,
      fadeIn = true,
      fadeOut = true,
      fadeDuration = 2,
    } = options;

    const outputPath = join(this.tmpDir, `mixed_${Date.now()}.mp4`);

    console.log('Mixing audio...');
    console.log(`Video: ${videoPath}`);
    console.log(`Audio: ${audioPath}`);
    console.log(`Output: ${outputPath}`);

    return new Promise((resolve, reject) => {
      // First, get video information
      ffmpeg.ffprobe(videoPath, (err, videoMetadata) => {
        if (err) {
          return reject(new Error(`Failed to read video metadata: ${err.message}`));
        }

        ffmpeg.ffprobe(audioPath, (err, audioMetadata) => {
          if (err) {
            return reject(new Error(`Failed to read audio metadata: ${err.message}`));
          }

          console.log('Video duration:', videoMetadata.format.duration);
          console.log('Audio duration:', audioMetadata.format.duration);

          // Build the ffmpeg command
          const command = ffmpeg();

          // Add inputs with error checking
          command
            .input(videoPath)
            .input(audioPath)
            .inputOptions(['-ignore_unknown']) // Ignore unknown stream types
            .complexFilter(this.buildAudioMixFilter(originalVolume, musicVolume, fadeIn, fadeOut, fadeDuration));

          // Add output options
          command
            .outputOptions([
              '-map 0:v',           // Use video from first input
              '-map [audio]',       // Use mixed audio
              '-c:v libx264',       // Encode video
              '-preset fast',       // Balance between speed and compression
              '-crf 23',            // Video quality
              '-c:a aac',           // Audio codec
              '-b:a 192k',          // Audio bitrate
              '-shortest',          // End when shortest input ends
              '-movflags +faststart', // Optimize for streaming
              '-y',                 // Overwrite output
            ])
            .output(outputPath);

          // Log the command being executed
          console.log('FFmpeg command:', command._getArguments().join(' '));

          // Handle progress
          command.on('progress', (progress) => {
            if (progress.percent) {
              console.log(`Processing: ${progress.percent.toFixed(1)}% done`);
            }
          });

          // Handle completion
          command.on('end', () => {
            console.log('Audio mixing completed successfully');
            // Verify output file exists and has size > 0
            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
              resolve(outputPath);
            } else {
              reject(new Error('Output file is empty or not created'));
            }
          });

          // Handle errors with detailed logging
          command.on('error', (err, stdout, stderr) => {
            console.error('FFmpeg error:', err.message);
            console.error('FFmpeg stdout:', stdout);
            console.error('FFmpeg stderr:', stderr);
            
            // Try alternative approach if mixing fails
            this.mixAudioAlternative(videoPath, audioPath, outputPath, options)
              .then(resolve)
              .catch(() => reject(new Error(`Audio mixing failed: ${err.message}\n${stderr}`)));
          });

          // Start processing
          command.run();
        });
      });
    });
  }

  /**
   * Alternative mixing approach using simple overlay
   */
  private async mixAudioAlternative(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    _: MixOptions
  ): Promise<string> {
    console.log('Trying alternative mixing approach...');
    
    const tempOutput = outputPath.replace('.mp4', '_alt.mp4');
    
    return new Promise((resolve, reject) => {
      const command = ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-filter_complex',
          '[0:a]volume=0.3[a1];[1:a]volume=0.7[a2];[a1][a2]amix=inputs=2:duration=first[a]',
          '-map 0:v',
          '-map [a]',
          '-c:v libx264',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
          '-preset fast',
          '-crf 23',
          '-movflags +faststart',
          '-y',
        ])
        .output(tempOutput);

      command.on('end', () => resolve(tempOutput));
      command.on('error', (err) => reject(err));
      command.run();
    });
  }

  /**
   * Replace video audio entirely with new audio
   */
  async replaceAudio(
    videoPath: string,
    audioPath: string,
    trimOptions?: TrimOptions
  ): Promise<string> {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const outputPath = join(this.tmpDir, `replaced_${Date.now()}.mp4`);

    console.log('Replacing audio...');

    return new Promise((resolve, reject) => {
      const command = ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-map 0:v',           // Use video from first input
          '-map 1:a',           // Use audio from second input
          '-c:v libx264',       // Re-encode video
          '-c:a aac',          // Encode audio as AAC
          '-b:a 192k',         // Audio bitrate
          '-shortest',         // Match duration to shortest input
          '-preset fast',      // Encoding speed preset
          '-crf 23',           // Video quality
          '-movflags +faststart',
          '-y',
          ...(trimOptions?.startTime ? ['-ss', trimOptions.startTime.toString()] : []),
          ...(trimOptions?.duration ? ['-t', trimOptions.duration.toString()] : []),
        ])
        .output(outputPath);

      command.on('end', () => {
        console.log('Audio replacement completed');
        resolve(outputPath);
      });

      command.on('error', (err, stdout, stderr) => {
        console.error('Audio replacement error:', err.message);
        console.error('Stdout:', stdout);
        console.error('Stderr:', stderr);
        
        // Try alternative approach
        this.replaceAudioAlternative(videoPath, audioPath, outputPath)
          .then(resolve)
          .catch(() => reject(new Error(`Audio replacement failed: ${err.message}\n${stderr}`)));
      });

      command.run();
    });
  }

  /**
   * Alternative audio replacement using stream copy
   */
  private async replaceAudioAlternative(
    videoPath: string,
    audioPath: string,
    outputPath: string
  ): Promise<string> {
    console.log('Trying alternative audio replacement...');
    
    const tempVideo = join(this.tmpDir, `temp_nosound_${Date.now()}.mp4`);
    
    // First, remove audio from video
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions(['-an', '-c:v copy', '-y'])
        .output(tempVideo)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Then add new audio
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(tempVideo)
        .input(audioPath)
        .outputOptions([
          '-c:v copy',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
          '-movflags +faststart',
          '-y',
        ])
        .output(outputPath)
        .on('end', async () => {
          // Clean up temp file
          await fs.promises.unlink(tempVideo).catch(() => {});
          resolve(outputPath);
        })
        .on('error', async (err) => {
          await fs.promises.unlink(tempVideo).catch(() => {});
          reject(err);
        })
        .run();
    });
  }

  /**
   * Add logo overlay to video
   */
  async addLogoToVideo(
    videoPath: string,
    logoPath: string,
    position: 'bottom-center' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-center'
  ): Promise<string> {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }
    if (!fs.existsSync(logoPath)) {
      throw new Error(`Logo file not found: ${logoPath}`);
    }

    const outputPath = join(this.tmpDir, `logo_${Date.now()}.mp4`);
    const overlayFilter = this.getLogoPositionFilter(position);

    console.log('Adding logo overlay...');

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(logoPath)
        .complexFilter([
          '[1:v]scale=150:-1[logo]',
          `[0:v][logo]${overlayFilter}[output]`
        ])
        .outputOptions([
          '-map [output]',
          '-map 0:a?',
          '-c:v libx264',
          '-c:a copy',
          '-preset fast',
          '-crf 23',
          '-movflags +faststart',
          '-y',
        ])
        .output(outputPath)
        .on('end', () => {
          console.log('Logo addition completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Logo addition error:', err.message);
          reject(new Error(`Logo addition failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Process video with all options
   */
  async processVideo(
    videoPath: string,
    audioPath: string,
    options: MixOptions = {}
  ): Promise<string> {
    let processedPath = videoPath;

    try {
      // Mix audio
      processedPath = await this.mixAudio(processedPath, audioPath, options);

      // Add logo if requested
      if (options.addLogo) {
        const logoPath = join(process.cwd(), 'assets', 'vaam_logo.png');
        if (fs.existsSync(logoPath)) {
          const logoOutputPath = await this.addLogoToVideo(processedPath, logoPath);
          await this.cleanupFiles([processedPath]);
          processedPath = logoOutputPath;
        } else {
          console.warn('Logo file not found, skipping logo addition');
        }
      }

      return processedPath;

    } catch (error) {
      // Clean up on error
      await this.cleanupFiles([processedPath]);
      throw error;
    }
  }

  /**
   * Get video metadata
   */
  async getVideoInfo(filePath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    size: number;
    hasAudio: boolean;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, async (err, metadata) => {
        if (err) return reject(new Error(`Failed to read video info: ${err.message}`));

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        const stats = await fs.promises.stat(filePath);

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          size: stats.size,
          hasAudio: !!audioStream,
        });
      });
    });
  }

  /**
   * Compress video if too large
   */
  async compressVideo(
    inputPath: string,
    maxSizeMB: number = 50
  ): Promise<string> {
    const info = await this.getVideoInfo(inputPath);
    const currentSizeMB = info.size / (1024 * 1024);

    if (currentSizeMB <= maxSizeMB) {
      console.log('Video already within size limits');
      return inputPath;
    }

    console.log(`Compressing video from ${currentSizeMB.toFixed(1)}MB to ${maxSizeMB}MB`);
    const outputPath = join(this.tmpDir, `compressed_${Date.now()}.mp4`);
    const targetBitrate = this.calculateTargetBitrate(info, maxSizeMB);

    return new Promise((resolve) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          `-b:v ${targetBitrate}k`,
          '-c:a aac',
          '-b:a 96k',
          '-preset fast',
          '-crf 28',
          '-movflags +faststart',
          '-y',
        ])
        .output(outputPath)
        .on('end', () => {
          console.log('Video compression completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Compression error:', err.message);
          // Return original if compression fails
          resolve(inputPath);
        })
        .run();
    });
  }

  /**
   * Clean up temporary files
   */
  async cleanupFiles(filePaths: string[]): Promise<void> {
    for (const path of filePaths) {
      if (path) {
        try {
          if (fs.existsSync(path)) {
            await fs.promises.unlink(path);
            console.log(`Cleaned up: ${path}`);
          }
        } catch (error) {
          console.error(`Failed to cleanup ${path}:`, error);
        }
      }
    }
  }

  /**
   * Periodic cleanup of old temporary files
   */
  async periodicCleanup(maxAgeMs: number = 3600000): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.tmpDir);
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = join(this.tmpDir, file);
        try {
          const stats = await fs.promises.stat(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            await fs.promises.unlink(filePath);
            cleanedCount++;
          }
        } catch (error) {
          // Ignore individual file errors
        }
      }

      if (cleanedCount > 0) {
        console.log(`Periodic cleanup: removed ${cleanedCount} files`);
      }
    } catch (error) {
      console.error('Periodic cleanup failed:', error);
    }
  }

  private buildAudioMixFilter(
    originalVolume: number,
    musicVolume: number,
    fadeIn: boolean,
    fadeOut: boolean,
    fadeDuration: number
  ): string {
    const filters: string[] = [
      `[0:a]volume=${originalVolume}[original]`,
    ];

    let musicFilter = `[1:a]volume=${musicVolume}`;
    
    if (fadeIn) {
      musicFilter += `,afade=t=in:ss=0:d=${fadeDuration}`;
    }
    if (fadeOut) {
      musicFilter += `,afade=t=out:st='max(0,longest-${fadeDuration})':d=${fadeDuration}`;
    }
    
    filters.push(`${musicFilter}[music]`);
    filters.push('[original][music]amix=inputs=2:duration=first:dropout_transition=3[audio]');

    return filters.join(';');
  }

  private getLogoPositionFilter(position: string): string {
    const positions: Record<string, string> = {
      'bottom-center': 'overlay=(main_w-overlay_w)/2:main_h-overlay_h-20',
      'top-right': 'overlay=main_w-overlay_w-20:20',
      'top-left': 'overlay=20:20',
      'bottom-right': 'overlay=main_w-overlay_w-20:main_h-overlay_h-20',
      'bottom-left': 'overlay=20:main_h-overlay_h-20',
    };

    return positions[position] || positions['bottom-center'];
  }

  private calculateTargetBitrate(info: any, maxSizeMB: number): number {
    const targetSizeBits = maxSizeMB * 8 * 1024 * 1024;
    const durationSeconds = info.duration;
    // Calculate bitrate with 10% safety margin
    return Math.floor((targetSizeBits / durationSeconds) * 0.9);
  }

  /**
 * Process video with TikTok audio
 */
async processVideoWithTikTok(
  videoPath: string,
  tiktokAudioPath: string,
  options: MixOptions = {}
): Promise<string> {
  console.log('Processing video with TikTok audio...');
  
  // Get audio info first
  const audioDuration = await this.getAudioDuration(tiktokAudioPath);
  const videoInfo = await this.getVideoInfo(videoPath);
  
  console.log(`Video duration: ${videoInfo.duration}s, TikTok audio: ${audioDuration}s`);
  
  // Determine if we should loop or trim the TikTok audio
  if (audioDuration < videoInfo.duration) {
    console.log('TikTok audio is shorter than video - will loop audio');
    return await this.mixAudioWithLoop(videoPath, tiktokAudioPath, videoInfo.duration, options);
  } else {
    console.log('TikTok audio is longer than video - will trim to video length');
    return await this.mixAudio(videoPath, tiktokAudioPath, options);
  }
}

/**
 * Mix audio with looping for shorter tracks
 */
private async mixAudioWithLoop(
  videoPath: string,
  audioPath: string,
  videoDuration: number,
  options: MixOptions
): Promise<string> {
  const {
    originalVolume = 0.3,
    musicVolume = 0.7,
    fadeIn = true,
    fadeOut = true,
    fadeDuration = 2,
  } = options;

  const outputPath = join(this.tmpDir, `tiktok_mixed_${Date.now()}.mp4`);

  return new Promise((resolve, reject) => {
    // Use ffmpeg to loop the audio to match video duration
    const filterComplex = [
      // Loop TikTok audio to match video duration
      `[1:a]aloop=loop=-1:size=2e+09[looped]`,
      // Trim looped audio to video duration
      `[looped]atrim=duration=${videoDuration}[trimmed]`,
      // Add fade in/out
      ...(fadeIn ? [`[trimmed]afade=t=in:d=${fadeDuration}[faded]`] : ['[trimmed]copy[faded]']),
      ...(fadeOut ? [`[faded]afade=t=out:st=${videoDuration - fadeDuration}:d=${fadeDuration}[music]`] : ['[faded]copy[music]']),
      // Reduce original audio volume
      `[0:a]volume=${originalVolume}[original]`,
      // Set music volume
      `[music]volume=${musicVolume}[music_vol]`,
      // Mix both audio tracks
      '[original][music_vol]amix=inputs=2:duration=first[audio]',
    ].join(';');

    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .complexFilter(filterComplex)
      .outputOptions([
        '-map 0:v',
        '-map [audio]',
        '-c:v libx264',
        '-c:a aac',
        '-b:a 192k',
        '-preset fast',
        '-crf 23',
        '-movflags +faststart',
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`Audio mix with loop failed: ${err.message}`)))
      .run();
  });
}

/**
 * Get audio duration
 */
private async getAudioDuration(filePath: string): Promise<number> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * Add TikTok watermark/style effects (optional)
 */
async addTikTokStyleEffect(
  videoPath: string,
  effect: 'vibrant' | 'vintage' | 'glow' | 'none' = 'none'
): Promise<string> {
  if (effect === 'none') return videoPath;

  const outputPath = join(this.tmpDir, `tiktok_effect_${Date.now()}.mp4`);
  
  const effects: Record<string, string[]> = {
    vibrant: ['eq=saturation=1.5:contrast=1.1:brightness=0.05'],
    vintage: ['eq=saturation=0.7:contrast=0.9:brightness=-0.05', 'curves=vintage'],
    glow: ['eq=brightness=0.1', 'gblur=sigma=2', 'blend=all_mode=overlay'],
  };

  const filterEffect = effects[effect] || [];

  return new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input(videoPath)
      .outputOptions([
        '-vf', filterEffect.join(','),
        '-c:a copy',
        '-preset fast',
        '-y',
      ])
      .output(outputPath);

    command.on('end', () => resolve(outputPath));
    command.on('error', (err) => reject(err));
    command.run();
  });
}
}

