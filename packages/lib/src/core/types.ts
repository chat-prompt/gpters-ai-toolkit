/**
 * Core type definitions
 *
 * Defines shared types, interfaces, and constants used throughout
 * the catalog system including item types, tags, and metadata.
 */

/** Available catalog item types */
export type ItemType = 'skill' | 'agent' | 'command' | 'guide' | 'hook' | 'package'

/**
 * Standard file types for plugin files
 * - script: Executable scripts (js, ts, sh, py) - run with node/bash/python
 * - reference: Reference documents/guides - read for context
 * - template: Templates to copy into project - copy to destination
 * - config: Configuration files - add to project settings
 */
export type FileType = 'script' | 'reference' | 'template' | 'config'

export interface PluginFile {
  name: string
  content: string
  type?: FileType | string
}

export type Difficulty = 'easy' | 'medium' | 'hard'

// Agent model options
export type AgentModel = 'sonnet' | 'opus' | 'haiku' | 'inherit'

// Agent permission mode options
export type AgentPermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'ignore'

// Hook event types
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PermissionRequest'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStop'
  | 'PreCompact'
  | 'SessionStart'
  | 'SessionEnd'

// Hook matcher types (varies by event)
export type HookMatcher = string // e.g., 'auto', 'manual', 'startup', 'resume', 'compact', 'Bash', 'Read', etc.

export interface CatalogItem {
  id: string
  type: ItemType
  name: string
  description: string
  authorId?: string // FK to users table
  authorName?: string // Resolved author name for display
  authorEmail?: string // Resolved author email for display
  tags: string[]
  difficulty?: Difficulty
  pluginId?: string // 플러그인 설치 ID (스킬만)
  estimatedTime?: string // 예상 소요 시간 (가이드)
  dependencies?: string[] // 의존성 목록 (e.g., "mcp:github", "skill:git-commit")
  likes: number // 좋아요 수
  content: string // skill.md 내용
  readme?: string // README.md 내용
  files?: PluginFile[] // 추가 파일들 (스크립트, 레퍼런스 등)

  // Type-specific fields for Claude Code plugins
  allowedTools?: string // Skill/Agent/Command: 사용 가능 도구 (쉼표 구분, e.g., "Read, Grep, Bash")
  // Agent-specific
  agentModel?: AgentModel // Agent 모델 선택
  agentPermissionMode?: AgentPermissionMode // Agent 권한 모드
  agentSkills?: string // Agent에 로드할 스킬 목록 (쉼표 구분)
  // Command-specific
  commandArgumentHint?: string // Command 인자 힌트 (e.g., "[message]")
  commandDisableModelInvocation?: boolean // Command 자동 호출 비활성화

  // Hook-specific
  hookEvent?: HookEvent // Hook 이벤트 타입 (PreCompact, SessionStart 등)
  hookMatcher?: HookMatcher // Matcher (auto, manual, tool name 등)
  hookCommand?: string // 실행할 셸 명령어
  hookTimeout?: number // 타임아웃 (ms)
  hookBlocking?: boolean // 블로킹 여부

  // MCP integration field
  mcpEnabled?: boolean // MCP 서버에서 활성화 여부

  // Version management
  version?: string // 버전 (semver)
  status?: 'draft' | 'published' // 배포 상태
  changelog?: string // 최신 버전 변경 내역

  // Multi-tenancy & collaboration fields
  orgId?: string // Organization owner
  orgName?: string // Organization name (from JOIN)
  visibility?: 'private' | 'public' // Visibility level
  forkedFrom?: string // Original item if this is a fork
  forkCount?: number // Number of times forked

  createdAt?: string
  updatedAt?: string
}

/**
 * Lightweight version of CatalogItem for list views.
 * Excludes heavy fields: content, readme, files, changelog
 * to reduce data transfer and improve performance.
 */
export type CatalogItemSummary = Omit<CatalogItem, 'content' | 'readme' | 'files' | 'changelog'>

/**
 * Package-Item relationship record
 */
export interface PackageItemRelation {
  packageId: string
  itemId: string
  displayOrder: number
}

/**
 * CatalogItem with package contents (for package detail views)
 */
export interface CatalogItemWithPackageContents extends CatalogItem {
  packageContents?: CatalogItemSummary[]
}

export interface Dependency {
  type: 'mcp' | 'skill' | 'agent' | 'other'
  id: string
  label: string
}

