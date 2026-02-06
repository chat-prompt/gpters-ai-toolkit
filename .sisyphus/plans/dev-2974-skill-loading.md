# DEV-2974: 복리엔진 Skill 적재 방식 변경

## TL;DR

> **Quick Summary**: MCP를 통해 skill 조회 시 연관된 agent들을 함께 resolve하여 OpenCode Plugin에서 subagent로 자동 등록할 수 있도록 개선
> 
> **Deliverables**:
> - dependency-resolver에 agent 타입 resolve 시 AgentConfig 형태로 변환하는 기능 추가
> - get_plugin_content API 응답에 `resolvedAgents` 필드 추가
> - OpenCode Plugin에서 resolvedAgents를 config.agent에 자동 등록
> - files 배열에서 type: "reference" 지원
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 6

---

## Context

### Original Request
Linear DEV-2974: "현재 skill.md 파일과 files로 DB에 적재하고 있는것을 subagent 및 reference 활용 가능하도록 개선"

### Interview Summary
**Key Discussions**:
- 로컬 환경에서는 SKILL.md, AGENTS.md, references/ 파일이 파일 시스템에 있어 Claude가 직접 접근 가능
- MCP를 통해 skill을 받으면 텍스트만 받고, 연관된 subagent나 reference가 활성화되지 않음
- 해결 방향: OpenCode Plugin이 skill 조회 시 연관 agent를 config.agent에 자동 등록

**Research Findings**:
- dependency-resolver.ts에 이미 `agent:` prefix 타입 지원 (`'mcp' | 'skill' | 'agent' | 'other'`)
- catalogItems 테이블에 agentModel, agentPermissionMode, agentSkills 필드 이미 존재
- files 배열의 type 필드가 optional로 이미 존재
- OpenCode Plugin이 apps/opencode-plugin/에 존재

### Metis Review
**Identified Gaps** (addressed):
- `agent:` vs `subagent:` prefix → 기존 `agent:` prefix 재사용 결정
- Draft agent 참조 시 처리 → published만 resolve로 결정
- Transitive 깊이 → 기존 maxDepth(10) 사용
- OpenCode Plugin 범위 → 이 repo에 포함되므로 작업 범위 내

---

## Work Objectives

### Core Objective
MCP get_plugin_content API가 skill의 agent 의존성을 resolve하여 AgentConfig 형태로 반환하고, OpenCode Plugin이 이를 자동으로 config.agent에 등록하여 subagent로 활용할 수 있게 함

### Concrete Deliverables
- `packages/lib/src/plugin/dependency-resolver.ts`: resolveAgentsAsConfig() 함수 추가
- `packages/lib/src/mcp/handlers.ts`: getPluginContent 응답에 resolvedAgents 필드 추가
- `packages/lib/src/mcp/types.ts`: ResolvedAgent 인터페이스 정의
- `apps/opencode-plugin/src/index.ts` 또는 관련 파일: resolvedAgents 자동 등록 로직

### Definition of Done
- [ ] `bun test` 모든 테스트 통과
- [ ] get_plugin_content 호출 시 agent 의존성이 resolve되어 반환됨
- [ ] OpenCode Plugin이 skill 로드 시 연관 agent를 config.agent에 등록함

### Must Have
- agent: dependency가 있는 skill 조회 시 resolvedAgents 필드 포함
- resolvedAgents 각 항목에 prompt, description, model 포함
- published 상태의 agent만 resolve
- files 배열에서 type: "reference" 필드 보존

### Must NOT Have (Guardrails)
- ❌ 새로운 `subagent:` prefix 추가 (기존 `agent:` 사용)
- ❌ UI 변경 (웹 대시보드)
- ❌ 기존 skill 데이터 마이그레이션
- ❌ Draft 상태의 agent resolve
- ❌ parseDependency 함수 시그니처 변경
- ❌ DB 스키마 변경

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (Vitest 설정 존재)
- **Automated tests**: TDD (테스트 먼저)
- **Framework**: Vitest

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **API Response** | Bash (curl) | Send request, parse JSON, assert fields |
| **Unit Functions** | Bash (bun test) | Run tests, verify pass |
| **OpenCode Plugin** | Bash (bun test) + Bash (bun run) | Unit test + manual integration check script |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: ResolvedAgent 타입 정의 및 테스트
└── Task 2: files type: "reference" 지원 확인/테스트

