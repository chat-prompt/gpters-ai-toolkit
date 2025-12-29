# Dev Docs Pattern

> Context 리셋 시 맥락을 유지하기 위한 3-파일 구조 패턴

## Overview

6개월간의 Claude Code 실전 사용에서 검증된 패턴입니다. 긴 세션 후 context가 리셋되어도 이전 결정사항과 진행 상황을 유지할 수 있습니다.

**원본**: [Claude Code is a Beast - Tips from 6 Months of Hardcore Use](https://dev.to/diet-code103/claude-code-is-a-beast-tips-from-6-months-of-hardcore-use-572n)

## Quick Start

### 1. 디렉토리 구조 생성

```bash
mkdir -p dev/active dev/templates dev/archive
```

### 2. 새 기능 시작

```
/dev-docs [feature-name]
```

이 명령어가 3개 파일을 생성합니다:
- `dev/active/[feature]-plan.md`
- `dev/active/[feature]-context.md`
- `dev/active/[feature]-tasks.md`

### 3. Context 리셋 후 복구

```
dev/active/[feature]-*.md 파일들 읽고 이어서 작업해줘
```

### 4. 세션 종료 전 저장

```
/update-dev-docs [feature-name]
```

## 3-파일 구조

### [feature]-plan.md
전략적 계획 문서

**포함 내용:**
- Executive Summary (1-2문장)
- Goals (Primary / Secondary)
- Approach (기술적 결정사항)
- Phases (단계별 작업)
- Risks & Mitigations
- Success Metrics

**템플릿:** @resources/plan-template.md

### [feature]-context.md
핵심 컨텍스트 문서

**포함 내용:**
- Key Files (핵심 파일 목록)
- Decisions Made (결정사항 + 이유)
- Dependencies (외부/내부)
- Environment (환경변수, DB 변경)
- Code Snippets (참고 코드)
- Session Log (세션별 요약)

**템플릿:** @resources/context-template.md

### [feature]-tasks.md
작업 체크리스트

**포함 내용:**
- Progress Overview (Phase별 진행률)
- Current Phase (진행중/다음 작업)
- Phase별 Completed/Remaining
- Blocked (차단된 작업)
- Validation Checklist

**템플릿:** @resources/tasks-template.md

## Workflow

```
┌─────────────────────────────────────────────────────┐
│  1. 계획 수립                                        │
│     - Planning Mode 사용                            │
│     - /dev-docs [feature] 실행                      │
│     - plan.md 작성 및 승인                          │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  2. 구현                                            │
│     - Phase별 1-2개 작업씩 진행                     │
│     - 결정사항은 즉시 context.md에 기록             │
│     - 완료된 작업은 tasks.md에서 체크               │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  3. Context 리셋 대응                               │
│     - /update-dev-docs 로 상태 저장                 │
│     - 다음 세션: dev docs 읽고 "continue"           │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  4. 완료                                            │
│     - Validation Checklist 확인                     │
│     - dev/archive/로 이동                           │
└─────────────────────────────────────────────────────┘
```

## Best Practices

### DO
- 큰 기능은 Phase별로 나눠서 진행
- 결정사항은 **즉시** context.md에 기록 (이유 포함)
- 세션 종료 전 반드시 /update-dev-docs 실행
- 완료된 작업은 바로 tasks.md에서 체크

### DON'T
- 한 세션에서 너무 많은 작업 시도 (1-2개씩)
- context.md 업데이트 미루기
- plan.md 승인 없이 구현 시작

## Integration with Other Patterns

### Skills Auto-Activation
Dev docs 관련 작업 시 이 skill이 자동 활성화되도록 설정:

```json
// skill-rules.json
{
  "dev-docs-pattern": {
    "keywords": ["dev docs", "context", "plan", "session"],
    "file_patterns": ["dev/active/**/*.md"],
    "intent_patterns": ["(create|update|read).*?(dev docs|plan|context)"]
  }
}
```

### Hooks
세션 종료 시 자동 리마인더 Hook:

```json
// settings.json
{
  "hooks": {
    "Stop": [{
      "type": "command",
      "command": "echo '💡 Remember: /update-dev-docs before ending session'"
    }]
  }
}
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `/dev-docs [name]` | 새 dev docs 3개 파일 생성 |
| `/update-dev-docs [name]` | 현재 상태로 업데이트 |

## Resources

- @resources/plan-template.md - Plan 템플릿
- @resources/context-template.md - Context 템플릿
- @resources/tasks-template.md - Tasks 템플릿

## References

- [Original Reddit Post](https://www.reddit.com/r/ClaudeCode/comments/1oivs81/)
- [DEV Community Article](https://dev.to/diet-code103/claude-code-is-a-beast-tips-from-6-months-of-hardcore-use-572n)
- [GitHub Infrastructure Showcase](https://github.com/diet103/claude-code-infrastructure-showcase)
