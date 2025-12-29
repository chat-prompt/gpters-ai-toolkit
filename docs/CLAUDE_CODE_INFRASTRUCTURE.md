# Claude Code Infrastructure Guide

> 6개월간의 실전 사용에서 검증된 Claude Code 인프라 패턴과 GPTers AI Toolkit 적용 방안

## Overview

이 문서는 [Claude Code is a Beast - Tips from 6 Months of Hardcore Use](https://dev.to/diet-code103/claude-code-is-a-beast-tips-from-6-months-of-hardcore-use-572n) 글의 핵심 패턴을 정리하고, GPTers AI Toolkit 프로젝트에 적용하는 방법을 다룹니다.

**참고 자료:**
- [DEV Community 원문](https://dev.to/diet-code103/claude-code-is-a-beast-tips-from-6-months-of-hardcore-use-572n)
- [GitHub Infrastructure Showcase](https://github.com/diet103/claude-code-infrastructure-showcase)

---

## 핵심 문제와 해결책

### 문제 1: Skills가 자동으로 활성화되지 않음

**증상**: 수천 줄의 베스트 프랙티스를 작성해도 Claude가 무시함

**해결책**: Hooks를 통한 자동 활성화 시스템
- `skill-rules.json`에 키워드, 파일 패턴, 의도 패턴 정의
- `UserPromptSubmit` Hook이 패턴 매칭 후 관련 skill 제안

### 문제 2: Context 리셋 시 맥락 손실

**증상**: 긴 세션 후 context가 리셋되면 이전 결정사항을 잊음

**해결책**: Dev Docs 패턴 (3-파일 구조)
- `[task]-plan.md` - 승인된 계획
- `[task]-context.md` - 핵심 파일, 결정사항
- `[task]-tasks.md` - 작업 체크리스트

### 문제 3: 빌드 에러를 놓침

**증상**: 코드 수정 후 빌드 에러를 발견하지 못함

**해결책**: Stop Hook으로 자동 빌드 체크
- 응답 후 영향받은 파일에서 빌드 실행
- TypeScript 에러 즉시 감지 및 알림

---

## 핵심 패턴 상세

### 1. Skills Auto-Activation System

#### 구조
```
.claude/
├── skills/
│   ├── backend-dev-guidelines/
│   │   ├── SKILL.md              # ≤500줄 개요
│   │   └── resources/
│   │       ├── error-handling.md
│   │       ├── api-patterns.md
│   │       └── database.md
│   ├── frontend-dev-guidelines/
│   │   ├── SKILL.md
│   │   └── resources/
│   └── skill-rules.json          # 활성화 규칙
└── hooks/
    └── skill-activation-prompt.ts
```

#### skill-rules.json 예시
```json
{
  "backend-dev-guidelines": {
    "keywords": ["backend", "database", "API", "controller", "route"],
    "file_patterns": ["backend/src/**/*.ts", "app/api/**/*.ts"],
    "intent_patterns": ["(create|add|implement).*?(route|endpoint|api)"],
    "content_triggers": ["router.", "export.*Controller", "prisma."]
  },
  "frontend-dev-guidelines": {
    "keywords": ["component", "React", "UI", "frontend", "CSS"],
    "file_patterns": ["components/**/*.tsx", "app/**/*.tsx"],
    "intent_patterns": ["(create|build|add).*?(component|page|ui)"],
    "content_triggers": ["useState", "useEffect", "className="]
  }
}
```

#### 500라인 규칙 (Progressive Disclosure)

**원칙**: 각 SKILL.md는 500줄 이하로 유지

**이유**:
- Claude가 필요한 정보만 로드
- Token 효율성 극대화
- 심화 내용은 `resources/` 폴더에 분리

**구조**:
```markdown
# Skill Name

## Quick Reference
(핵심 패턴, 자주 쓰는 코드)

## Core Patterns
(주요 개발 패턴)

## Resources
- @resources/error-handling.md - 에러 처리 상세
- @resources/api-patterns.md - API 패턴 상세
```

### 2. Hooks System

#### Hook 종류별 용도

| Hook | 실행 시점 | 용도 |
|------|----------|------|
| `UserPromptSubmit` | 사용자 입력 전 | Skill 자동 활성화 제안 |
| `PostToolUse` | 도구 사용 후 | 파일 수정 추적 |
| `Stop` | Claude 응답 완료 후 | 빌드 체크, 에러 알림 |

#### 필수 Hooks

**1. skill-activation-prompt (UserPromptSubmit)**
```typescript
// .claude/hooks/skill-activation-prompt.ts
export default async function(input: { prompt: string }) {
  const rules = loadSkillRules();
  const matchedSkills = findMatchingSkills(input.prompt, rules);

  if (matchedSkills.length > 0) {
    return {
      decision: "allow",
      message: `Relevant skills: ${matchedSkills.join(", ")}. Consider loading these first.`
    };
  }
  return { decision: "allow" };
}
```

**2. post-tool-use-tracker (PostToolUse)**
```bash
#!/bin/bash
# .claude/hooks/post-tool-use-tracker.sh
# 수정된 파일 추적
echo "$TOOL_NAME: $FILE_PATH" >> .claude/session-files.log
```

**3. build-check (Stop)**
```bash
#!/bin/bash
# .claude/hooks/build-check.sh
# 빌드 및 린트 체크
pnpm build 2>&1 | head -20
pnpm lint 2>&1 | head -10
```

#### settings.json 설정
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "node .claude/hooks/skill-activation-prompt.js"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": ".claude/hooks/build-check.sh"
      }
    ]
  }
}
```

### 3. Dev Docs Pattern

#### 구조
```
dev/
└── active/
    ├── [feature]-plan.md      # 전략적 계획
    ├── [feature]-context.md   # 핵심 결정사항
    └── [feature]-tasks.md     # 체크리스트
