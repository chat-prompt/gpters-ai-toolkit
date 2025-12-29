# Skills Auto-Activation

> Skills를 자동으로 활성화하는 패턴 - "게임 체인저"

## Problem

기존 Skills의 문제점:
- 수천 줄의 베스트 프랙티스를 작성해도 Claude가 자동으로 사용하지 않음
- 매번 수동으로 skill을 참조하거나 요청해야 함
- 관련 작업을 할 때 skill의 존재를 잊어버림

## Solution

**skill-rules.json + UserPromptSubmit Hook** 조합으로 해결

1. `skill-rules.json`에 각 skill의 활성화 규칙 정의
2. `UserPromptSubmit` Hook이 사용자 입력을 분석
3. 패턴 매칭 후 관련 skill 자동 제안
4. Claude가 skill을 먼저 로드하고 작업 시작

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  User Input                                         │
│  "backend API에 새 라우트 추가해줘"                   │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  UserPromptSubmit Hook                              │
│  - skill-rules.json 로드                            │
│  - 키워드/패턴 매칭                                  │
│  - 관련 skill 식별                                  │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  Hook Response                                      │
│  "💡 Relevant skills: backend-dev-guidelines"       │
│  "Consider loading this skill first."              │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  Claude loads skill → applies guidelines → works   │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### 1. skill-rules.json 생성

```bash
mkdir -p .claude/skills
```

```json
// .claude/skills/skill-rules.json
{
  "backend-dev-guidelines": {
    "keywords": ["backend", "api", "route", "controller", "database"],
    "file_patterns": ["app/api/**/*.ts", "lib/**/*.ts"],
    "intent_patterns": ["(create|add|implement).*?(route|endpoint|api)"]
  },
  "frontend-dev-guidelines": {
    "keywords": ["component", "ui", "react", "frontend", "css"],
    "file_patterns": ["components/**/*.tsx", "app/**/*.tsx"],
    "intent_patterns": ["(create|build).*?(component|page|ui)"]
  }
}
```

### 2. Hook 스크립트 설치

```bash
cp skill-activation-prompt.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/skill-activation-prompt.sh
```

### 3. settings.json 설정

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
    ]
  }
}
```

## skill-rules.json 상세

### 구조

```json
{
  "skill-name": {
    "keywords": [],
    "file_patterns": [],
    "intent_patterns": [],
    "content_triggers": [],
    "priority": 1
  }
}
```

### 필드 설명

| 필드 | 설명 | 예시 |
|------|------|------|
| `keywords` | 단순 키워드 매칭 | `["backend", "api"]` |
| `file_patterns` | 파일 경로 glob 패턴 | `["app/api/**/*.ts"]` |
| `intent_patterns` | 의도 분석 정규식 | `["(create\|add).*?route"]` |
| `content_triggers` | 코드 내용 패턴 | `["router.", "prisma."]` |
| `priority` | 우선순위 (낮을수록 높음) | `1` |

### 예시: 전체 skill-rules.json

```json
{
  "backend-dev-guidelines": {
    "keywords": [
      "backend", "api", "route", "controller",
      "database", "prisma", "drizzle", "sql"
    ],
    "file_patterns": [
      "app/api/**/*.ts",
      "lib/db/**/*.ts",
      "controllers/**/*.ts"
    ],
    "intent_patterns": [
      "(create|add|implement|fix).*?(route|endpoint|api|controller)",
      "(database|db|query|migration)"
    ],
    "content_triggers": [
      "router\\.",
      "prisma\\.",
      "db\\.",
      "export.*Controller"
    ],
    "priority": 1
  },
  "frontend-dev-guidelines": {
    "keywords": [
      "component", "ui", "react", "frontend",
      "css", "tailwind", "responsive", "accessibility"
    ],
    "file_patterns": [
      "components/**/*.tsx",
      "app/**/page.tsx",
      "styles/**/*.css"
    ],
    "intent_patterns": [
      "(create|build|add).*?(component|page|ui|button|form)",
      "(style|design|layout|responsive)"
    ],
    "content_triggers": [
      "useState",
      "useEffect",
      "className=",
      "<.*?/>"
    ],
    "priority": 1
  },
  "testing-guidelines": {
    "keywords": [
      "test", "testing", "jest", "vitest",
      "playwright", "e2e", "unit"
    ],
    "file_patterns": [
      "tests/**/*.ts",
      "**/*.test.ts",
      "**/*.spec.ts"
    ],
    "intent_patterns": [
      "(write|add|create|fix).*?(test|spec)",
      "(testing|coverage)"
    ],
    "priority": 2
  }
}
```

## Hook Script

### skill-activation-prompt.sh

@resources/skill-activation-prompt.sh

### 동작 방식

1. 사용자 입력(`$prompt`)을 받음
2. `skill-rules.json` 로드
3. 각 skill에 대해:
   - keywords 매칭 체크
   - intent_patterns 정규식 매칭
4. 매칭된 skills를 메시지로 반환
5. Claude가 메시지를 보고 skill 로드

## Advanced Usage

### 다중 Skill 매칭

여러 skill이 매칭되면 모두 표시:

```
💡 Relevant skills: backend-dev-guidelines, testing-guidelines
Consider loading these skills before proceeding.
```

### Priority 기반 정렬

```json
{
  "critical-security": { "priority": 0 },
  "backend-dev": { "priority": 1 },
  "testing": { "priority": 2 }
}
```

낮은 priority가 먼저 표시됩니다.

### File Pattern 기반 활성화

현재 작업 중인 파일 경로를 기반으로 활성화:

```json
{
  "file_patterns": ["app/api/**/*.ts"]
}
```

`app/api/users/route.ts` 수정 시 자동 활성화

## Integration with Other Patterns

### Dev Docs Pattern

```json
{
  "dev-docs-pattern": {
    "keywords": ["dev docs", "context", "plan", "session"],
    "file_patterns": ["dev/active/**/*.md"],
    "intent_patterns": ["(create|update).*?(dev docs|plan)"]
  }
}
```

### Build Check

skill-activation과 build-check을 함께 사용:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "command": "skill-activation-prompt.sh" }
    ],
    "Stop": [
      { "command": "build-check.sh" }
    ]
  }
}
```

## Best Practices

### DO
- 구체적인 키워드 사용 (너무 일반적인 단어 피하기)
- 정규식은 간단하게 유지
- priority로 중요한 skill 우선 표시
- 프로젝트에 맞게 커스터마이징

### DON'T
- 너무 많은 skill 등록 (5-10개 권장)
- 모든 것에 매칭되는 광범위한 패턴
- blocking: true로 오래 걸리는 작업

## Troubleshooting

### Hook이 실행되지 않음
1. settings.json 경로 확인
2. 스크립트 실행 권한 (`chmod +x`)
3. jq 설치 확인 (`brew install jq`)

### 잘못된 Skill이 매칭됨
1. keywords를 더 구체적으로
2. intent_patterns 정규식 수정
3. priority 조정

### 너무 많은 Skill이 매칭됨
1. keywords 정리 (중복 제거)
2. priority로 필터링
3. 최대 표시 개수 제한

## Resources

- @resources/skill-activation-prompt.sh
- @resources/skill-rules-example.json

## References

- [Original Article](https://dev.to/diet-code103/claude-code-is-a-beast-tips-from-6-months-of-hardcore-use-572n)
- [GitHub Infrastructure Showcase](https://github.com/diet103/claude-code-infrastructure-showcase)
