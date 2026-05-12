// test-both-tiktok-urls.ts

import { TikTokDownloadService } from './src/infrastructure/persistence/TikTokDownloadService';
import { config } from './src/config/config';
import { join } from 'path';

const TMP_DIR = join(process.cwd(), "tmp");

async function testBothUrls() {
  const service = new TikTokDownloadService(config, TMP_DIR);
  
  // Test 1: Regular video URL
  const videoUrl = 'https://www.tiktok.com/@tiktok/video/6807491984882765062';
  console.log('📹 Testing VIDEO URL:', videoUrl);
  
  try {
    const result1 = await service.downloadAudio(videoUrl);
    console.log('✅ Video URL download successful!');
    console.log(`   Music: ${result1.info.musicTitle}`);
    console.log(`   Duration: ${result1.info.duration}s\n`);
    await service.cleanupFiles([result1.audioPath]);
  } catch (error: any) {
    console.log('❌ Video URL failed:', error.message, '\n');
  }
  
  // Test 2: Music/Sound URL
  const musicUrl = 'https://www.tiktok.com/music/WAY-YOU-ARE-Hook-7630710284696897553';
  console.log('🎵 Testing MUSIC URL:', musicUrl);
  
  try {
    const result2 = await service.downloadAudio(musicUrl);
    console.log('✅ Music URL download successful!');
    console.log(`   Music: ${result2.info.musicTitle}`);
    console.log(`   Author: ${result2.info.author}`);
    console.log(`   Duration: ${result2.info.duration}s\n`);
    await service.cleanupFiles([result2.audioPath]);
  } catch (error: any) {
    console.log('❌ Music URL failed:', error.message);
    console.log('\n💡 Tips for music URLs:');
    console.log('   1. Some music URLs require authentication');
    console.log('   2. Try using the original sound from a specific video instead');
    console.log('   3. yt-dlp might handle it if updated to latest version');
  }
}

testBothUrls();