export const MCP_SERVERS: Record<string, { label: string; description: string }> = {
  github: { label: 'GitHub MCP', description: 'GitHub API 통합' },
  filesystem: { label: 'Filesystem MCP', description: '파일 시스템 접근' },
  postgresql: { label: 'PostgreSQL MCP', description: 'PostgreSQL 데이터베이스' },
  sqlite: { label: 'SQLite MCP', description: 'SQLite 데이터베이스' },
  slack: { label: 'Slack MCP', description: 'Slack 통합' },
  notion: { label: 'Notion MCP', description: 'Notion API 통합' },
  linear: { label: 'Linear MCP', description: 'Linear 이슈 관리' },
  puppeteer: { label: 'Puppeteer MCP', description: '브라우저 자동화' },
  brave: { label: 'Brave Search MCP', description: '웹 검색' },
}

export function parseDependency(dep: string): Dependency {
  const [type, ...idParts] = dep.split(':')
  const id = idParts.join(':')

  if (type === 'mcp') {
    const mcpInfo = MCP_SERVERS[id]
    return {
      type: 'mcp',
      id,
      label: mcpInfo?.label || `${id} MCP`,
    }
  }

  return {
    type: type as Dependency['type'],
    id,
    label: id,
  }
}

export interface Tag {
  id: string
  label: string
  color: string
}

export const TAGS: Record<string, Tag> = {
  writing: { id: 'writing', label: '문서 작성', color: 'bg-blue-100 text-blue-800' },
  documentation: { id: 'documentation', label: '문서화', color: 'bg-blue-100 text-blue-800' },
  toolkit: { id: 'toolkit', label: 'AI Toolkit', color: 'bg-purple-100 text-purple-800' },
  productivity: { id: 'productivity', label: '생산성', color: 'bg-green-100 text-green-800' },
  collaboration: { id: 'collaboration', label: '협업', color: 'bg-yellow-100 text-yellow-800' },
  code: { id: 'code', label: '코드', color: 'bg-gray-100 text-gray-800' },
  review: { id: 'review', label: '리뷰', color: 'bg-orange-100 text-orange-800' },
  meeting: { id: 'meeting', label: '회의', color: 'bg-pink-100 text-pink-800' },
  analysis: { id: 'analysis', label: '분석', color: 'bg-indigo-100 text-indigo-800' },
  database: { id: 'database', label: '데이터베이스', color: 'bg-cyan-100 text-cyan-800' },
  sql: { id: 'sql', label: 'SQL', color: 'bg-cyan-100 text-cyan-800' },
  debugging: { id: 'debugging', label: '디버깅', color: 'bg-red-100 text-red-800' },
  learning: { id: 'learning', label: '학습', color: 'bg-teal-100 text-teal-800' },
  refactoring: { id: 'refactoring', label: '리팩토링', color: 'bg-violet-100 text-violet-800' },
  api: { id: 'api', label: 'API', color: 'bg-amber-100 text-amber-800' },
  testing: { id: 'testing', label: '테스트', color: 'bg-lime-100 text-lime-800' },
  git: { id: 'git', label: 'Git', color: 'bg-rose-100 text-rose-800' },
  setup: { id: 'setup', label: '설정', color: 'bg-sky-100 text-sky-800' },
  deployment: { id: 'deployment', label: '배포', color: 'bg-emerald-100 text-emerald-800' },
  infrastructure: { id: 'infrastructure', label: '인프라', color: 'bg-slate-100 text-slate-800' },
  beginner: { id: 'beginner', label: '입문', color: 'bg-green-100 text-green-800' },
  image: { id: 'image', label: '이미지', color: 'bg-fuchsia-100 text-fuchsia-800' },
  cdn: { id: 'cdn', label: 'CDN', color: 'bg-violet-100 text-violet-800' },
  domain: { id: 'domain', label: '도메인', color: 'bg-orange-100 text-orange-800' },
  auth: { id: 'auth', label: '인증', color: 'bg-red-100 text-red-800' },
  security: { id: 'security', label: '보안', color: 'bg-red-100 text-red-800' },
  performance: { id: 'performance', label: '성능', color: 'bg-amber-100 text-amber-800' },
  optimization: { id: 'optimization', label: '최적화', color: 'bg-amber-100 text-amber-800' },
  automation: { id: 'automation', label: '자동화', color: 'bg-green-100 text-green-800' },
  workflow: { id: 'workflow', label: '워크플로우', color: 'bg-indigo-100 text-indigo-800' },
  hooks: { id: 'hooks', label: 'Hooks', color: 'bg-purple-100 text-purple-800' },
  markdown: { id: 'markdown', label: 'Markdown', color: 'bg-gray-100 text-gray-800' },
  readme: { id: 'readme', label: 'README', color: 'bg-blue-100 text-blue-800' },
  typescript: { id: 'typescript', label: 'TypeScript', color: 'bg-blue-100 text-blue-800' },
  react: { id: 'react', label: 'React', color: 'bg-cyan-100 text-cyan-800' },
  frontend: { id: 'frontend', label: '프론트엔드', color: 'bg-cyan-100 text-cyan-800' },
  architecture: { id: 'architecture', label: '아키텍처', color: 'bg-slate-100 text-slate-800' },
  'design-pattern': { id: 'design-pattern', label: '디자인패턴', color: 'bg-violet-100 text-violet-800' },
  'unit-test': { id: 'unit-test', label: '유닛테스트', color: 'bg-lime-100 text-lime-800' },
  e2e: { id: 'e2e', label: 'E2E', color: 'bg-lime-100 text-lime-800' },
  vitest: { id: 'vitest', label: 'Vitest', color: 'bg-lime-100 text-lime-800' },
  playwright: { id: 'playwright', label: 'Playwright', color: 'bg-lime-100 text-lime-800' },
  quality: { id: 'quality', label: '품질', color: 'bg-green-100 text-green-800' },
  'clean-code': { id: 'clean-code', label: '클린코드', color: 'bg-green-100 text-green-800' },
  error: { id: 'error', label: '에러', color: 'bg-red-100 text-red-800' },
  fix: { id: 'fix', label: '수정', color: 'bg-orange-100 text-orange-800' },
  airtable: { id: 'airtable', label: 'Airtable', color: 'bg-yellow-100 text-yellow-800' },
  postgresql: { id: 'postgresql', label: 'PostgreSQL', color: 'bg-cyan-100 text-cyan-800' },
  schema: { id: 'schema', label: '스키마', color: 'bg-cyan-100 text-cyan-800' },
  sync: { id: 'sync', label: '동기화', color: 'bg-indigo-100 text-indigo-800' },
  rest: { id: 'rest', label: 'REST', color: 'bg-amber-100 text-amber-800' },
  openapi: { id: 'openapi', label: 'OpenAPI', color: 'bg-amber-100 text-amber-800' },
  jsdoc: { id: 'jsdoc', label: 'JSDoc', color: 'bg-gray-100 text-gray-800' },
  commit: { id: 'commit', label: '커밋', color: 'bg-rose-100 text-rose-800' },
  'pull-request': { id: 'pull-request', label: 'PR', color: 'bg-rose-100 text-rose-800' },
}

