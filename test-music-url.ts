// test-music-url.ts

import { TikTokDownloadService } from './src/infrastructure/persistence/TikTokDownloadService';
import { config } from './src/config/config';
import { join } from 'path';
import * as fs from 'fs';  // 👈 ADD THIS IMPORT

const TMP_DIR = join(process.cwd(), 'tmp');

async function testMusicUrl() {
  console.log('🧪 Testing TikTok Music URL Download\n');
  console.log('=' .repeat(50));
  
  const service = new TikTokDownloadService(config, TMP_DIR);
  
  // Test the music URL
  const musicUrl = 'https://www.tiktok.com/@jadyamt/video/7633451139630943509?is_from_webapp=1&sender_device=pc';
  
  console.log('\n🎵 Testing Music URL:');
  console.log(musicUrl);
  console.log('\n⏳ Processing...\n');
  
  try {
    const startTime = Date.now();
    const result = await service.downloadAudio(musicUrl);
    const endTime = Date.now();
    
    console.log('\n✅ SUCCESS!');
    console.log(`⏱️  Time taken: ${((endTime - startTime) / 1000).toFixed(1)}s`);
    console.log(`📁 File: ${result.audioPath}`);
    console.log(`📊 Size: ${(fs.statSync(result.audioPath).size / 1024).toFixed(1)}KB`);
    console.log(`\n📋 Audio Info:`);
    console.log(`   Title: ${result.info.musicTitle}`);
    console.log(`   Author: ${result.info.author}`);
    console.log(`   Duration: ${result.info.duration}s`);
    console.log(`   ID: ${result.info.id}`);
    
    // Verify the audio is playable
    const actualDuration = await service.getAudioDuration(result.audioPath);
    console.log(`   Actual Duration: ${actualDuration}s`);
    
    // Clean up
    await service.cleanupFiles([result.audioPath]);
    console.log('\n🧹 Cleaned up test file');
    
  } catch (error: any) {
    console.error('\n❌ FAILED:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Check if the TikTok music is available in your region');
    console.error('   2. Try running: yt-dlp --update');
    console.error('   3. Make sure the URL is correct and accessible');
    console.error('   4. Try with a different TikTok music URL');
  }
}

// Run the test
testMusicUrl().catch(console.error);