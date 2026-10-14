#!/usr/bin/env bash
# Usage: bash setup.sh <YOUTUBE_URL> [WORKDIR]
# Downloads subtitles + 1080p video from YouTube to workdir.
set -e

URL="${1:?YOUTUBE_URL required}"
# Extract video ID from URL
VID=$(echo "$URL" | sed -E 's|.*[?&]v=([^&]+).*|\1|; s|.*youtu\.be/([^?]+).*|\1|')
WORKDIR="${2:-$HOME/Desktop/yt-$VID}"

# Find newest yt-dlp binary (prefer Cellar over symlink)
YTDLP=$(ls /opt/homebrew/Cellar/yt-dlp/*/bin/yt-dlp 2>/dev/null | sort -V | tail -1)
if [ -z "$YTDLP" ]; then
  YTDLP=$(which yt-dlp)
fi
echo "Using yt-dlp: $YTDLP"
echo "Workdir: $WORKDIR"

mkdir -p "$WORKDIR"
cd "$WORKDIR"

# 1. Metadata
echo "=== 영상 메타데이터 ==="
$YTDLP --cookies-from-browser chrome \
  --print "Title: %(title)s|Duration: %(duration_string)s|Uploader: %(uploader)s|Upload: %(upload_date)s" \
  --skip-download "$URL" 2>&1 | grep -v -E "^\[|WARN|Extract" | tail -5

# 2. Subtitles
echo "=== 자막 다운로드 ==="
$YTDLP --cookies-from-browser chrome \
  --write-auto-subs --sub-lang "ko,ko-KR,en" \
  --skip-download --convert-subs srt \
  -o "%(id)s.%(ext)s" "$URL" 2>&1 | tail -5

# 3. 1080p Video (format 137 = 1080p video-only, 140 = m4a audio)
echo "=== 영상 다운로드 (1080p) ==="
if [ ! -f video.mp4 ]; then
  $YTDLP --cookies-from-browser chrome \
    -f "137+140" --merge-output-format mp4 \
    -o "video.%(ext)s" "$URL" 2>&1 | tail -5
fi

# 4. Verify
echo "=== 결과 확인 ==="
ls -lh *.srt video.mp4 2>/dev/null
ffprobe -v error -select_streams v:0 -show_entries stream=width,height video.mp4 2>&1 | grep -E "width|height"

echo ""
echo "✅ 다운로드 완료. 다음 단계: clean-srt.py로 자막 정규화"
echo "   python3 ~/.claude/skills/webinar-digest/scripts/clean-srt.py $WORKDIR/${VID}.ko.srt"
