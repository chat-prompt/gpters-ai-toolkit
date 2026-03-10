/**
 * Migration script for mcp_servers table metadata columns + 15 server seed (DEV-3061)
 *
 * Usage: set -a && source .env.local && set +a && node scripts/migrate-mcp-servers.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { neon } = require('../node_modules/.pnpm/@neondatabase+serverless@1.0.2/node_modules/@neondatabase/serverless/index.js')

const sql = neon(process.env.DATABASE_URL)

const ALTER_STATEMENTS = [
  'ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS install_command text',
  'ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS npm_package text',
  'ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS github_repo text',
  'ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS platforms text[]',
  'ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS use_cases text[]',
  'ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS fallback_approach text',
  'ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone',
]

const SEED_DATA = [
  {
    id: 'github', label: 'GitHub MCP',
    description: 'GitHub API 통합 — 레포, 이슈, PR, 코드 검색',
    documentation_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    install_command: 'claude mcp add github -- npx -y @modelcontextprotocol/server-github',
    npm_package: '@modelcontextprotocol/server-github',
    github_repo: 'modelcontextprotocol/servers',
    platforms: ['claude-code', 'cursor', 'opencode', 'codex'],
    use_cases: ['코드 리뷰', 'PR 생성', '이슈 관리', '코드 검색'],
    fallback_approach: 'gh CLI 또는 GitHub REST API 직접 호출',
  },
  {
    id: 'filesystem', label: 'Filesystem MCP',
    description: '로컬 파일 시스템 읽기/쓰기/검색',
    documentation_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    install_command: 'claude mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /path/to/dir',
    npm_package: '@modelcontextprotocol/server-filesystem',
    github_repo: 'modelcontextprotocol/servers',
    platforms: ['claude-code', 'cursor', 'opencode'],
    use_cases: ['파일 탐색', '프로젝트 구조 분석', '설정 파일 수정'],
    fallback_approach: 'Node.js fs 모듈 또는 shell 명령어',
  },
  {
    id: 'postgresql', label: 'PostgreSQL MCP',
    description: 'PostgreSQL 데이터베이스 쿼리 및 스키마 탐색',
    documentation_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    install_command: 'claude mcp add postgresql -- npx -y @modelcontextprotocol/server-postgres $DATABASE_URL',
    npm_package: '@modelcontextprotocol/server-postgres',
    github_repo: 'modelcontextprotocol/servers',
    platforms: ['claude-code', 'cursor', 'opencode'],
    use_cases: ['DB 스키마 분석', 'SQL 쿼리 실행', '데이터 마이그레이션'],
    fallback_approach: 'psql CLI 또는 Drizzle/Prisma ORM 직접 사용',
  },
  {
    id: 'sqlite', label: 'SQLite MCP',
    description: 'SQLite 데이터베이스 쿼리 및 관리',
    documentation_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
    install_command: 'claude mcp add sqlite -- npx -y @modelcontextprotocol/server-sqlite /path/to/db.sqlite',
    npm_package: '@modelcontextprotocol/server-sqlite',
    github_repo: 'modelcontextprotocol/servers',
    platforms: ['claude-code', 'cursor'],
    use_cases: ['로컬 DB 관리', '프로토타이핑', '임베디드 DB'],
    fallback_approach: 'sqlite3 CLI 또는 better-sqlite3 라이브러리',
  },
  {
    id: 'slack', label: 'Slack MCP',
    description: 'Slack 워크스페이스 메시지 및 채널 관리',
    documentation_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    install_command: 'claude mcp add slack -- npx -y @modelcontextprotocol/server-slack',
    npm_package: '@modelcontextprotocol/server-slack',
    github_repo: 'modelcontextprotocol/servers',
    platforms: ['claude-code', 'cursor'],
    use_cases: ['팀 알림 전송', '채널 메시지 검색', '워크플로우 자동화'],
    fallback_approach: 'Slack Web API 또는 Slack Bolt SDK',
  },
  {
    id: 'notion', label: 'Notion MCP',
    description: 'Notion 페이지/데이터베이스 읽기 및 수정',
    documentation_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/notion',
    install_command: 'claude mcp add notion -- npx -y @notionhq/notion-mcp-server',
    npm_package: '@notionhq/notion-mcp-server',
    github_repo: 'modelcontextprotocol/servers',
    platforms: ['claude-code', 'cursor'],
    use_cases: ['문서 관리', '프로젝트 DB 조회', '회의록 정리'],
    fallback_approach: 'Notion API SDK (@notionhq/client)',
  },
  {
    id: 'linear', label: 'Linear MCP',
    description: 'Linear 이슈 및 프로젝트 관리',
    documentation_url: 'https://github.com/jerhadf/linear-mcp-server',
    install_command: 'claude mcp add linear -- npx -y @linear/mcp-server',
    npm_package: '@linear/mcp-server',
    github_repo: 'jerhadf/linear-mcp-server',
    platforms: ['claude-code', 'cursor'],
    use_cases: ['이슈 생성/조회', '스프린트 관리', '프로젝트 트래킹'],
    fallback_approach: 'Linear GraphQL API 또는 linear SDK',
  },
  {
    id: 'puppeteer', label: 'Puppeteer MCP',
    description: '브라우저 자동화 및 웹 스크래핑',
    documentation_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    install_command: 'claude mcp add puppeteer -- npx -y @modelcontextprotocol/server-puppeteer',
    npm_package: '@modelcontextprotocol/server-puppeteer',
    github_repo: 'modelcontextprotocol/servers',
    platforms: ['claude-code', 'cursor'],
    use_cases: ['웹 스크래핑', '스크린샷 캡처', 'E2E 테스트 보조'],
    fallback_approach: 'Puppeteer 또는 Playwright 직접 사용',
  },
  {
    id: 'brave', label: 'Brave Search MCP',
    description: '웹 검색 및 정보 수집',
    documentation_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    install_command: 'claude mcp add brave-search -- npx -y @modelcontextprotocol/server-brave-search',
    npm_package: '@modelcontextprotocol/server-brave-search',
    github_repo: 'modelcontextprotocol/servers',
    platforms: ['claude-code', 'cursor'],
    use_cases: ['웹 검색', '최신 정보 조회', '기술 문서 검색'],
    fallback_approach: 'Brave Search API 직접 호출 또는 다른 검색 API',
  },
  // 6 new servers
  {
    id: 'stripe', label: 'Stripe MCP',
    description: 'Stripe 결제 API 통합 — 고객, 결제, 구독 관리',
    documentation_url: 'https://github.com/stripe/agent-toolkit',
    install_command: 'claude mcp add stripe -- npx -y @stripe/agent-toolkit-mcp --tools=all --api-key=$STRIPE_SECRET_KEY',
    npm_package: '@stripe/agent-toolkit-mcp',
    github_repo: 'stripe/agent-toolkit',
    platforms: ['claude-code', 'cursor', 'opencode'],
    use_cases: ['결제 연동', '구독 관리', '인보이스 생성', '고객 관리'],
    fallback_approach: 'stripe npm 패키지로 직접 API 호출',
  },
  {
    id: 'supabase', label: 'Supabase MCP',
    description: 'Supabase 프로젝트 및 데이터베이스 관리',
    documentation_url: 'https://github.com/supabase-community/supabase-mcp',
    install_command: 'claude mcp add supabase -- npx -y supabase-mcp-server',
    npm_package: 'supabase-mcp-server',
    github_repo: 'supabase-community/supabase-mcp',
    platforms: ['claude-code', 'cursor', 'opencode'],
    use_cases: ['DB 쿼리', '인증 설정', '스토리지 관리', 'Edge Functions'],
    fallback_approach: 'supabase CLI 또는 @supabase/supabase-js SDK',
  },
  {
    id: 'playwright', label: 'Playwright MCP',
    description: 'Playwright 브라우저 자동화 및 E2E 테스트',
    documentation_url: 'https://github.com/microsoft/playwright-mcp',
    install_command: 'claude mcp add playwright -- npx -y @playwright/mcp@latest',
    npm_package: '@playwright/mcp',
    github_repo: 'microsoft/playwright-mcp',
    platforms: ['claude-code', 'cursor', 'opencode'],
    use_cases: ['E2E 테스트', '브라우저 자동화', '스크린샷 비교', '접근성 테스트'],
    fallback_approach: 'npx playwright test 직접 실행',
  },
  {
    id: 'sentry', label: 'Sentry MCP',
    description: 'Sentry 에러 모니터링 및 이슈 조회',
    documentation_url: 'https://github.com/getsentry/sentry-mcp',
    install_command: 'claude mcp add sentry -- npx -y @sentry/mcp-server',
    npm_package: '@sentry/mcp-server',
    github_repo: 'getsentry/sentry-mcp',
    platforms: ['claude-code', 'cursor'],
    use_cases: ['에러 모니터링', '이슈 디버깅', '성능 추적'],
    fallback_approach: 'Sentry API 직접 호출 또는 @sentry/node SDK',
  },
  {
    id: 'context7', label: 'Context7 MCP',
    description: '라이브러리 최신 문서 및 코드 예제 조회',
    documentation_url: 'https://github.com/upstash/context7',
    install_command: 'claude mcp add context7 -- npx -y @upstash/context7-mcp@latest',
    npm_package: '@upstash/context7-mcp',
    github_repo: 'upstash/context7',
    platforms: ['claude-code', 'cursor', 'opencode', 'codex'],
    use_cases: ['최신 문서 조회', '코드 예제 검색', '라이브러리 버전 확인'],
    fallback_approach: 'Context7 REST API (/api/v2/libs/search, /api/v2/context)',
  },
  {
    id: 'vercel', label: 'Vercel MCP',
    description: 'Vercel 프로젝트 배포 및 관리',
    documentation_url: 'https://github.com/vercel/vercel-mcp',
    install_command: 'claude mcp add vercel -- npx -y @vercel/mcp@latest',
    npm_package: '@vercel/mcp',
    github_repo: 'vercel/vercel-mcp',
    platforms: ['claude-code', 'cursor'],
    use_cases: ['프로젝트 배포', '환경변수 관리', '도메인 설정', '빌드 로그 조회'],
    fallback_approach: 'vercel CLI 직접 사용',
  },
]

async function run() {
  console.log('=== MCP Servers Migration (DEV-3061) ===\n')

  // Step 1: Add columns
  console.log('Step 1: Adding columns...')
  for (const stmt of ALTER_STATEMENTS) {
    await sql.query(stmt)
    console.log('  OK:', stmt.split('IF NOT EXISTS ')[1])
  }

  // Step 2: Upsert seed data
  console.log('\nStep 2: Upserting 15 MCP servers...')
  for (const server of SEED_DATA) {
    await sql`
      INSERT INTO mcp_servers (id, label, description, documentation_url, install_command, npm_package, github_repo, platforms, use_cases, fallback_approach, updated_at)
      VALUES (${server.id}, ${server.label}, ${server.description}, ${server.documentation_url},
              ${server.install_command}, ${server.npm_package}, ${server.github_repo},
              ${server.platforms}, ${server.use_cases}, ${server.fallback_approach}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        documentation_url = EXCLUDED.documentation_url,
        install_command = EXCLUDED.install_command,
        npm_package = EXCLUDED.npm_package,
        github_repo = EXCLUDED.github_repo,
        platforms = EXCLUDED.platforms,
        use_cases = EXCLUDED.use_cases,
        fallback_approach = EXCLUDED.fallback_approach,
        updated_at = NOW()
    `
    console.log('  OK:', server.id, '-', server.label)
  }

  // Step 3: Verify
  const result = await sql`SELECT id, label, install_command IS NOT NULL as has_install FROM mcp_servers ORDER BY id`
  console.log('\nStep 3: Verification')
  console.log(`  Total servers: ${result.length}`)
  console.log('  Servers:', result.map(r => r.id).join(', '))

  console.log('\n=== Migration complete ===')
}

run().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
