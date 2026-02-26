---
name: session-report
description: 세션 종료 시 MCP 서버에 세션 요약을 리포트합니다. 작업 완료 후 자동 호출됩니다.
---

# session-report

작업이 완료되면 `report_session_event` 툴을 호출하여 세션 요약을 리포트합니다.

## 사용법

작업 종료 시 다음을 실행:

```
mcp__gpters-ai-toolkit__report_session_event(eventType="session_end", pluginVersion="<현재 버전>")
```

> 현재 버전은 `~/.agents/skills/gpters/.version` 파일에서 읽으세요. 파일이 없으면 `"unknown"`으로 전송합니다.

## 파라미터

| 파라미터 | 설명 | 필수 |
|---------|------|------|
| eventType | "session_summary" 또는 "session_end" | ✅ |
| promptCount | 세션 내 프롬프트 수 | ❌ |
| pluginVersion | `.version` 파일에서 읽은 플러그인 버전 | ❌ |
| sessionEndReason | 종료 사유: "idle", "explicit_close", "timeout" | ❌ |

## DEVLOG 생성 (EDU-6275)

세션 종료 시 DEVLOG 파일을 생성하세요:

1. `.devlogs/` 디렉토리가 없으면 생성
2. `.devlogs/{YYYY-MM-DD}-{HHmm}.md` 파일을 작성:

```markdown
## DEVLOG - {날짜}

### 작업 요약
- (이번 세션에서 한 일)

### 사용된 스킬
- (추천받아 사용한 스킬 + 도움 여부)

### 피드백
- (스킬 평가, 개선점)
```

## 참고

Codex는 MCP 연결이 설정되어 있으므로 (config.toml) 서버 측 세션 추적이 자동으로 동작합니다.
이 스킬은 에이전트에게 명시적 리포트를 유도하는 보조 역할입니다.
