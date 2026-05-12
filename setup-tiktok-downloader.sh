#!/bin/bash
# setup-tiktok-downloader.sh

echo "🔧 Setting up TikTok downloader..."

# Install yt-dlp (required for reliable TikTok downloads)
if ! command -v yt-dlp &> /dev/null; then
    echo "Installing yt-dlp..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install yt-dlp
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
        sudo chmod a+rx /usr/local/bin/yt-dlp
    fi
fi

# Test TikTok download
echo ""
echo "Testing TikTok download..."
yt-dlp --version

# Install npm packages
echo ""
echo "Installing npm packages..."
npm install @xct007/tiktok-scraper node-fetch

echo ""
echo "✅ TikTok downloader setup complete!"
echo ""
echo "Test with:"
echo "yt-dlp -x --audio-format mp3 'TIKTOK_URL'"