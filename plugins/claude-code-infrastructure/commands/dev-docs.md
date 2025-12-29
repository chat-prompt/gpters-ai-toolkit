# /dev-docs

새로운 기능 개발을 위한 Dev Docs (plan, context, tasks) 3개 파일을 생성합니다.

## Usage

```
/dev-docs [feature-name]
```

## Instructions

다음 작업을 수행해주세요:

### 1. Feature Name 확인
- `$ARGUMENTS`가 비어있으면 사용자에게 feature name을 물어보세요
- feature name은 kebab-case로 사용 (예: `mcp-v2`, `user-auth`)

### 2. 디렉토리 확인
```bash
mkdir -p dev/active dev/templates dev/archive
```

### 3. 3개 파일 생성

**dev/active/[feature]-plan.md:**
```markdown
# [Feature Name] Implementation Plan

> 작성일: [오늘 날짜]
> 상태: Draft

## Executive Summary

[사용자에게 물어보거나 비워두기]

## Goals

### Primary Goals
- [ ]

### Secondary Goals
- [ ]

## Approach

[구현 전략]

## Phases

### Phase 1:
- [ ]

### Phase 2:
- [ ]

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| | | | |

## Success Metrics

- [ ]

## Out of Scope

-

## Open Questions

- [ ]

---

## Approval

- [ ] 계획 검토 완료
- [ ] 구현 시작 승인
```

**dev/active/[feature]-context.md:**
```markdown
# [Feature Name] Context

> 마지막 업데이트: [현재 시간]

## Key Files

| File | Purpose | Status |
|------|---------|--------|
| | | |

## Decisions Made

(아직 없음)

## Dependencies

### External
-

### Internal
-

## Notes

-

---

## Session Log

### [오늘 날짜] - Session Start
- 시작: dev docs 생성
```

**dev/active/[feature]-tasks.md:**
```markdown
# [Feature Name] Tasks

> 마지막 업데이트: [현재 시간]
> 현재 Phase: Phase 1

## Progress Overview

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1 | Not Started | 0/0 |
| Phase 2 | Not Started | 0/0 |

---

## Current Phase: Phase 1

### In Progress
(없음)

### Up Next
- [ ] plan.md 작성 및 승인

---

## Validation Checklist

### Before Completion
- [ ] 빌드 성공
- [ ] 린트 통과
- [ ] 테스트 통과

---

## Session Notes

### [오늘 날짜] - Session Start
**Status:** Dev docs 생성 완료
**Next:** plan.md 작성
```

### 4. 결과 안내

생성 완료 후 다음을 안내:

```
✅ Dev Docs 생성 완료

📁 생성된 파일:
- dev/active/[feature]-plan.md
- dev/active/[feature]-context.md
- dev/active/[feature]-tasks.md

📝 다음 단계:
1. plan.md에 계획을 작성하세요
2. 계획 승인 후 구현을 시작하세요
3. 세션 종료 전 /update-dev-docs 실행
```

## Example

```
User: /dev-docs user-auth

Claude:
✅ Dev Docs 생성 완료

📁 생성된 파일:
- dev/active/user-auth-plan.md
- dev/active/user-auth-context.md
- dev/active/user-auth-tasks.md

📝 다음 단계:
1. plan.md에 계획을 작성하세요
2. 계획 승인 후 구현을 시작하세요
3. 세션 종료 전 /update-dev-docs 실행
```
