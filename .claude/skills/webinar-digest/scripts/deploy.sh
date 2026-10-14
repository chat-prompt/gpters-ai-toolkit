#!/usr/bin/env bash
# Usage: bash deploy.sh <PROJECT_DIR> [ALIAS_NAME]
# Deploys to Vercel production and sets short alias.
set -e

PROJECT_DIR="${1:?PROJECT_DIR required}"
ALIAS_NAME="${2:-$(basename "$PROJECT_DIR")}"

cd "$PROJECT_DIR"

if [ ! -f public/index.html ]; then
  echo "❌ public/index.html not found"
  exit 1
fi

echo "=== Vercel 배포 ==="
OUTPUT=$(vercel --prod --yes 2>&1 | tail -20)
echo "$OUTPUT"

# Parse deployment URL
DEPLOY_URL=$(echo "$OUTPUT" | grep -oE "https://${ALIAS_NAME}-[a-z0-9]+-[a-z0-9-]+\.vercel\.app" | head -1)

if [ -n "$DEPLOY_URL" ]; then
  echo ""
  echo "=== Alias 설정 ==="
  vercel alias set "$DEPLOY_URL" "${ALIAS_NAME}.vercel.app" 2>&1 | tail -3
  echo ""
  echo "✅ 최종 URL: https://${ALIAS_NAME}.vercel.app"
else
  echo "⚠️ Deployment URL 파싱 실패. 수동 확인 필요:"
  echo "   vercel ls --prod"
fi
