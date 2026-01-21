/**
 * MCP Tool Definitions for GPTers AI Toolkit
 *
 * These tools allow Claude Code to search and retrieve plugins
 * from the GPTers catalog dynamically.
 */

import type { McpTool } from './types'

/**
 * 관리자 전용 도구 이름 목록
 * 이 도구들은 MCP tools/list에서 숨겨지며, 호출 시 권한 에러를 반환합니다.
 */
export const ADMIN_TOOL_NAMES = ['create_plugin', 'update_plugin', 'delete_plugin'] as const

export type AdminToolName = (typeof ADMIN_TOOL_NAMES)[number]

/**
 * 도구가 관리자 전용인지 확인
 */
export function isAdminTool(toolName: string): toolName is AdminToolName {
  return ADMIN_TOOL_NAMES.includes(toolName as AdminToolName)
}

/**
 * 모든 도구 정의 (관리자 도구 포함 - 내부용)
 */
const ALL_TOOLS: McpTool[] = [
  {
    name: 'semantic_search',
    description: `의미 기반으로 플러그인을 검색합니다.
자연어로 질문하면 의미적으로 유사한 플러그인을 찾습니다.
키워드 검색(search_plugins)과 달리 의도를 이해하여 검색합니다.

예시:
- "코드 품질을 높이는 도구" → 코드 리뷰, 리팩토링 관련 플러그인
- "데이터베이스 작업 도와줘" → DB 스키마, 쿼리 관련 플러그인
- "문서 작성할 때 쓸만한 것" → 문서화, 마크다운 관련 플러그인`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '자연어 검색 쿼리 (예: "코드 리뷰 도와주는 도구", "DB 관련 작업")',
        },
        category: {
          type: 'string',
          enum: ['skill', 'agent', 'command', 'guide', 'all'],
          description: '플러그인 카테고리 필터 (기본: all)',
        },
        limit: {
          type: 'number',
          description: '최대 결과 수 (기본: 5, 최대: 20)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_plugins',
    description: `카탈로그에서 플러그인을 검색합니다.
키워드와 매칭되는 스킬, 에이전트, 커맨드를 반환합니다.
검색은 이름, 설명, 태그를 대상으로 수행됩니다.

예시:
- "database schema" → DB 관련 플러그인 검색
- "code review" → 코드 리뷰 관련 플러그인 검색
- "refactoring" → 리팩토링 가이드 검색`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '검색 키워드 (예: "database", "refactoring", "code review")',
        },
        category: {
          type: 'string',
          enum: ['skill', 'agent', 'command', 'guide', 'all'],
          description: '플러그인 카테고리 필터 (기본: all)',
        },
        teamTag: {
          type: 'string',
          enum: ['platform', 'ai', 'data', 'product', 'infra', 'general'],
          description: '팀 태그 필터 (선택)',
        },
        limit: {
          type: 'number',
          description: '최대 결과 수 (기본: 5, 최대: 20)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_plugin_content',
    description: `특정 플러그인의 전체 내용을 조회합니다.
스킬의 경우 SKILL.md 내용을, 에이전트의 경우 에이전트 정의를 반환합니다.
플러그인 ID는 search_plugins 또는 list_plugins로 먼저 확인하세요.

반환되는 content 필드에는 해당 플러그인의 지침이 포함되어 있으며,
이를 참고하여 작업을 수행할 수 있습니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        pluginId: {
          type: 'string',
          description: '플러그인 ID (예: "data-source-reference", "code-reviewer")',
        },
      },
      required: ['pluginId'],
    },
  },
  {
    name: 'list_plugins',
    description: `카탈로그의 모든 플러그인 목록을 조회합니다.
카테고리나 팀 태그로 필터링할 수 있습니다.
전체 목록을 확인하거나 특정 유형의 플러그인을 찾을 때 유용합니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['skill', 'agent', 'command', 'guide', 'all'],
          description: '플러그인 카테고리 필터 (기본: all)',
        },
        teamTag: {
          type: 'string',
          enum: ['platform', 'ai', 'data', 'product', 'infra', 'general'],
          description: '팀 태그 필터 (선택)',
        },
      },
    },
  },
  {
    name: 'get_plugins_by_category',
    description: `특정 카테고리의 플러그인 목록을 조회합니다.
스킬, 에이전트, 커맨드 등 특정 유형만 필요할 때 사용하세요.`,
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['skill', 'agent', 'command', 'guide'],
          description: '플러그인 카테고리',
        },
        limit: {
          type: 'number',
          description: '최대 결과 수 (기본: 10)',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'create_plugin',
    description: `새 플러그인을 카탈로그에 생성합니다.
스킬, 에이전트, 커맨드, 가이드, 훅을 생성할 수 있습니다.
content 필드에 메인 콘텐츠(SKILL.md 등)를 전달하고,
files 필드에 추가 파일(스크립트, 레퍼런스 등)을 배열로 전달할 수 있습니다.

주의: 이 도구는 관리자 권한이 필요합니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '플러그인 ID (소문자, 하이픈 사용, 예: "my-new-skill")',
        },
        type: {
          type: 'string',
          enum: ['skill', 'agent', 'command', 'guide', 'hook'],
          description: '플러그인 타입',
        },
        name: {
          type: 'string',
          description: '플러그인 이름 (표시용)',
        },
        description: {
          type: 'string',
          description: '플러그인 설명',
        },
        content: {
          type: 'string',
          description: '메인 콘텐츠 (SKILL.md, AGENT.md 등의 내용)',
        },
        author: {
          type: 'string',
          description: '작성자 이름 (기본: unknown)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '태그 목록',
        },
        teamTag: {
          type: 'string',
          enum: ['platform', 'ai', 'data', 'product', 'infra', 'general'],
          description: '팀 태그 (기본: general)',
        },
        readme: {
          type: 'string',
          description: 'README.md 내용 (선택)',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '파일명 (예: "setup.sh")' },
              content: { type: 'string', description: '파일 내용' },
              type: { type: 'string', description: '파일 타입 힌트 (예: "bash", "markdown")' },
            },
            required: ['name', 'content'],
          },
          description: '추가 파일 목록 (스크립트, 레퍼런스 등)',
        },
        mcpEnabled: {
          type: 'boolean',
          description: 'MCP 공개 여부 (기본: false)',
        },
      },
      required: ['id', 'type', 'name', 'content'],
    },
  },
  {
    name: 'update_plugin',
    description: `기존 플러그인을 업데이트합니다.
변경하고자 하는 필드만 전달하면 됩니다.
files 필드를 전달하면 기존 파일 목록이 완전히 교체됩니다.

주의: 이 도구는 관리자 권한이 필요합니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '업데이트할 플러그인 ID',
        },
        name: {
          type: 'string',
          description: '새 플러그인 이름',
        },
        description: {
          type: 'string',
          description: '새 설명',
        },
        content: {
          type: 'string',
          description: '새 메인 콘텐츠',
        },
        author: {
          type: 'string',
          description: '새 작성자',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '새 태그 목록',
        },
        teamTag: {
          type: 'string',
          enum: ['platform', 'ai', 'data', 'product', 'infra', 'general'],
          description: '새 팀 태그',
        },
        readme: {
          type: 'string',
          description: '새 README 내용',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              content: { type: 'string' },
              type: { type: 'string' },
            },
            required: ['name', 'content'],
          },
          description: '새 파일 목록 (기존 파일 교체)',
        },
        mcpEnabled: {
          type: 'boolean',
          description: 'MCP 공개 여부',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_plugin',
    description: `플러그인을 삭제합니다.

주의: 이 작업은 되돌릴 수 없습니다. 관리자 권한이 필요합니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '삭제할 플러그인 ID',
        },
      },
      required: ['id'],
    },
  },
  // V2: Deploy and version management tools
  {
    name: 'deploy_skill',
    description: `스킬/에이전트/커맨드/가이드를 GPTers 팀에 배포합니다.

현재 대화에서 만든 스킬을 팀과 공유할 때 사용합니다.
버전은 자동으로 관리됩니다:
- 신규: 1.0.0
- 기존 업데이트: 변경 내용에 따라 자동 bump (patch/minor/major)

예시:
- 새 스킬 배포: type="skill", name="코드 리뷰어", content="..."
- 새 가이드 배포: type="guide", name="Git 사용법", content="..."
- 기존 스킬 업데이트: id="code-reviewer", content="...", changelog="보안 체크 추가"`,
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['skill', 'agent', 'command', 'guide', 'hook'],
          description: '배포할 항목 타입',
        },
        name: {
          type: 'string',
          description: '표시 이름 (예: "코드 리뷰어")',
        },
        content: {
          type: 'string',
          description: '메인 콘텐츠 (SKILL.md 내용 등)',
        },
        id: {
          type: 'string',
          description: '플러그인 ID (미지정 시 name에서 자동 생성)',
        },
        description: {
          type: 'string',
          description: '짧은 설명',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '태그 목록',
        },
        teamTag: {
          type: 'string',
          enum: ['platform', 'ai', 'data', 'product', 'infra', 'general'],
          description: '팀 태그',
        },
        allowedTools: {
          type: 'string',
          description: '허용된 도구 (스킬용, 쉼표 구분)',
        },
        status: {
          type: 'string',
          enum: ['draft', 'published'],
          description: '배포 상태 (기본: published)',
        },
        changelog: {
          type: 'string',
          description: '변경사항 설명 (업데이트 시)',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              content: { type: 'string' },
              type: { type: 'string' },
            },
            required: ['name', 'content'],
          },
          description: '추가 파일들',
        },
      },
      required: ['type', 'name', 'content'],
    },
  },
  {
    name: 'undeploy_skill',
    description: `본인이 배포한 스킬/에이전트/커맨드를 삭제합니다.

플러그인 제작자만 자신의 플러그인을 삭제할 수 있습니다.
다른 사람의 플러그인은 삭제할 수 없습니다.

예시:
- 내 스킬 삭제: id="my-code-reviewer"

주의: 이 작업은 되돌릴 수 없습니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '삭제할 플러그인 ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'check_updates',
    description: `설치된 스킬들의 업데이트를 확인합니다.

로컬에 설치된 스킬 목록과 버전을 전달하면,
최신 버전과 비교하여 업데이트가 필요한 항목을 반환합니다.

예시:
installations: [
  { id: "code-reviewer", version: "1.0.0" },
  { id: "db-helper", version: "2.0.0" }
]`,
    inputSchema: {
      type: 'object',
      properties: {
        installations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '스킬 ID' },
              version: { type: 'string', description: '설치된 버전' },
            },
            required: ['id', 'version'],
          },
          description: '설치된 스킬 목록',
        },
      },
      required: ['installations'],
    },
  },
  {
    name: 'suggest_improvement',
    description: `다른 사람이 만든 플러그인에 개선을 제안합니다.

버그를 발견하거나 기능을 추가했을 때 원작자에게 제안할 수 있습니다.
원작자가 수락하면 플러그인이 자동으로 업데이트됩니다.

예시:
- 버그 수정 제안: pluginId="md2pdf", title="한글 깨짐 수정", description="CJK 폰트 fallback 추가"
- 기능 추가 제안: pluginId="airtable-connect", title="배치 업데이트 기능", description="여러 레코드를 한번에 업데이트"`,
    inputSchema: {
      type: 'object',
      properties: {
        pluginId: {
          type: 'string',
          description: '개선할 플러그인 ID',
        },
        title: {
          type: 'string',
          description: '제안 제목 (간결하게)',
        },
        description: {
          type: 'string',
          description: '상세 설명 (무엇을 왜 변경했는지)',
        },
        diff: {
          type: 'string',
          description: '변경된 코드/내용 (선택)',
        },
        suggestedByName: {
          type: 'string',
          description: '제안자 이름 (선택)',
        },
      },
      required: ['pluginId', 'title', 'description'],
    },
  },
  {
    name: 'list_suggestions',
    description: `플러그인에 대한 개선 제안 목록을 조회합니다.

내 플러그인에 온 제안을 확인하거나, 전체 제안 목록을 볼 수 있습니다.

예시:
- 특정 플러그인 제안 확인: pluginId="md2pdf"
- 대기 중인 제안만: status="pending"
- 전체 제안: (파라미터 없이 호출)`,
    inputSchema: {
      type: 'object',
      properties: {
        pluginId: {
          type: 'string',
          description: '특정 플러그인의 제안만 조회 (선택)',
        },
        status: {
          type: 'string',
          enum: ['pending', 'accepted', 'rejected', 'all'],
          description: '상태 필터 (기본: all)',
        },
        limit: {
          type: 'number',
          description: '최대 결과 수 (기본: 20, 최대: 50)',
        },
      },
    },
  },
  {
    name: 'resolve_suggestion',
    description: `개선 제안을 수락하거나 거부합니다.

수락하면 플러그인 버전이 자동으로 올라갑니다 (patch bump).
제안에 포함된 변경사항은 별도로 적용해야 합니다.

예시:
- 수락: suggestionId="abc123", action="accept", comment="좋은 제안 감사합니다!"
- 거부: suggestionId="abc123", action="reject", comment="현재 구조와 맞지 않아요"`,
    inputSchema: {
      type: 'object',
      properties: {
        suggestionId: {
          type: 'string',
          description: '제안 ID (list_suggestions로 확인)',
        },
        action: {
          type: 'string',
          enum: ['accept', 'reject'],
          description: '수락 또는 거부',
        },
        comment: {
          type: 'string',
          description: '응답 코멘트 (선택)',
        },
      },
      required: ['suggestionId', 'action'],
    },
  },
]

/**
 * 공개 도구 목록 (MCP tools/list에서 반환)
 * 관리자 도구는 제외됩니다.
 */
export const MCP_TOOLS: McpTool[] = ALL_TOOLS.filter(
  (tool) => !isAdminTool(tool.name)
)

/**
 * 이름으로 도구 찾기 (관리자 도구 포함)
 * 내부적으로 도구 실행 시 사용됩니다.
 */
export function getToolByName(name: string): McpTool | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name)
}

/**
 * 공개 도구 이름 목록 반환
 */
export function getAllToolNames(): string[] {
  return MCP_TOOLS.map((tool) => tool.name)
}
