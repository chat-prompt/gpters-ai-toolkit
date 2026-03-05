#!/bin/bash
# SessionStart hook: 세션 시작 시 플러그인 자동 업데이트 체크

PLUGIN_NAME="gpters-ai-toolkit"
MP_DIR="$HOME/.claude/plugins/marketplaces/gpters-marketplace"
CACHE_DIR="$HOME/.claude/plugins/cache/gpters-marketplace/$PLUGIN_NAME"
INSTALLED_JSON="$HOME/.claude/plugins/installed_plugins.json"
SOURCE_DIR="$MP_DIR/apps/claude-code-plugin"

# 마켓플레이스 레포가 없으면 종료
[ -d "$MP_DIR/.git" ] || exit 0

# 1. 마켓플레이스 레포 pull
git -C "$MP_DIR" pull --ff-only --quiet 2>/dev/null || exit 0

# 2. 원격 버전 vs 로컬 설치 버전 비교
REMOTE_VER=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$SOURCE_DIR/.claude-plugin/plugin.json" 2>/dev/null | head -1 | grep -o '[0-9][0-9.]*')
LOCAL_VER=$(python3 -c "
import json
data = json.load(open('$INSTALLED_JSON'))
for k, v in data.get('plugins', {}).items():
    if '$PLUGIN_NAME' in k:
        for i in v: print(i.get('version', ''))
" 2>/dev/null | head -1)

[ -z "$REMOTE_VER" ] || [ "$REMOTE_VER" = "$LOCAL_VER" ] && exit 0

# 3. 새 버전 캐시에 복사
NEW_CACHE="$CACHE_DIR/$REMOTE_VER"
mkdir -p "$NEW_CACHE"
cp -R "$SOURCE_DIR/." "$NEW_CACHE/" 2>/dev/null

# 4. installed_plugins.json 업데이트
python3 -c "
import json, datetime
path = '$INSTALLED_JSON'
data = json.load(open(path))
for k, v in data.get('plugins', {}).items():
    if '$PLUGIN_NAME' in k:
        for i in v:
            i['version'] = '$REMOTE_VER'
            i['installPath'] = '$NEW_CACHE'
            i['lastUpdated'] = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z')
json.dump(data, open(path, 'w'), indent=4)
" 2>/dev/null
