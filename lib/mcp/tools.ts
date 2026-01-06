/**
 * MCP Tool Definitions for GPTers Marketplace
 *
 * These tools allow Claude Code to search and retrieve plugins
 * from the GPTers marketplace dynamically.
 */

import type { McpTool } from './types'

export const MARKETPLACE_TOOLS: McpTool[] = [
  {
    name: 'search_plugins',
    description: `마켓플레이스에서 플러그인을 검색합니다.
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
    description: `마켓플레이스의 모든 플러그인 목록을 조회합니다.
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
    description: `새 플러그인을 마켓플레이스에 생성합니다.
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
          description: '마켓플레이스 공개 여부 (기본: false)',
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
          description: '마켓플레이스 공개 여부',
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
    description: `스킬/에이전트/커맨드를 GPTers 팀에 배포합니다.

현재 대화에서 만든 스킬을 팀과 공유할 때 사용합니다.
버전은 자동으로 관리됩니다:
- 신규: 1.0.0
- 기존 업데이트: 변경 내용에 따라 자동 bump (patch/minor/major)

예시:
- 새 스킬 배포: type="skill", name="코드 리뷰어", content="..."
- 기존 스킬 업데이트: id="code-reviewer", content="...", changelog="보안 체크 추가"`,
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['skill', 'agent', 'command', 'hook'],
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
]

export function getToolByName(name: string): McpTool | undefined {
  return MARKETPLACE_TOOLS.find((tool) => tool.name === name)
}

export function getAllToolNames(): string[] {
  return MARKETPLACE_TOOLS.map((tool) => tool.name)
}
