const { exec } = require('child_process');
const fs = require('fs');

async function testYoutubeDownload() {
  const url = 'https://youtu.be/dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up
  
  console.log('Testing YouTube download methods...\n');
  
  // Test 1: yt-dlp
  console.log('1️⃣ Testing yt-dlp...');
  try {
    await execPromise(`yt-dlp -x --audio-format mp3 --audio-quality 0 -o "test_audio.%(ext)s" "${url}" --force-overwrites`);
    console.log('✅ yt-dlp works!\n');
  } catch (error) {
    console.log('❌ yt-dlp failed:', error.message, '\n');
  }
  
  // Test 2: ytdl-core
  console.log('2️⃣ Testing @distube/ytdl-core...');
  try {
    const ytdl = require('@distube/ytdl-core').default;
    const info = await ytdl.getInfo(url);
    console.log('✅ ytdl-core works!');
    console.log('Video title:', info.videoDetails.title);
    console.log('Available formats:', info.formats.length, '\n');
  } catch (error) {
    console.log('❌ ytdl-core failed:', error.message, '\n');
  }
  
  // Cleanup
  try {
    const files = fs.readdirSync('.');
    files.forEach(file => {
      if (file.startsWith('test_audio') || file.startsWith('youtube_')) {
        fs.unlinkSync(file);
        console.log('Cleaned up:', file);
      }
    });
  } catch {}
}

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

testYoutubeDownload();