Wave 2 (After Wave 1):
├── Task 3: dependency-resolver 확장 (resolveAgentsAsConfig)
└── Task 4: deploy_skill에서 agent: dependency 저장 테스트

Wave 3 (After Wave 2):
├── Task 5: get_plugin_content 응답 확장
└── Task 6: OpenCode Plugin 자동 등록 구현

Critical Path: Task 1 → Task 3 → Task 5 → Task 6
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 5 | 2 |
| 2 | None | - | 1 |
| 3 | 1 | 5 | 4 |
| 4 | None | - | 3 |
| 5 | 1, 3 | 6 | - |
| 6 | 5 | None | - |

---

## TODOs

- [x] 1. ResolvedAgent 타입 정의 및 테스트 작성

  **What to do**:
  - `packages/lib/src/mcp/types.ts`에 ResolvedAgent 인터페이스 정의
  - OpenCode SDK AgentConfig와 호환되는 필드 포함: id, prompt, description, model
  - 테스트 케이스 작성

  **Must NOT do**:
  - OpenCode SDK 의존성 추가하지 않음 (자체 타입 정의)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일 타입 정의, 간단한 작업
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 작성 시 활용

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3, Task 5
  - **Blocked By**: None

  **References**:
  - `packages/lib/src/mcp/types.ts` - 기존 MCP 타입 정의 위치
  - `packages/lib/src/core/types.ts:CatalogItem` - agentModel, agentPermissionMode 필드 참조
  - OpenCode AgentConfig 구조: `{ prompt, description, mode, model, tools?, permission? }`

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: ResolvedAgent 타입이 정의되어 있음
    Tool: Bash (grep/cat)
    Steps:
      1. grep "interface ResolvedAgent" packages/lib/src/mcp/types.ts
      2. Assert: 결과에 "id", "prompt", "description", "model" 필드 포함
    Expected Result: 타입 정의 존재
    Evidence: grep 출력
  ```

  **Commit**: YES
  - Message: `feat(mcp): add ResolvedAgent type for subagent resolution`
  - Files: `packages/lib/src/mcp/types.ts`

---

- [x] 2. files type: "reference" 지원 확인 및 테스트

  **What to do**:
  - 현재 files 배열의 type 필드가 제대로 저장/반환되는지 확인
  - 필요시 테스트 케이스 추가
  - type: "reference" 필드가 deploy → get_plugin_content 라운드트립에서 보존되는지 검증

  **Must NOT do**:
  - Reference 파일에 대한 특별한 처리 로직 추가 (v1에서는 단순 보존만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 기능 확인 + 테스트 추가
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `packages/lib/src/mcp/handlers.ts:deploySkill` - files 저장 로직 (line 508-548)
  - `packages/lib/src/mcp/handlers.ts:getPluginContent` - files 반환 로직 (line 134-196)
  - `packages/db/src/schema.ts:catalogItems.files` - JSONB 컬럼

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/lib/src/mcp/__tests__/files-type.test.ts`
  - [ ] Test: "deploy_skill with type:reference preserves type field"
  - [ ] `bun test packages/lib/src/mcp/__tests__/files-type.test.ts` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: files의 type 필드가 보존됨
    Tool: Bash (bun test)
    Preconditions: 테스트 파일 생성됨
    Steps:
      1. bun test packages/lib/src/mcp/__tests__/files-type.test.ts
      2. Assert: 모든 테스트 통과
    Expected Result: type: "reference" 필드가 라운드트립에서 보존됨
    Evidence: 테스트 출력
  ```

  **Commit**: YES
  - Message: `test(mcp): add test for files type field preservation`
  - Files: `packages/lib/src/mcp/__tests__/files-type.test.ts`

---

- [ ] 3. dependency-resolver에 resolveAgentsAsConfig 함수 추가

  **What to do**:
  - `packages/lib/src/plugin/dependency-resolver.ts`에 새 함수 추가
  - agent: 타입 dependency를 resolve하여 ResolvedAgent[] 형태로 반환
  - published 상태의 agent만 포함
  - transitive resolution 지원 (기존 resolver 로직 활용)

  **Must NOT do**:
  - 기존 resolveDependencies 함수 수정 (새 함수 추가만)
  - parseDependency 함수 시그니처 변경

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 기존 패턴 따르는 중간 규모 작업
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:
  - `packages/lib/src/plugin/dependency-resolver.ts` - 기존 resolver 구현
    - `resolveDependencies()` 함수 패턴 참조
    - `parseDependency()` 함수로 type 파싱
  - `packages/lib/src/mcp/types.ts:ResolvedAgent` - 반환 타입 (Task 1에서 정의)
  - `packages/db/src/schema.ts:catalogItems` - agent 필드들 (agentModel, agentPermissionMode)

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/lib/src/plugin/__tests__/resolve-agents.test.ts`
  - [ ] Tests:
    - "resolves agent: dependency to ResolvedAgent format"
    - "excludes draft agents"
    - "handles transitive agent dependencies"
    - "handles circular dependencies gracefully"
  - [ ] `bun test packages/lib/src/plugin/__tests__/resolve-agents.test.ts` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: agent dependency가 ResolvedAgent로 변환됨
    Tool: Bash (bun test)
    Steps:
      1. bun test packages/lib/src/plugin/__tests__/resolve-agents.test.ts
      2. Assert: 모든 테스트 통과
    Expected Result: agent: dependency가 {id, prompt, model, description} 형태로 반환
    Evidence: 테스트 출력

  Scenario: draft agent는 resolve되지 않음
    Tool: Bash (bun test)
    Steps:
      1. 테스트에서 draft agent 참조 케이스 실행
      2. Assert: draft agent가 resolvedAgents에 포함되지 않음
    Expected Result: published agent만 반환
    Evidence: 테스트 출력
  ```

  **Commit**: YES
  - Message: `feat(plugin): add resolveAgentsAsConfig for subagent resolution`
  - Files: `packages/lib/src/plugin/dependency-resolver.ts`, `packages/lib/src/plugin/__tests__/resolve-agents.test.ts`

---

- [ ] 4. deploy_skill에서 agent: dependency 저장 테스트

  **What to do**:
  - deploy_skill API가 `dependencies: ["agent:code-reviewer"]` 형태를 올바르게 저장하는지 테스트
  - 기존 기능이므로 통합 테스트만 추가

  **Must NOT do**:
  - deploy_skill 구현 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 테스트만 추가
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `packages/lib/src/mcp/handlers.ts:deploySkill` - 저장 로직
  - `tests/api/mcp-deploy.test.ts` - 기존 deploy 테스트 (있다면)

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test: "deploy_skill stores agent: prefix in dependencies"
  - [ ] `bun test` 관련 테스트 통과

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: agent: dependency가 저장됨
    Tool: Bash (bun test)
    Steps:
      1. bun test --grep "agent: prefix"
      2. Assert: 테스트 통과
    Expected Result: dependencies 필드에 agent: prefix 포함
    Evidence: 테스트 출력
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `test(mcp): add integration test for agent dependency storage`

---

- [ ] 5. get_plugin_content 응답에 resolvedAgents 추가

  **What to do**:
  - `packages/lib/src/mcp/handlers.ts`의 getPluginContent 함수 수정
  - agent: 타입 dependency가 있으면 resolveAgentsAsConfig 호출
  - 응답에 resolvedAgents 필드 추가
  - PluginContent 타입에 resolvedAgents 필드 추가

  **Must NOT do**:
  - 기존 응답 필드 변경 (새 필드만 추가)
  - resolvedAgents가 없으면 빈 배열 대신 undefined 반환

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 핵심 API 수정, 테스트 포함
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 6
  - **Blocked By**: Task 1, Task 3

  **References**:
  - `packages/lib/src/mcp/handlers.ts:getPluginContent` (lines 134-196) - 수정 대상
  - `packages/lib/src/mcp/types.ts:PluginContent` - 응답 타입
  - `packages/lib/src/plugin/dependency-resolver.ts:resolveAgentsAsConfig` - Task 3에서 구현

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/lib/src/mcp/__tests__/get-plugin-content.test.ts`
  - [ ] Tests:
    - "returns resolvedAgents when skill has agent: dependencies"
    - "resolvedAgents is undefined when no agent dependencies"
    - "resolvedAgents contains prompt, model, description for each agent"
  - [ ] `bun test packages/lib/src/mcp/__tests__/get-plugin-content.test.ts` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: agent dependency가 있는 skill 조회 시 resolvedAgents 포함
    Tool: Bash (curl) - 개발 서버 또는 테스트
    Preconditions: agent dependency가 있는 skill이 DB에 존재
    Steps:
      1. API 호출: get_plugin_content with skillId that has agent: dep
      2. Parse JSON response
      3. Assert: response.resolvedAgents is array
      4. Assert: resolvedAgents[0].prompt is string
      5. Assert: resolvedAgents[0].model is defined
    Expected Result: resolvedAgents 배열에 agent 정보 포함
    Evidence: 응답 JSON

  Scenario: agent dependency가 없으면 resolvedAgents undefined
    Tool: Bash (curl/test)
    Steps:
      1. API 호출: get_plugin_content with skillId without agent deps
      2. Assert: response.resolvedAgents is undefined
    Expected Result: 불필요한 빈 배열 없음
    Evidence: 응답 JSON
  ```

  **Commit**: YES
  - Message: `feat(mcp): add resolvedAgents to get_plugin_content response`
  - Files: `packages/lib/src/mcp/handlers.ts`, `packages/lib/src/mcp/types.ts`, `packages/lib/src/mcp/__tests__/get-plugin-content.test.ts`

---

- [ ] 6. resolvedAgents 활용 가이드 및 예시 skill 추가

  **What to do**:
  - `docs/SUBAGENT_USAGE.md` 문서 작성: resolvedAgents를 Claude가 delegate_task로 실행하는 방법 설명
  - 예시 skill 배포: agent dependency가 있는 샘플 skill 추가
  - get_plugin_content 응답에 subagent 실행 가이드 힌트 추가 (선택)

  **배경**:
  OpenCode Plugin의 config.agent는 초기화 시 1회만 설정되어 런타임 동적 등록 불가.
  대신 Claude가 resolvedAgents의 prompt를 delegate_task로 직접 실행하는 방식 사용.

  **실행 방식 예시**:
  ```
  // Claude가 skill 로드 후 subagent 실행
  const skill = await get_plugin_content("my-skill")
  const subagent = skill.resolvedAgents?.[0]
  
  // 사용자: "code-reviewer로 리뷰해줘"
  await delegate_task({
    prompt: subagent.prompt,
    category: "quick",  // 또는 적절한 카테고리
    description: subagent.description
  })
  ```

  **Must NOT do**:
  - OpenCode Plugin 코드 수정 (config.agent 동적 등록은 불가능)
  - 복잡한 자동화 로직 추가

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: 문서화 + 예시 작성 중심
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 5)
  - **Blocks**: None (최종 작업)
  - **Blocked By**: Task 5

  **References**:
  - `docs/` - 기존 문서 디렉토리
  - `packages/lib/src/mcp/types.ts:ResolvedAgent` - 응답 타입
  - Claude의 delegate_task 사용법

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 문서 파일이 생성됨
    Tool: Bash (ls/cat)
    Steps:
      1. ls docs/SUBAGENT_USAGE.md
      2. Assert: 파일 존재
      3. cat docs/SUBAGENT_USAGE.md
      4. Assert: "resolvedAgents", "delegate_task" 키워드 포함
    Expected Result: 문서에 사용법 설명 포함
    Evidence: 파일 내용

  Scenario: 문서가 예시 코드를 포함함
    Tool: Bash (grep)
    Steps:
      1. grep -c "delegate_task" docs/SUBAGENT_USAGE.md
      2. Assert: 1개 이상의 매치
    Expected Result: delegate_task 사용 예시 포함
    Evidence: grep 결과
  ```

  **Commit**: YES
  - Message: `docs: add subagent usage guide for resolvedAgents`
  - Files: `docs/SUBAGENT_USAGE.md`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(mcp): add ResolvedAgent type` | types.ts | grep 확인 |
| 2 | `test(mcp): add files type preservation test` | __tests__/files-type.test.ts | bun test |
| 3+4 | `feat(plugin): add resolveAgentsAsConfig` | dependency-resolver.ts, tests | bun test |
| 5 | `feat(mcp): add resolvedAgents to get_plugin_content` | handlers.ts, types.ts, tests | bun test |
| 6 | `docs: add subagent usage guide` | docs/SUBAGENT_USAGE.md | ls, grep 확인 |

---

## Success Criteria

### Verification Commands
```bash
# 전체 테스트 통과
bun test

# 특정 기능 테스트
bun test packages/lib/src/plugin/__tests__/resolve-agents.test.ts
bun test packages/lib/src/mcp/__tests__/get-plugin-content.test.ts
bun test apps/opencode-plugin
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (`bun test`)
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds
