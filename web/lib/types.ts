export type ItemType = 'skill' | 'agent' | 'prompt' | 'command' | 'guide'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface CatalogItem {
  id: string
  type: ItemType
  name: string
  description: string
  author: string
  tags: string[]
  difficulty?: Difficulty
  pluginId?: string // 플러그인 설치 ID (스킬만)
  estimatedTime?: string // 예상 소요 시간 (가이드)
  dependencies?: string[] // 의존성 목록 (e.g., "mcp:github", "skill:git-commit")
  likes: number // 좋아요 수
  content: string // skill.md 내용
  readme?: string // README.md 내용
  createdAt?: string
  updatedAt?: string
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
  // Guide tags
  setup: { id: 'setup', label: '설정', color: 'bg-sky-100 text-sky-800' },
  deployment: { id: 'deployment', label: '배포', color: 'bg-emerald-100 text-emerald-800' },
  infrastructure: { id: 'infrastructure', label: '인프라', color: 'bg-slate-100 text-slate-800' },
  beginner: { id: 'beginner', label: '입문', color: 'bg-green-100 text-green-800' },
  image: { id: 'image', label: '이미지', color: 'bg-fuchsia-100 text-fuchsia-800' },
  cdn: { id: 'cdn', label: 'CDN', color: 'bg-violet-100 text-violet-800' },
  domain: { id: 'domain', label: '도메인', color: 'bg-orange-100 text-orange-800' },
  auth: { id: 'auth', label: '인증', color: 'bg-red-100 text-red-800' },
}

export const DIFFICULTY_LABELS: Record<Difficulty, { label: string; color: string; emoji: string }> = {
  easy: { label: '쉬움', color: 'bg-green-100 text-green-800', emoji: '🟢' },
  medium: { label: '보통', color: 'bg-yellow-100 text-yellow-800', emoji: '🟡' },
  hard: { label: '어려움', color: 'bg-red-100 text-red-800', emoji: '🔴' },
}
