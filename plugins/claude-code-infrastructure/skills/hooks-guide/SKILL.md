# Claude Code Hooks Guide

> Claude Code의 Hooks 시스템을 활용한 자동화 패턴

## Overview

Hooks는 Claude Code의 특정 이벤트에서 자동으로 실행되는 스크립트입니다. 빌드 체크, 파일 추적, 리마인더 등을 자동화할 수 있습니다.

## Hook Types

| Hook | 실행 시점 | 주요 용도 |
|------|----------|----------|
| `UserPromptSubmit` | 사용자 입력 전 | Skill 자동 활성화, 입력 검증 |
| `PostToolUse` | 도구 사용 후 | 파일 수정 추적, 로깅 |
| `Stop` | Claude 응답 완료 후 | 빌드 체크, 리마인더 |
| `PreCompact` | 컨텍스트 압축 전 | 백업, 상태 저장 |

## Installation

### 1. settings.json 위치

```bash
# macOS/Linux
~/.claude/settings.json

# Windows
%USERPROFILE%\.claude\settings.json
```

### 2. Hook 등록

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "/path/to/build-check.sh",
        "timeout": 60000,
        "blocking": false
      }
    ]
  }
}
```

## Provided Hooks

### Build Check Hook

응답 완료 후 빌드와 린트를 자동으로 체크합니다.

**설치:**
```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "echo '🔍 Build Check...' && (pnpm build 2>&1 | tail -15) || true",
        "timeout": 60000,
        "blocking": false
      }
    ]
  }
}
```

**또는 스크립트 사용:**
```json
{
  "hooks": {
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

**기능:**
- 패키지 매니저 자동 감지 (pnpm/yarn/npm)
- 빌드 에러 출력 (마지막 20줄)
- 린트 이슈 출력 (마지막 10줄)
- TypeScript 타입 체크 (tsconfig.json 있을 때)

### Dev Docs Reminder Hook

dev/active에 작업 중인 파일이 있으면 /update-dev-docs 리마인더를 표시합니다.

**설치:**
```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "if [ -d 'dev/active' ] && [ \"$(ls -A dev/active 2>/dev/null)\" ]; then echo '💡 Reminder: /update-dev-docs'; fi",
        "timeout": 5000,
        "blocking": false
      }
    ]
  }
}
```

## Creating Custom Hooks

### Hook Configuration

```json
{
  "type": "command",        // command 또는 url
  "command": "...",         // 실행할 명령어
  "timeout": 30000,         // 타임아웃 (ms)
  "blocking": false         // true: 완료까지 대기
}
```

### Available Variables

| Variable | Description |
|----------|-------------|
| `$prompt` | 사용자 입력 (UserPromptSubmit) |
| `$tool_name` | 도구 이름 (PostToolUse) |
| `$tool_input` | 도구 입력 (PostToolUse) |
| `$session_id` | 세션 ID |
| `$transcript_path` | 트랜스크립트 경로 |

### Example: File Tracker Hook

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "if [ \"$tool_name\" = \"Edit\" ] || [ \"$tool_name\" = \"Write\" ]; then echo \"$tool_input\" | jq -r '.file_path' >> ~/.claude/edited-files.log; fi",
        "timeout": 5000,
        "blocking": false
      }
    ]
  }
}
```

## Best Practices

### DO
- `blocking: false` 사용 (빠른 응답)
- 타임아웃 적절히 설정
- `|| true` 로 에러 무시 (필요시)
- 출력 제한 (`tail`, `head`)

### DON'T
- 긴 작업에 `blocking: true` 사용
- 무한 루프 가능한 명령어
- 민감한 정보 로깅
- 너무 많은 hook 등록

## Combining Multiple Hooks

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "~/.claude/hooks/build-check.sh",
        "timeout": 60000,
        "blocking": false
      },
      {
        "type": "command",
        "command": "~/.claude/hooks/dev-docs-reminder.sh",
        "timeout": 5000,
        "blocking": false
      }
    ]
  }
}
```

## Troubleshooting

### Hook이 실행되지 않음
1. settings.json 경로 확인
2. 스크립트 실행 권한 확인 (`chmod +x`)
3. 경로가 절대 경로인지 확인

### Hook이 너무 오래 걸림
1. `blocking: false` 설정
2. 타임아웃 조정
3. 출력 제한 (`| tail -n`)

### Hook 출력이 보이지 않음
1. `echo` 로 명시적 출력
2. stderr도 캡처 (`2>&1`)

## References

- [Claude Code Hooks Documentation](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [GitHub Infrastructure Showcase](https://github.com/diet103/claude-code-infrastructure-showcase)
