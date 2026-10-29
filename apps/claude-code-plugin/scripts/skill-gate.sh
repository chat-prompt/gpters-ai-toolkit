#!/bin/bash
# 메시지마다 첫 도구 사용 전에 한 번 막는다.
# 새 세션·/clear·30분 넘게 쉰 뒤 첫 메시지: 팀 스킬 검색을 해야 통과 (mode=search)
# 그 밖의 메시지: 검색하거나 같은 작업이라고 답해야 통과 (mode=judge). "계속", "커밋해" 같은 뻔한 후속은 막지 않는다.
# 쪽지(skill-search.sh)만으로는 Claude가 검색을 자주 건너뛰어서 넣었다 (DEV-4700).
# SessionStart(clear)는 /clear 뒤 첫 메시지를 새 세션처럼 다룬다. AITK_SKILL_GATE=0 이면 끈다.
# ponytail: 세션마다 작은 파일 세 개가 임시 폴더에 쌓인다. OS가 임시 폴더를 비울 때 같이 지워진다.
[ "${AITK_SKILL_GATE:-1}" = "0" ] && exit 0
# 쪽지를 끈 세션(인터뷰 등, DEV-4377)과 에이전트 머신(session-report와 같은 기준)에서는 막지 않는다
[ "${AITK_SKILL_HINT:-1}" = "0" ] && exit 0
[ -f "$HOME/.config/aitk/agent.json" ] && exit 0
command -v aitk >/dev/null 2>&1 || exit 0
input=$(cat)
sid=$(printf '%s' "$input" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
[ -n "$sid" ] || exit 0
dir="${TMPDIR:-/tmp}/aitk-skill-gate"
mkdir -p "$dir" 2>/dev/null || exit 0
done_flag="$dir/$sid.done"; last="$dir/$sid.last"; mode="$dir/$sid.mode"
event() { printf '%s' "$input" | grep -q "\"hook_event_name\"[[:space:]]*:[[:space:]]*\"$1\""; }
# jq가 있으면 필드를 정확히 읽는다(따옴표·줄바꿈이 든 프롬프트, 검색 명령이 다른 도구 입력에 섞인 경우). 없으면 문자열 검색으로 대신한다
has_jq() { command -v jq >/dev/null 2>&1; }
field() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null | tr '\n' ' '; }

if event SessionStart; then rm -f "$done_flag" "$last"; exit 0; fi
if event UserPromptSubmit; then
  rm -f "$done_flag"
  if [ ! -f "$last" ] || [ -n "$(find "$last" -mmin +30 2>/dev/null)" ]; then echo search > "$mode"
  else
    echo judge > "$mode"
    # 뻔한 후속 메시지는 막지 않는다 (OpenCode skill-suggest의 SKIP_PATTERNS와 같은 목록)
    if has_jq; then prompt=$(field .prompt | sed 's/ *$//')
    else prompt=$(printf '%s' "$input" | sed -n 's/.*"prompt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1); fi
    # 5자 미만("그래", "ㅇㅋ")만 길이로 거른다. 10자로 두면 "PR 설명 써줘" 같은 짧은 새 요청이 빠졌다(10/29 실험)
    # 글자 수는 UTF-8 이어지는 바이트를 빼고 센다. ${#prompt}는 로케일이 C면 한글을 바이트로 센다
    len=$(printf '%s' "$prompt" | LC_ALL=C tr -d '\200-\277' | wc -c | tr -d ' ')
    # 짧은 답(네, ok, n)은 메시지 전체가 그 말일 때만 거른다. 앞부분만 맞추면 "next.js 대시보드", "네이버 뉴스"까지 걸렸다
    if [ "$len" -lt 5 ] || printf '%s' "$prompt" | grep -qiE '^(네|응|ㅇㅇ|ㅇ|ok|yes|y|no|n|확인|다시|계속|푸시|커밋)[[:space:][:punct:]]*$|^(해줘|해봐|알려줘|보여줘|실행|해)$|^(git |npm |pnpm |yarn )|계속해|계속 진행|다시 해|확인해|푸시해|커밋해|머지해|배포해|실행해|빌드해|^(좋아|감사|고마워|ㄱㄱ|ㄱ|ㅊㅊ|잘됐)'; then : > "$done_flag"; fi
  fi
  touch "$last"; exit 0
fi

[ -f "$done_flag" ] && exit 0
if has_jq; then
  # 검색은 MCP 검색·불러오기 도구이거나 Bash 명령 안의 aitk search/get 일 때만 인정한다. 파일 내용에 적힌 문자열은 치지 않는다
  tool=$(field .tool_name); cmd=$(field .tool_input.command)
  case "$tool" in *semantic_search*|*get_plugin_content*) : > "$done_flag"; exit 0;; esac
  if printf '%s' "$cmd" | grep -qE 'aitk (search|get)'; then : > "$done_flag"; exit 0; fi
  if [ "$(cat "$mode" 2>/dev/null)" = judge ] && printf '%s' "$cmd" | grep -q 'aitk:same-task'; then : > "$done_flag"; exit 0; fi
else
  if printf '%s' "$input" | grep -qE 'aitk (search|get)|semantic_search|get_plugin_content'; then : > "$done_flag"; exit 0; fi
  if [ "$(cat "$mode" 2>/dev/null)" = judge ] && printf '%s' "$input" | grep -q 'aitk:same-task'; then : > "$done_flag"; exit 0; fi
fi

if [ "$(cat "$mode" 2>/dev/null)" = judge ]; then
cat >&2 <<'MSG'
도구를 쓰기 전에 이번 요청이 바로 앞 작업과 같은 작업인지 판단하세요.
- 새 작업(다른 결과물·다른 주제)이면 팀 스킬을 검색: Bash("aitk search '하려는 일 + 재료·대상' --limit 5 --context '작업 맥락(비우지 않음)'"), 0.40 이상이고 맞으면 Bash("aitk get '스킬ID'")
- 같은 작업의 후속(확인, 수정, 계속)이면: Bash("echo aitk:same-task")
그다음 원래 하려던 일을 하세요.
MSG
else
cat >&2 <<'MSG'
이 작업에 맞는 팀 스킬이 있는지 먼저 확인하세요. 하려는 일과 재료·대상을 검색어로 씁니다.
Bash("aitk search '하려는 일 + 재료·대상 (예: 회의록으로 주간 보고서 쓰기)' --limit 5 --context '작업 맥락(비우지 않음)'")
0.40 이상이고 내용이 맞으면 Bash("aitk get '스킬ID'")로 불러와 따르고, 없으면 Bash("aitk report-skip --query '검색어' --reason '사유'") 후 원래 작업을 이어가세요.
MSG
fi
exit 2
