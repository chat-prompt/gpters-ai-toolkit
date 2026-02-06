# Draft: DEV-2974 복리엔진 Skill 적재 방식 변경

## Requirements (confirmed)
- **현재 상태**: skill.md 파일과 files로 DB에 적재
- **목표**: subagent 및 reference 활용 가능하도록 개선

## Technical Decisions
- (사용자 확인 필요)

## Research Findings

### 현재 DB 구조 (catalogItems 테이블)
- `content` (text): SKILL.md 내용
- `files` (jsonb): 추가 파일 배열 `[{name, content, type}]`
- `agentSkills` (text): comma-separated subagent 참조
- `dependencies` (text[]): `["mcp:github", "skill:git-commit"]` 형식
- Agent 전용 필드: `agentModel`, `agentPermissionMode`

### OpenCode SDK AgentConfig 형식
```typescript
interface AgentConfig {
  prompt: string          // 시스템 프롬프트
  description: string     // 에이전트 설명
  mode: "subagent" | "primary" | "all"  // 실행 모드
  model: string           // AI 모델
  tools?: string[]        // 사용 가능 도구
  permission?: PermissionConfig  // 권한 설정
  maxSteps?: number       // 최대 스텝
}
```

### 현재 OpenCode Plugin 패턴 (apps/opencode-plugin/)
- `config.agent[name] = AgentConfig` 형태로 subagent 등록
- Command에서 `agent: AGENT_NAME`으로 참조
- Prompt 내에서 `${OTHER_AGENT_PROMPT}` 형태로 임베딩

### 현재 문제점 (confirmed)
**로컬 vs MCP 환경 차이:**

| 환경 | Subagent | Reference 파일 |
|------|----------|---------------|
| 로컬 (파일 시스템) | AGENTS.md에서 읽어서 활용 | references/ 폴더에서 직접 읽음 |
| MCP (get_plugin_content) | ❌ 텍스트만 전달, 실제 로드 안됨 | ❌ files 배열로만 전달, 활용 안됨 |

**핵심 문제:** MCP로 skill을 가져와도 그 skill이 의존하는 subagent와 reference가 함께 활성화되지 않음

## Open Questions
- [x] "subagent 활용 가능"의 구체적 의미? → skill이 의존하는 subagent를 함께 로드
- [x] "reference 활용 가능"의 구체적 의미? → skill이 참조하는 파일들을 함께 제공
- [x] 현재 문제점? → MCP로 skill 조회 시 연관 subagent/reference가 활성화 안됨
- [x] **해결 방식?** → OpenCode Plugin이 skill 조회 시 연관 subagent를 config.agent에 자동 등록
- [x] **Reference 형태?** → files 배열에 포함, 명시적으로 'reference' 타입 표기

## Technical Decisions (confirmed)
1. **Subagent 활성화**: OpenCode Plugin이 get_plugin_content 응답의 subagent 정보를 읽어 config.agent에 자동 등록
2. **Reference 제공**: files 배열에서 type: "reference"로 구분
3. **Subagent 지정 방식**: 기존 `dependencies` 필드 활용 → `subagent:code-reviewer` 형식
4. **Transitive 처리**: 전체 dependency 트리 로드 (기존 dependency-resolver 활용)

## Implementation Direction (Final)

### 1. dependencies 필드 - 기존 agent: prefix 활용
현재: `["mcp:github", "skill:git-commit"]`
사용: `["agent:code-reviewer", "agent:git-master"]` (기존 prefix 재사용)

### 2. get_plugin_content 응답 확장
```typescript
{
  content: "SKILL.md...",
  files: [...],
  // 새로 추가
  resolvedAgents: [
    { id: "code-reviewer", prompt: "...", model: "sonnet", description: "...", ... }
  ]
}
```

### 3. OpenCode Plugin 수정 (apps/opencode-plugin/)
```typescript
// skill 로드 시
const skill = await mcpClient.getPluginContent(skillId)
skill.resolvedAgents?.forEach(agent => {
  config.agent[agent.id] = {
    prompt: agent.prompt,
    mode: "subagent",
    model: mapModel(agent.model),
    description: agent.description,
  }
})
```

## Metis Review - Applied Guardrails
1. ✅ 기존 `agent:` prefix 사용 (parser 변경 불필요)
2. ✅ Draft agent는 제외 (published만 resolve)
3. ✅ 기존 maxDepth(10) 사용
4. ✅ 순환 의존성은 기존 resolver가 처리
5. ✅ OpenCode Plugin은 이 repo에 포함 (apps/opencode-plugin/)

## Scope Boundaries

### INCLUDE
- DB 스키마: dependencies 필드에 `subagent:` prefix 지원 (이미 text[] 타입)
- deploy_skill API: subagent dependency 저장 처리
- get_plugin_content: resolvedSubagents 필드 추가 (transitive resolver 활용)
- OpenCode Plugin: skill 로드 시 subagent를 config.agent에 자동 등록
- files 배열: type: "reference" 명시적 지원
- 테스트: TDD 방식으로 각 레이어별 테스트

### EXCLUDE
- UI 변경 (웹 대시보드)
- 기존 skill 데이터 마이그레이션 (추후 별도 작업)
- Reference 파일의 특별한 처리 로직 (files 배열에 포함만)

## Test Strategy
- **방식**: TDD (테스트 먼저)
- **프레임워크**: Vitest (unit/API), 필요시 E2E
- **커버리지**: 
  - dependency-resolver: subagent 타입 해석
  - get_plugin_content: resolvedSubagents 반환
  - OpenCode Plugin: subagent 자동 등록
