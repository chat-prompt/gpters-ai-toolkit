# claude-code-infrastructure

6개월간의 실전 사용에서 검증된 Claude Code 인프라 패턴

## Type

Skill + Commands + Hooks

## Author

GPTers

## Tags

`infrastructure`, `dev-docs`, `hooks`, `skill-activation`, `context`, `workflow`, `productivity`

## Overview

이 플러그인은 [Claude Code is a Beast - Tips from 6 Months of Hardcore Use](https://dev.to/diet-code103/claude-code-is-a-beast-tips-from-6-months-of-hardcore-use-572n) 글에서 소개된 핵심 패턴을 제공합니다.

**핵심 문제 해결:**
- Context 리셋 시 맥락 손실 → **Dev Docs 패턴**
- Skills 자동 활성화 안 됨 → **Auto-Activation 가이드**
- 빌드 에러 놓침 → **Hooks 가이드**

## Features

### Dev Docs Pattern (3-파일 구조)

긴 세션 후 context가 리셋되어도 이전 결정사항과 진행 상황을 유지:

```
dev/active/
├── [feature]-plan.md      # 전략적 계획
├── [feature]-context.md   # 핵심 결정사항
└── [feature]-tasks.md     # 작업 체크리스트
```

### Slash Commands

| Command | Description |
|---------|-------------|
| `/dev-docs [name]` | 새 dev docs 3개 파일 생성 |
| `/update-dev-docs [name]` | 현재 상태로 업데이트 |

### Skills Auto-Activation

skill-rules.json + UserPromptSubmit Hook으로 관련 skill 자동 제안:

```
User: "backend API에 새 라우트 추가해줘"
      ↓
Hook: 💡 Relevant skill: backend-dev-guidelines
      ↓
Claude: skill 로드 후 가이드라인 적용
```

### Hooks

| Hook | Event | Description |
|------|-------|-------------|
| `skill-activation-prompt` | UserPromptSubmit | 관련 skill 자동 제안 |
| `build-check` | Stop | 응답 후 빌드/린트 자동 체크 |
| `dev-docs-reminder` | Stop | dev docs 업데이트 리마인더 |

## Installation

### Via GPTers Marketplace

```bash
# MCP 서버 연결 후
/mcp__gpters-marketplace__get_plugin_content claude-code-infrastructure
```

### Manual Installation

1. 디렉토리 생성:
```bash
mkdir -p dev/active dev/templates dev/archive
mkdir -p .claude/skills
mkdir -p ~/.claude/hooks
```

2. 템플릿 복사 (skills/dev-docs-pattern/resources/ 참조)

3. skill-rules.json 복사:
```bash
cp skills/skill-activation/resources/skill-rules-example.json .claude/skills/skill-rules.json
```

4. Hook 스크립트 복사:
```bash
cp hooks/*.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/*.sh
```

5. Hooks 설정 (~/.claude/settings.json):
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "~/.claude/hooks/skill-activation-prompt.sh",
        "timeout": 5000,
        "blocking": true
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "~/.claude/hooks/build-check.sh",
        "timeout": 60000,
        "blocking": false
      }
    ]
  }
}
```

6. (macOS) jq 설치 (skill-activation에 필요):
```bash
brew install jq
```

## Quick Start

### 1. 새 기능 시작

```
/dev-docs user-auth
```

### 2. 계획 작성

`dev/active/user-auth-plan.md` 편집

### 3. 구현 진행

Phase별로 1-2개 작업씩 진행

### 4. Context 리셋 대응

```
dev/active/user-auth-*.md 읽고 이어서 작업해줘
```

### 5. 세션 종료 전

```
/update-dev-docs user-auth
```

## Workflow

```
/dev-docs → 계획 작성 → 승인 → 구현 → /update-dev-docs → (리셋) → 복구 → 반복
```

## Best Practices

### DO
- 결정사항은 **즉시** context.md에 기록
- 세션 종료 전 반드시 `/update-dev-docs` 실행
- 큰 기능은 Phase별로 나눠서 진행

### DON'T
- 한 세션에서 너무 많은 작업 시도
- context.md 업데이트 미루기
- plan.md 승인 없이 구현 시작

## Included Patterns

이 플러그인에 포함된 패턴:

- **Dev Docs Pattern**: 3-파일 구조로 context 보존
- **Skills Auto-Activation**: skill-rules.json + UserPromptSubmit Hook
- **Build Check Hook**: Stop Hook으로 자동 빌드 체크
- **Dev Docs Reminder**: 세션 종료 전 리마인더
- **Hooks Guide**: 커스텀 Hook 작성 가이드

## Related Patterns

추가 패턴 (별도 구현 필요):

- **Agents**: 특화된 서브에이전트 (code-reviewer, plan-reviewer 등)
- **File Tracker Hook**: PostToolUse로 수정된 파일 추적

전체 인프라 참고: [GitHub Infrastructure Showcase](https://github.com/diet103/claude-code-infrastructure-showcase)

## References

- [Original DEV.to Article](https://dev.to/diet-code103/claude-code-is-a-beast-tips-from-6-months-of-hardcore-use-572n)
- [GitHub Infrastructure Showcase](https://github.com/diet103/claude-code-infrastructure-showcase)
- [Anthropic Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)

---

*Part of [GPTers AI Toolkit](https://github.com/chat-prompt/gpters-ai-toolkit)*
