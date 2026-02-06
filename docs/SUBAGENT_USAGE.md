# Subagent Usage Guide: resolvedAgents

MCP를 통해 skill을 조회할 때 연관된 agent들을 함께 받아 subagent로 활용하는 방법을 설명합니다.

## 개요

skill이 `agent:` prefix로 dependency를 선언하면, `get_plugin_content` API 응답에 `resolvedAgents` 필드가 포함됩니다. Claude는 이 정보를 활용하여 `delegate_task`로 subagent를 실행할 수 있습니다.

## resolvedAgents 구조

```typescript
interface ResolvedAgent {
  /** Agent 식별자 */
  id: string
  /** Agent의 시스템 프롬프트/지침 */
  prompt: string
  /** Agent가 수행하는 작업 설명 */
  description: string
  /** AI 모델 식별자 (agentModel 필드에서 매핑) */
  model: string
}
```

## 사용 흐름

### 1. Skill 조회 시 resolvedAgents 확인

skill을 `get_plugin_content`로 조회하면 응답에 `resolvedAgents`가 포함됩니다:

```json
{
  "id": "my-review-skill",
  "name": "코드 리뷰 스킬",
  "type": "skill",
  "content": "...",
  "dependencies": ["agent:code-reviewer"],
  "resolvedAgents": [
    {
      "id": "code-reviewer",
      "prompt": "You are a code review expert...",
      "description": "코드 품질을 분석하고 개선점을 제안하는 에이전트",
      "model": "claude-sonnet-4-20250514"
    }
  ]
}
```

### 2. delegate_task로 Subagent 실행

Claude가 skill을 로드한 후, 사용자 요청에 따라 subagent를 실행합니다:

```typescript
// Skill 로드
const skill = await get_plugin_content({ pluginId: "my-review-skill" })

// Subagent 정보 추출
const reviewer = skill.resolvedAgents?.find(a => a.id === "code-reviewer")

// 사용자: "이 코드 리뷰해줘"
if (reviewer) {
  await delegate_task({
    prompt: reviewer.prompt,
    category: "quick",
    description: reviewer.description,
    // 추가 컨텍스트 전달
    context: "Review the following code: ..."
  })
}
```

## 실제 사용 예시

### 예시 1: 코드 리뷰 요청

사용자가 skill을 로드하고 subagent를 활용하는 전체 흐름:

```
사용자: "my-review-skill 로드해줘"

Claude:
1. get_plugin_content("my-review-skill") 호출
2. resolvedAgents에서 code-reviewer 확인
3. "코드 리뷰 스킬이 로드되었습니다. code-reviewer subagent를 사용할 수 있습니다."

사용자: "src/utils.ts 파일 리뷰해줘"

Claude:
1. 파일 내용 읽기
2. delegate_task 호출:
   - prompt: reviewer.prompt
   - description: "src/utils.ts 코드 리뷰"
   - context: 파일 내용
3. Subagent 결과 반환
```

### 예시 2: 여러 Subagent 활용

skill이 여러 agent dependency를 가진 경우:

```typescript
const skill = await get_plugin_content({ pluginId: "full-review-skill" })

// dependencies: ["agent:code-reviewer", "agent:security-checker"]
// resolvedAgents: [
//   { id: "code-reviewer", ... },
//   { id: "security-checker", ... }
// ]

// 코드 품질 리뷰
const codeReviewer = skill.resolvedAgents?.find(a => a.id === "code-reviewer")
await delegate_task({
  prompt: codeReviewer.prompt,
  category: "quick",
  description: "코드 품질 분석"
})

// 보안 검사
const securityChecker = skill.resolvedAgents?.find(a => a.id === "security-checker")
await delegate_task({
  prompt: securityChecker.prompt,
  category: "quick", 
  description: "보안 취약점 검사"
})
```

## Skill 배포 시 Agent Dependency 선언

skill을 배포할 때 `dependencies` 필드에 `agent:` prefix로 의존성을 선언합니다:

```typescript
await deploy_skill({
  type: "skill",
  name: "코드 리뷰 스킬",
  content: "# 코드 리뷰 스킬\n\n이 스킬은 code-reviewer agent를 활용합니다...",
  dependencies: ["agent:code-reviewer", "agent:security-checker"]
})
```

## 주의사항

### Published Agent만 Resolve

- `resolvedAgents`에는 **published** 상태의 agent만 포함됩니다
- draft 상태의 agent는 resolve되지 않습니다

### OpenCode Plugin 제약

- OpenCode Plugin의 `config.agent`는 초기화 시 1회만 설정됩니다
- 런타임에 동적으로 agent를 등록할 수 없습니다
- 따라서 Claude가 `delegate_task`로 직접 subagent를 실행하는 방식을 사용합니다

### Transitive Dependencies

- agent가 다른 agent를 dependency로 가지면 재귀적으로 resolve됩니다
- 최대 깊이는 10으로 제한됩니다 (순환 참조 방지)

## 관련 타입 정의

전체 타입 정의는 `packages/lib/src/mcp/types.ts`를 참조하세요:

```typescript
// PluginContent 응답에 포함되는 resolvedAgents
interface PluginContent {
  // ... 기존 필드들
  resolvedAgents?: ResolvedAgent[]
}

interface ResolvedAgent {
  id: string
  prompt: string
  description: string
  model: string
}
```

## 참고 문서

- [MCP 자동 검색 설정](./AUTO_PLUGIN_DISCOVERY.md)
- [V2 아키텍처](./ARCHITECTURE_V2.md)
- [팀 온보딩 가이드](./TEAM_ONBOARDING.md)
