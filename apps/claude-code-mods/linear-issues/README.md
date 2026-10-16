# linear-issues

내게 할당된 미완료 Linear 이슈를 Claude Code 패널에 띄우는 mod. 프로젝트 → 상태 순으로 묶고, 이슈를 누르면 `ABC-123 제목`이 프롬프트에 들어간다.

## 설치

먼저 Linear MCP 가 연결돼 있어야 한다(`claude mcp list` 에 Linear 서버가 보이는지).

터미널 세션 프롬프트에서:

```
/plugin install linear-issues --marketplace chat-prompt/gpters-ai-toolkit
```

셸에서:

```bash
claude plugin install linear-issues --marketplace chat-prompt/gpters-ai-toolkit
```

이미 `gpters-ai-toolkit` 플러그인을 쓰고 있으면 마켓플레이스가 추가돼 있어 `/plugin install linear-issues@chat-prompt-gpters-ai-toolkit` 로도 된다.

데스크톱 앱(`/plugin` 이 안 되는 곳): 프롬프트 옆 + → Plugins → Add marketplace 에 `chat-prompt/gpters-ai-toolkit` → Add plugin.

## 쓰기

- `/linear` — 패널 열기·새로고침
- 한 번 연 뒤로는 세션이 끝날 때까지 정해진 간격으로 다시 불러오고, 세션이 `save_issue` 로 이슈 상태를 바꾸면 바로 갱신한다.

## 개인 설정

설치할 때 나오는 화면이나 `/config` 에서 바꾼다. `~/.claude/settings.json` 에 직접 쓸 때는 `pluginConfigs["linear-issues@chat-prompt-gpters-ai-toolkit"].options`.

| 설정 | 기본값 | 뜻 |
|---|---|---|
| `autoOpenPath` | (비어 있음) | 이 폴더 아래에서 세션을 시작하면 패널을 저절로 연다. 예: `~/Projects/my-team`. `~` 나 절대경로로 쓴다. 비우면 `/linear` 로만 연다. |
| `refreshMinutes` | `5` | 새로고침 간격(분). 최대 1440, 1 미만이면 5 |
| `mcpServer` | `linear` | `claude mcp list` 에 보이는 Linear 서버 이름 그대로. |

## 개발

```bash
claude plugin validate apps/claude-code-mods/linear-issues
claude plugin test apps/claude-code-mods/linear-issues
```

`.claude-plugin/types/`(tsconfig 가 extends 하는 타입)는 엔진이 mod 를 불러올 때 만든다. `claude --plugin-dir apps/claude-code-mods/linear-issues` 로 띄우면 저장할 때마다 다시 불러온다.
