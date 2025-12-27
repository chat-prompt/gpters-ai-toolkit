# GPTers AI Toolkit

GPTers 팀을 위한 Claude Code 스킬, 에이전트, 커맨드, 가이드 공유 플랫폼입니다.

## 주요 기능

- **스킬/에이전트 카탈로그** - 팀원들이 만든 리소스를 검색하고 설치
- **MCP 서버 통합** - Claude Code에서 직접 플러그인 검색 및 사용
- **V2 배포 시스템** - 대화 중 만든 스킬을 즉시 팀과 공유
- **자동 버전 관리** - 시맨틱 버저닝 자동 적용

## 빠른 시작

### 1. MCP 서버 연결 (권장)

`~/.claude/settings.json`에 추가:

```json
{
  "mcpServers": {
    "gpters-marketplace": {
      "type": "http",
      "url": "https://company-ai-toolkit.vercel.app/api/mcp"
    }
  }
}
```

### 2. 사용하기

Claude Code에서 자연어로 요청:

```
"코드 리뷰 스킬 찾아줘"
"DB 마이그레이션 도와주는 스킬 있어?"
"이 스킬 팀이랑 공유해줘"  # V2 배포
```

## 프로젝트 구조

```
gpters-ai-toolkit/
├── app/                # Next.js App Router
│   ├── api/            # API 라우트 (MCP, catalog, auth)
│   ├── admin/          # 관리자 대시보드
│   ├── skill/[id]/     # 스킬 상세 페이지
│   ├── agent/[id]/     # 에이전트 상세 페이지
│   └── guides/         # 가이드 페이지
├── components/         # React 컴포넌트
├── lib/                # 유틸리티 및 서비스
│   ├── db/             # Drizzle ORM 스키마
│   ├── mcp/            # MCP 서버 구현
│   └── marketplace/    # GitHub 마켓플레이스 동기화
├── plugins/            # Claude Code 플러그인 정의
├── docs/               # 문서
└── tests/              # 테스트 (Vitest, Playwright)
```

## 기술 스택

- **Framework**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: Neon PostgreSQL + Drizzle ORM
- **Auth**: NextAuth v5 (Google OAuth, @gpters.org 도메인 제한)
- **Testing**: Vitest (unit/API), Playwright (E2E)

## 개발 환경 설정

```bash
# 의존성 설치
pnpm install

# 환경 변수 설정
cp .env.example .env.local
# .env.local 편집

# 개발 서버 실행
pnpm dev

# 테스트
pnpm test          # 유닛 테스트
pnpm test:e2e      # E2E 테스트
```

### 환경 변수

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | Neon PostgreSQL 연결 문자열 |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 시크릿 |
| `GH_TOKEN` | GitHub API 토큰 (마켓플레이스 동기화) |
| `ADMIN_PASSWORD` | 관리자 대시보드 비밀번호 |

## MCP 도구

| 도구 | 설명 |
|------|------|
| `search_plugins` | 키워드로 플러그인 검색 |
| `get_plugin_content` | 플러그인 전체 내용 조회 |
| `list_plugins` | 전체 플러그인 목록 |
| `deploy_skill` | 스킬/에이전트 배포 (V2) |
| `check_updates` | 설치된 스킬 업데이트 확인 |

## 스크립트

```bash
pnpm dev            # 개발 서버
pnpm build          # 프로덕션 빌드
pnpm lint           # ESLint
pnpm test           # 유닛 테스트
pnpm test:e2e       # E2E 테스트
pnpm db:push        # DB 스키마 푸시
pnpm db:studio      # Drizzle Studio
```

## 문서

- [팀 온보딩 가이드](docs/TEAM_ONBOARDING.md)
- [MCP 자동 검색 설정](docs/AUTO_PLUGIN_DISCOVERY.md)
- [V2 아키텍처](docs/ARCHITECTURE_V2.md)

## 기여하기

1. 새 스킬/에이전트 만들기
2. Claude Code에서 `"이 스킬 팀이랑 공유해줘"` 로 배포
3. 또는 웹 관리자 대시보드에서 직접 추가

## 라이선스

Private - GPTers Team Only
