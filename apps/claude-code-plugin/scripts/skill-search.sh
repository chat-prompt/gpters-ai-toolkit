#!/bin/bash
# UserPromptSubmit hook: 매 프롬프트마다 경량 힌트를 주입합니다.
# 실제 검색 여부는 Claude가 대화 맥락을 보고 판단합니다.

# 프롬프트 카운터 증가 (세션 리포트용)
# PPID = Claude Code 프로세스 PID (셸 스크립트는 매번 새 PID이므로 $$ 사용 불가)
COUNTER_FILE="/tmp/gpters-session-${PPID}"
COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
echo $((COUNT + 1)) > "$COUNTER_FILE"

# 플러그인 자동 업데이트 (하루 1회, 백그라운드)
UPDATE_CACHE="/tmp/gpters-plugin-update-check"
LAST_CHECK=$(cat "$UPDATE_CACHE" 2>/dev/null || echo "0")
NOW=$(date +%s)
INTERVAL=86400  # 24시간

if [ $((NOW - LAST_CHECK)) -gt $INTERVAL ]; then
  echo "$NOW" > "$UPDATE_CACHE"
  (
    PLUGIN_NAME="gpters-ai-toolkit"
    MP_DIR="$HOME/.claude/plugins/marketplaces/chat-prompt-gpters-ai-toolkit"
    CACHE_DIR="$HOME/.claude/plugins/cache/gpters-marketplace/$PLUGIN_NAME"
    INSTALLED_JSON="$HOME/.claude/plugins/installed_plugins.json"
    SOURCE_DIR="$MP_DIR/apps/claude-code-plugin"

    # 1. 마켓플레이스 레포 pull
    [ -d "$MP_DIR/.git" ] && git -C "$MP_DIR" pull --ff-only --quiet 2>/dev/null

    # 2. 원격 버전 vs 로컬 설치 버전 비교
    REMOTE_VER=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$SOURCE_DIR/.claude-plugin/plugin.json" 2>/dev/null | head -1 | grep -o '[0-9][0-9.]*')
    LOCAL_VER=$(python3 -c "
import json
data = json.load(open('$INSTALLED_JSON'))
for k, v in data.get('plugins', {}).items():
    if '$PLUGIN_NAME' in k:
        for i in v: print(i.get('version', ''))
" 2>/dev/null | head -1)

    if [ -n "$REMOTE_VER" ] && [ "$REMOTE_VER" != "$LOCAL_VER" ]; then
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
    fi
  ) &
fi

cat <<'CONTEXT'
<team-skills>새 작업/주제 변경 시 팀 스킬을 검색하세요. 기존 대화의 후속이면 무시하세요.
검색: mcp__gpters-ai-toolkit__semantic_search(query="핵심 키워드 2~4단어", userContext="작업 맥락(있으면)", limit=3, _source="skill-suggest")
규칙: relevanceScore 0.60 이상만 get_plugin_content로 로드. 미만이면 무시하고 진행.</team-skills>
CONTEXT
