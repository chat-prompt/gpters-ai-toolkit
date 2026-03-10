-- Add metadata columns to mcp_servers for exercise-aware skill search (DEV-3061)
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "install_command" text;
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "npm_package" text;
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "github_repo" text;
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "platforms" text[];
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "use_cases" text[];
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "fallback_approach" text;
ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone;

-- Upsert 15 MCP servers with full metadata
-- Existing 9 servers get metadata update, 6 new servers added
INSERT INTO "mcp_servers" (id, label, description, documentation_url, install_command, npm_package, github_repo, platforms, use_cases, fallback_approach)
VALUES
  -- Existing 9 servers (update metadata)
  ('github', 'GitHub MCP', 'GitHub API 통합 — 레포, 이슈, PR, 코드 검색', 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
   'claude mcp add github -- npx -y @modelcontextprotocol/server-github', '@modelcontextprotocol/server-github', 'modelcontextprotocol/servers',
   ARRAY['claude-code', 'cursor', 'opencode', 'codex'], ARRAY['코드 리뷰', 'PR 생성', '이슈 관리', '코드 검색'],
   'gh CLI 또는 GitHub REST API 직접 호출'),

  ('filesystem', 'Filesystem MCP', '로컬 파일 시스템 읽기/쓰기/검색', 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
   'claude mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /path/to/dir', '@modelcontextprotocol/server-filesystem', 'modelcontextprotocol/servers',
   ARRAY['claude-code', 'cursor', 'opencode'], ARRAY['파일 탐색', '프로젝트 구조 분석', '설정 파일 수정'],
   'Node.js fs 모듈 또는 shell 명령어'),

  ('postgresql', 'PostgreSQL MCP', 'PostgreSQL 데이터베이스 쿼리 및 스키마 탐색', 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
   'claude mcp add postgresql -- npx -y @modelcontextprotocol/server-postgres $DATABASE_URL', '@modelcontextprotocol/server-postgres', 'modelcontextprotocol/servers',
   ARRAY['claude-code', 'cursor', 'opencode'], ARRAY['DB 스키마 분석', 'SQL 쿼리 실행', '데이터 마이그레이션'],
   'psql CLI 또는 Drizzle/Prisma ORM 직접 사용'),

  ('sqlite', 'SQLite MCP', 'SQLite 데이터베이스 쿼리 및 관리', 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
   'claude mcp add sqlite -- npx -y @modelcontextprotocol/server-sqlite /path/to/db.sqlite', '@modelcontextprotocol/server-sqlite', 'modelcontextprotocol/servers',
   ARRAY['claude-code', 'cursor'], ARRAY['로컬 DB 관리', '프로토타이핑', '임베디드 DB'],
   'sqlite3 CLI 또는 better-sqlite3 라이브러리'),

  ('slack', 'Slack MCP', 'Slack 워크스페이스 메시지 및 채널 관리', 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
   'claude mcp add slack -- npx -y @modelcontextprotocol/server-slack', '@modelcontextprotocol/server-slack', 'modelcontextprotocol/servers',
   ARRAY['claude-code', 'cursor'], ARRAY['팀 알림 전송', '채널 메시지 검색', '워크플로우 자동화'],
   'Slack Web API 또는 Slack Bolt SDK'),

  ('notion', 'Notion MCP', 'Notion 페이지/데이터베이스 읽기 및 수정', 'https://github.com/modelcontextprotocol/servers/tree/main/src/notion',
   'claude mcp add notion -- npx -y @notionhq/notion-mcp-server', '@notionhq/notion-mcp-server', 'modelcontextprotocol/servers',
   ARRAY['claude-code', 'cursor'], ARRAY['문서 관리', '프로젝트 DB 조회', '회의록 정리'],
   'Notion API SDK (@notionhq/client)'),

  ('linear', 'Linear MCP', 'Linear 이슈 및 프로젝트 관리', 'https://github.com/jerhadf/linear-mcp-server',
   'claude mcp add linear -- npx -y @linear/mcp-server', '@linear/mcp-server', 'jerhadf/linear-mcp-server',
   ARRAY['claude-code', 'cursor'], ARRAY['이슈 생성/조회', '스프린트 관리', '프로젝트 트래킹'],
   'Linear GraphQL API 또는 linear SDK'),

  ('puppeteer', 'Puppeteer MCP', '브라우저 자동화 및 웹 스크래핑', 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
   'claude mcp add puppeteer -- npx -y @modelcontextprotocol/server-puppeteer', '@modelcontextprotocol/server-puppeteer', 'modelcontextprotocol/servers',
   ARRAY['claude-code', 'cursor'], ARRAY['웹 스크래핑', '스크린샷 캡처', 'E2E 테스트 보조'],
   'Puppeteer 또는 Playwright 직접 사용'),

  ('brave', 'Brave Search MCP', '웹 검색 및 정보 수집', 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
   'claude mcp add brave-search -- npx -y @modelcontextprotocol/server-brave-search', '@modelcontextprotocol/server-brave-search', 'modelcontextprotocol/servers',
   ARRAY['claude-code', 'cursor'], ARRAY['웹 검색', '최신 정보 조회', '기술 문서 검색'],
   'Brave Search API 직접 호출 또는 다른 검색 API'),

  -- 6 new servers (Rona 37개 도구 교집합 기반)
  ('stripe', 'Stripe MCP', 'Stripe 결제 API 통합 — 고객, 결제, 구독 관리', 'https://github.com/stripe/agent-toolkit',
   'claude mcp add stripe -- npx -y @stripe/agent-toolkit-mcp --tools=all --api-key=$STRIPE_SECRET_KEY', '@stripe/agent-toolkit-mcp', 'stripe/agent-toolkit',
   ARRAY['claude-code', 'cursor', 'opencode'], ARRAY['결제 연동', '구독 관리', '인보이스 생성', '고객 관리'],
   'stripe npm 패키지로 직접 API 호출'),

  ('supabase', 'Supabase MCP', 'Supabase 프로젝트 및 데이터베이스 관리', 'https://github.com/supabase-community/supabase-mcp',
   'claude mcp add supabase -- npx -y supabase-mcp-server', 'supabase-mcp-server', 'supabase-community/supabase-mcp',
   ARRAY['claude-code', 'cursor', 'opencode'], ARRAY['DB 쿼리', '인증 설정', '스토리지 관리', 'Edge Functions'],
   'supabase CLI 또는 @supabase/supabase-js SDK'),

  ('playwright', 'Playwright MCP', 'Playwright 브라우저 자동화 및 E2E 테스트', 'https://github.com/microsoft/playwright-mcp',
   'claude mcp add playwright -- npx -y @playwright/mcp@latest', '@playwright/mcp', 'microsoft/playwright-mcp',
   ARRAY['claude-code', 'cursor', 'opencode'], ARRAY['E2E 테스트', '브라우저 자동화', '스크린샷 비교', '접근성 테스트'],
   'npx playwright test 직접 실행'),

  ('sentry', 'Sentry MCP', 'Sentry 에러 모니터링 및 이슈 조회', 'https://github.com/getsentry/sentry-mcp',
   'claude mcp add sentry -- npx -y @sentry/mcp-server', '@sentry/mcp-server', 'getsentry/sentry-mcp',
   ARRAY['claude-code', 'cursor'], ARRAY['에러 모니터링', '이슈 디버깅', '성능 추적'],
   'Sentry API 직접 호출 또는 @sentry/node SDK'),

  ('context7', 'Context7 MCP', '라이브러리 최신 문서 및 코드 예제 조회', 'https://github.com/upstash/context7',
   'claude mcp add context7 -- npx -y @upstash/context7-mcp@latest', '@upstash/context7-mcp', 'upstash/context7',
   ARRAY['claude-code', 'cursor', 'opencode', 'codex'], ARRAY['최신 문서 조회', '코드 예제 검색', '라이브러리 버전 확인'],
   'Context7 REST API (/api/v2/libs/search, /api/v2/context)'),

  ('vercel', 'Vercel MCP', 'Vercel 프로젝트 배포 및 관리', 'https://github.com/vercel/vercel-mcp',
   'claude mcp add vercel -- npx -y @vercel/mcp@latest', '@vercel/mcp', 'vercel/vercel-mcp',
   ARRAY['claude-code', 'cursor'], ARRAY['프로젝트 배포', '환경변수 관리', '도메인 설정', '빌드 로그 조회'],
   'vercel CLI 직접 사용')

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
  updated_at = NOW();