```

#### [feature]-plan.md 템플릿
```markdown
# [Feature Name] Implementation Plan

## Executive Summary
(1-2문장 요약)

## Goals
- [ ] Primary goal
- [ ] Secondary goal

## Approach
(구현 전략)

## Phases
### Phase 1: Foundation
- Task 1
- Task 2

### Phase 2: Implementation
- Task 3
- Task 4

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| ... | ... |

## Success Metrics
- Metric 1
- Metric 2
```

#### [feature]-context.md 템플릿
```markdown
# [Feature Name] Context

## Key Files
- `path/to/file.ts` - 역할 설명
- `path/to/another.ts` - 역할 설명

## Decisions Made
1. **Decision**: [결정 내용]
   - **Reason**: [이유]
   - **Date**: [날짜]

## Dependencies
- Library X for Y
- Service Z for W

## Notes
(중요 참고사항)
```

#### [feature]-tasks.md 템플릿
```markdown
# [Feature Name] Tasks

## Current Phase: [Phase Name]

### In Progress
- [ ] Task currently working on

### Completed
- [x] Completed task 1
- [x] Completed task 2

### Blocked
- [ ] Blocked task (reason: ...)

### Upcoming
- [ ] Next task 1
- [ ] Next task 2
```

#### 워크플로우

1. **계획 수립**: Planning Mode에서 계획 작성
2. **문서 생성**: `/dev-docs` 명령으로 3개 파일 자동 생성
3. **구현**: 섹션별로 1-2개 작업씩 진행
4. **Context 부족 시**: `/update-dev-docs` 실행 후 "continue"

### 4. Agents (독립 실행 가능한 전문가)

#### 주요 Agent 유형

**품질 관리**
- `code-architecture-reviewer` - 아키텍처 검토
- `build-error-resolver` - 빌드 에러 자동 수정

**테스트**
- `route-tester` - API 라우트 테스트
- `frontend-error-fixer` - 프론트엔드 에러 수정

**계획**
- `strategic-plan-architect` - 포괄적 계획 수립

#### Agent 정의 예시
```markdown
# Code Architecture Reviewer

## Purpose
코드 아키텍처를 검토하고 개선점을 제안합니다.

## Trigger
- 대규모 리팩토링 전
- 새로운 기능 구현 후
- PR 리뷰 시

## Process
1. 파일 구조 분석
2. 의존성 그래프 확인
3. SOLID 원칙 준수 여부 검토
4. 개선 권고사항 작성

