---
name: usage-setup
description: Connect Claude Code weekly-limit collection to the AX dashboard when a user asks to set up, check, or remove aitk usage statusline collection. Keeps an existing statusline untouched and asks before showing the aitk default line.
---

# Usage setup

`aitk usage setup`은 Claude Code가 상태 표시줄 명령에 넘겨주는 공식 JSON에서
주간 한도(`rate_limits.seven_day`)만 캐시하고, 한도를 받으면 백그라운드 작업이
로컬 transcript(`~/.claude/projects`, `~/.codex/sessions`)에서 토큰 수·세션 수·플랜·
모델별 사용량을 집계해 AX 대시보드에 보낸다. 세션 시작 때 하루 한 번 보내던 것과
같은 집계이며, 대화 원문·파일 경로·세션 ID·자격증명은 보내지 않는다.
설정 변경은 `~/.claude/settings.json`의 `statusLine` 한 항목뿐이고
`aitk usage uninstall`로 원래대로 돌아간다.

## 절차

1. `aitk --version`이 0.7.18 이상인지 확인한다. 아니면 먼저
   `npm i -g @gpters/aitk@latest && aitk upgrade`를 안내한다.
2. `aitk usage status`를 실행해 `statusline.kind`를 읽는다. 읽기 전용이다.
   - `user`: 사용자가 만든 표시줄이 있다. 그대로 감싸기만 하므로 표시는 바뀌지 않는다.
   - `none`: 표시줄이 없다. 아래 3번처럼 먼저 물어본다.
   - `aitk`: 이미 연결돼 있다. `display`와 `snapshot`을 보여주고 끝낸다. `snapshot`이
     계속 null이면 node/aitk 경로가 바뀐 것일 수 있다. `aitk usage setup`을 한 번 더
     실행하면 저장된 명령 경로가 현재 설치본으로 갱신된다.
   - 사용자가 해제를 원하면 `aitk usage uninstall`을 안내한다. 원래 표시줄 설정과
     캐시가 함께 원복·삭제된다.
   - `unsupported`: `statusLine`이 command 형식이 아니다. 설정을 건드리지 말고 사용자에게 알린다.
3. `none`이면 AskUserQuestion으로 하나를 고르게 한다.
   - "aitk 기본 표시줄 보기": 모델 · 컨텍스트 사용률 · 5시간/주간 한도 한 줄 (권장)
   - "표시 없이 수집만": 화면에는 아무것도 안 그리고 주간 한도만 수집
   - "지금은 안 함"
4. 사용자가 고른 뒤에만 실행한다. 스킬은 비대화형이므로 `--display`를 반드시 넘긴다.
   - 기존 표시줄 있음: `aitk usage setup`
   - 기본 표시줄: `aitk usage setup --display default`
   - 수집만: `aitk usage setup --display none`
5. Claude Code를 재시작해야 적용된다고 알린다. 첫 응답 뒤 `aitk usage status`의
   `snapshot`에 `usedPercent`가 보이면 연결된 것이다.

## 경계

- 사용자 승인 전에 `setup`이나 `uninstall`을 실행하지 않는다.
- 설정 파일을 직접 편집하지 않는다. `aitk usage setup`/`uninstall`만 쓴다.
- `AITK_USAGE_REPORT=0`이면 수집과 자동 보고를 하지 않는다는 점을 알려준다.
- 상태 출력의 `snapshot`·`report` 외 값을 옮겨 적지 않는다.