export const DIFFICULTY_LABELS: Record<Difficulty, { label: string; color: string; emoji: string }> = {
  easy: { label: '쉬움', color: 'bg-green-100 text-green-800', emoji: '🟢' },
  medium: { label: '보통', color: 'bg-yellow-100 text-yellow-800', emoji: '🟡' },
  hard: { label: '어려움', color: 'bg-red-100 text-red-800', emoji: '🔴' },
}

// Hook event descriptions
export const HOOK_EVENTS: Record<HookEvent, { label: string; description: string; matchers: string[] }> = {
  PreToolUse: {
    label: '도구 실행 전',
    description: '도구가 실행되기 전에 호출됩니다. 도구 실행을 차단하거나 수정할 수 있습니다.',
    matchers: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task', '...'],
  },
  PostToolUse: {
    label: '도구 실행 후',
    description: '도구 실행이 완료된 후 호출됩니다. 결과를 검증하거나 후처리할 수 있습니다.',
    matchers: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task', '...'],
  },
  PermissionRequest: {
    label: '권한 요청',
    description: '권한 요청 시 호출됩니다. 자동 승인/거부 처리가 가능합니다.',
    matchers: ['Bash', 'Read', 'Write', 'Edit', '...'],
  },
  Notification: {
    label: '알림',
    description: '알림 전송 시 호출됩니다. 커스텀 알림 처리가 가능합니다.',
    matchers: [],
  },
  UserPromptSubmit: {
    label: '프롬프트 제출',
    description: '사용자 프롬프트 제출 시 호출됩니다. 프롬프트 검증이나 컨텍스트 추가가 가능합니다.',
    matchers: [],
  },
  Stop: {
    label: '응답 종료',
    description: 'Claude 응답이 종료될 때 호출됩니다.',
    matchers: [],
  },
  SubagentStop: {
    label: '서브에이전트 완료',
    description: '서브에이전트 작업이 완료될 때 호출됩니다.',
    matchers: [],
  },
  PreCompact: {
    label: 'Compaction 전',
    description: 'Compaction 작업 직전에 호출됩니다. Transcript 백업 등에 활용됩니다.',
    matchers: ['auto', 'manual'],
  },
  SessionStart: {
    label: '세션 시작',
    description: '세션이 시작되거나 재개될 때 호출됩니다.',
    matchers: ['startup', 'resume', 'clear', 'compact'],
  },
  SessionEnd: {
    label: '세션 종료',
    description: '세션이 종료될 때 호출됩니다.',
    matchers: [],
  },
}