## Output
- 아키텍처 다이어그램
- 문제점 목록
- 개선 권고사항
```

---

## GPTers AI Toolkit 적용 계획

### Phase 1: 기본 인프라 구축

#### 디렉토리 구조
```
.claude/
├── skills/
│   ├── catalog-api-guidelines/
│   │   ├── SKILL.md
│   │   └── resources/
│   │       ├── drizzle-patterns.md
│   │       └── api-conventions.md
│   ├── mcp-server-guidelines/
│   │   ├── SKILL.md
│   │   └── resources/
│   │       ├── tool-patterns.md
│   │       └── prompt-patterns.md
│   ├── frontend-guidelines/
│   │   ├── SKILL.md
│   │   └── resources/
│   │       ├── component-patterns.md
│   │       └── tailwind-v4.md
│   └── skill-rules.json
├── hooks/
│   ├── skill-activation-prompt.ts
│   ├── build-check.sh
│   └── test-check.sh
├── agents/
│   ├── api-route-tester.md
│   ├── build-error-resolver.md
│   └── code-reviewer.md
└── commands/
    ├── dev-docs.md
    └── update-dev-docs.md

dev/
└── active/
    └── (작업별 dev docs)
```

### Phase 2: Skill 정의

#### catalog-api-guidelines (예정)
```markdown
# Catalog API Development Guidelines

## Quick Reference
- Drizzle ORM 사용
- Neon PostgreSQL (serverless)
- NextAuth v5 인증

## API Patterns
- GET /api/catalog - 목록 조회
- GET /api/catalog/[id] - 상세 조회
- POST /api/admin/catalog - 생성 (admin only)

## Database Patterns
@resources/drizzle-patterns.md

## Error Handling
@resources/api-conventions.md
```

#### mcp-server-guidelines (예정)
```markdown
# MCP Server Development Guidelines

## Quick Reference
- JSON-RPC 2.0 프로토콜
- Streamable HTTP transport 지원

## Tool Patterns
@resources/tool-patterns.md

## Prompt Patterns
@resources/prompt-patterns.md
```

### Phase 3: Hooks 구현

#### skill-rules.json
```json
{
  "catalog-api-guidelines": {
    "keywords": ["catalog", "api", "drizzle", "database"],
    "file_patterns": ["app/api/catalog/**/*.ts", "lib/catalog.ts"],
    "intent_patterns": ["(add|create|update).*?(catalog|item)"]
  },
  "mcp-server-guidelines": {
    "keywords": ["mcp", "tool", "prompt", "json-rpc"],
    "file_patterns": ["app/api/mcp/**/*.ts", "lib/mcp/**/*.ts"],
    "intent_patterns": ["(add|implement).*?(tool|prompt|mcp)"]
  },
  "frontend-guidelines": {
    "keywords": ["component", "page", "ui", "tailwind"],
    "file_patterns": ["components/**/*.tsx", "app/**/*.tsx"],
    "intent_patterns": ["(create|build).*?(component|page)"]
  }
}
```

#### build-check.sh
```bash
#!/bin/bash
# .claude/hooks/build-check.sh

echo "=== Build Check ==="
pnpm build 2>&1 | tail -20

echo "=== Lint Check ==="
pnpm lint 2>&1 | tail -10

echo "=== Type Check ==="
pnpm tsc --noEmit 2>&1 | tail -10
```

### Phase 4: Dev Docs 템플릿

`dev/active/` 디렉토리에 현재 작업 문서 유지

---

## 구현 우선순위

| 순서 | 항목 | 효과 | 난이도 |
|------|------|------|--------|
| 1 | Dev Docs 패턴 | Context 유지 | 낮음 |
| 2 | Build Check Hook | 에러 조기 발견 | 낮음 |
| 3 | Skill 정의 (3개) | 일관성 있는 개발 | 중간 |
| 4 | Skill Auto-Activation | 자동화 | 중간 |
| 5 | Agents 정의 | 전문화된 작업 | 높음 |

---

## 핵심 원칙

> "Ask not what Claude can do for you, ask what context you can give to Claude"

1. **Planning이 왕** - 구현 전 계획 수립 필수
2. **Skills + Hooks** - 자동활성화만 실제로 작동함
3. **Dev Docs** - Context 손실 방지의 핵심
4. **Code Review** - Claude 자체 검토 활용
5. **명확한 프롬프트** - 구체성이 결과를 결정

---

## 참고 자료

- [Anthropic Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Getting Good Results from Claude Code](https://www.dzombak.com/blog/2025/08/getting-good-results-from-claude-code/)
- [24 Claude Code Tips](https://dev.to/oikon/24-claude-code-tips-claudecodeadventcalendar-52b5)
- [ykdojo/claude-code-tips](https://github.com/ykdojo/claude-code-tips)
