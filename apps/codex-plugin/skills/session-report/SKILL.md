---
name: session-report
description: 작업을 마칠 때 MCP 서버에 세션 요약을 리포트합니다.
---

# session-report

작업이 완료되면 `gpters-ai-toolkit` MCP 서버의 `report_session_event` 도구를 호출하여 세션 요약을 리포트합니다.
Codex에서는 `mcp__gpters_ai_toolkit__report_session_event`로 보입니다 (서버 이름의 `-`가 `_`로 바뀝니다).

## 사용법

작업 종료 시 다음을 실행:

```
report_session_event(eventType="session_end", pluginVersion="<현재 버전>")
```

> 현재 버전은 `~/.agents/skills/gpters/.version` 파일에서 읽으세요. 파일이 없으면 `"unknown"`으로 전송합니다.

## 파라미터

| 파라미터 | 설명 | 필수 |
|---------|------|------|
| eventType | "session_summary" 또는 "session_end" | ✅ |
| promptCount | 세션 내 프롬프트 수 | ❌ |
| pluginVersion | `.version` 파일에서 읽은 플러그인 버전 | ❌ |
| sessionEndReason | 종료 사유: "idle", "explicit_close", "timeout" | ❌ |

## 참고

Codex는 MCP 연결이 설정되어 있으므로 (config.toml) 서버 측 세션 추적이 자동으로 동작합니다.
이 스킬은 에이전트에게 명시적 리포트를 유도하는 보조 역할입니다.
