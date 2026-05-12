#!/bin/bash
# check-ffmpeg.sh

echo "Checking ffmpeg installation..."

if command -v ffmpeg &> /dev/null; then
    echo "✅ ffmpeg is installed"
    ffmpeg -version | head -n 1
else
    echo "❌ ffmpeg is not installed"
    echo ""
    echo "Installation instructions:"
    echo "Mac: brew install ffmpeg"
    echo "Ubuntu/Debian: sudo apt-get install ffmpeg"
    echo "Windows: Download from https://ffmpeg.org/download.html"
    exit 1
fi

echo ""
echo "Checking for required codecs..."
if ffmpeg -codecs | grep -q "libx264"; then
    echo "✅ libx264 codec available"
else
    echo "❌ libx264 codec not available"
fi

if ffmpeg -codecs | grep -q "aac"; then
    echo "✅ AAC codec available"
else
    echo "❌ AAC codec not available"
fi