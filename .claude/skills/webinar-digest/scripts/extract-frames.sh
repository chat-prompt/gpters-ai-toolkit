#!/usr/bin/env bash
# Usage: bash extract-frames.sh <WORKDIR>
# Extracts 1 frame per minute from video.mp4, crops top 150px to hide Chrome address bar.
set -e

WORKDIR="${1:-.}"
cd "$WORKDIR"

if [ ! -f video.mp4 ]; then
  echo "❌ video.mp4 not found in $WORKDIR"
  exit 1
fi

# Get original resolution
read W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=\ :p=0 video.mp4)
echo "원본 해상도: ${W}x${H}"

if [ "$H" -lt 720 ]; then
  echo "⚠️ 해상도가 낮습니다 (${H}p). 1080p 재다운로드 권장."
fi

# Crop: remove top 150px to hide Chrome chrome
CROP_H=$((H - 150))
CROP_FILTER="fps=1/60,crop=${W}:${CROP_H}:0:150"

rm -rf screenshots
mkdir -p screenshots

echo "=== 프레임 추출 시작 (1분 단위 + 상단 150px 크롭) ==="
ffmpeg -i video.mp4 -vf "$CROP_FILTER" -q:v 2 screenshots/t_%03d.jpg -y 2>&1 | tail -3

COUNT=$(ls screenshots/ | wc -l | tr -d ' ')
echo "✅ 추출 완료: $COUNT장"
echo "   크기: ${W}x${CROP_H}"
echo "   경로: $WORKDIR/screenshots/"
