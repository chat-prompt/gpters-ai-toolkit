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
]

export function getToolByName(name: string): McpTool | undefined {
  return MARKETPLACE_TOOLS.find((tool) => tool.name === name)
}

export function getAllToolNames(): string[] {
  return MARKETPLACE_TOOLS.map((tool) => tool.name)
}
