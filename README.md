# GPTers AI Toolkit

GPTers 팀을 위한 Claude Code 스킬, 에이전트, 커맨드, 가이드, 훅 공유 플랫폼입니다.

## 주요 기능

### 콘텐츠 관리
- **스킬/에이전트/커맨드 카탈로그** - 팀원들이 만든 리소스를 검색, 필터링, 설치
- **가이드 시스템** - 팀 내 지식 공유 및 온보딩 문서
- **훅 설정 관리** - Claude Code 훅 설정을 시각적으로 관리

### MCP 통합
- **MCP 서버** - Claude Code에서 직접 플러그인 검색 및 사용
- **자연어 검색** - "코드 리뷰 도와주는 스킬 찾아줘" 같은 요청 지원
- **V2 배포 시스템** - 대화 중 만든 스킬을 즉시 팀과 공유
- **MCP 상태 모니터링** - 헤더에서 실시간 서버 상태 확인

### 상세 페이지 기능
- **사용 예시 자동 추출** - 마크다운에서 Examples 섹션 파싱 및 표시
- **관련 아이템 추천** - 태그/작성자 기반 스코어링으로 관련 콘텐츠 추천
- **ZIP 다운로드** - 원클릭으로 전체 파일 다운로드
- **인터랙티브 목차** - 섹션별 빠른 네비게이션
- **설치 가이드** - 복사 가능한 설치 명령어 제공

### 관리 기능
- **드래프트/발행 관리** - 작성 중인 콘텐츠와 발행된 콘텐츠 분리
- **버전 관리** - 시맨틱 버저닝 및 변경 이력 추적
- **태그 시스템** - 카테고리별 분류 및 필터링
- **좋아요/북마크** - 개인화된 콘텐츠 관리

## 빠른 시작

### 1. MCP 서버 연결 (OAuth 인증)

터미널에서 아래 명령어를 실행하세요:

```bash
claude mcp add gpters-ai-toolkit https://company-ai-toolkit.vercel.app/api/mcp -t http
```

브라우저에서 Google (@gpters.org) 로그인 후 자동 연결됩니다.

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
├── app/                          # Next.js App Router
│   ├── api/                      # API 라우트
│   │   ├── catalog/              # 카탈로그 CRUD + ZIP 다운로드
│   │   ├── mcp/                  # MCP 서버 엔드포인트 + 상태
│   │   ├── marketplace/          # GitHub 플러그인 동기화
│   │   ├── installations/        # 설치 추적
│   │   ├── updates/              # 버전 체크
│   │   ├── admin/                # 관리자 API
│   │   └── auth/                 # NextAuth 라우트
│   ├── skill/[id]/               # 스킬 상세 페이지
│   ├── agent/[id]/               # 에이전트 상세 페이지
│   ├── command/[id]/             # 커맨드 상세 페이지
│   ├── hook/[id]/                # 훅 설정 페이지
│   ├── guides/                   # 가이드 목록 및 상세
│   ├── admin/                    # 관리자 대시보드
│   ├── playground/[id]/          # 스킬 테스트 환경
│   ├── profile/                  # 사용자 프로필
│   └── upload/                   # 파일 업로드
│
├── components/                   # React 컴포넌트 (50+)
│   ├── SearchableCatalog.tsx     # 메인 검색 인터페이스
│   ├── DetailPageLayout.tsx      # 상세 페이지 템플릿
│   ├── ExamplesSection.tsx       # 사용 예시 표시
│   ├── RelatedItems.tsx          # 관련 아이템 추천
│   ├── DownloadButton.tsx        # ZIP 다운로드
│   ├── MCPStatus.tsx             # MCP 상태 인디케이터
│   ├── InstallGuide.tsx          # 설치 가이드
│   ├── MCPConfigGenerator.tsx    # MCP 설정 생성기
│   ├── HookConfigGenerator.tsx   # 훅 설정 마법사
│   └── ...                       # 기타 컴포넌트
│
├── lib/                          # 비즈니스 로직
│   ├── db/                       # Drizzle ORM 스키마
│   ├── mcp/                      # MCP 서버 구현
│   ├── marketplace/              # 플러그인 동기화
│   ├── catalog.ts                # 카탈로그 CRUD
│   ├── parse-examples.ts         # 예시 파싱 유틸리티
│   ├── auth.ts                   # 인증 설정
│   ├── rate-limit.ts             # Rate limiting
│   └── rbac.ts                   # 역할 기반 접근 제어
│
├── plugins/                      # Claude Code 플러그인 정의
├── docs/                         # 문서
└── tests/                        # 테스트 (Vitest, Playwright)
```

## 기술 스택

| 분류 | 기술 |
|------|------|
| **Framework** | Next.js 16, React 19, TypeScript |
| **Styling** | Tailwind CSS v4 |
| **Database** | Neon PostgreSQL + Drizzle ORM |
| **Auth** | NextAuth v5 (Google OAuth, @gpters.org 도메인 제한) |
| **Testing** | Vitest (unit/API), Playwright (E2E) |
| **Deployment** | Vercel |

## 데이터 모델

### 아이템 타입

| 타입 | 설명 | 주요 필드 |
|------|------|-----------|
| `skill` | Claude Code 스킬 | `allowedTools`, `content` |
| `agent` | AI 에이전트 | `agentModel`, `agentPermissionMode`, `agentSkills` |
| `command` | 슬래시 커맨드 | `commandArgumentHint`, `commandDisableModelInvocation` |
| `guide` | 가이드 문서 | `content`, `readme` |
| `hook` | 훅 설정 | `hookEvent`, `hookMatcher`, `hookCommand`, `hookBlocking` |

### 공통 필드

- **기본**: `id`, `name`, `description`, `author`, `status` (draft/published)
- **콘텐츠**: `content`, `readme`, `files` (추가 파일 배열)
- **메타데이터**: `tags`, `teamTag`, `difficulty`, `likes`
- **버전**: `version`, `changelog`
- **타임스탬프**: `createdAt`, `updatedAt`

## API 엔드포인트

### 카탈로그 API

| 메소드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `GET` | `/api/catalog` | 아이템 목록 (필터링, 검색 지원) |
| `POST` | `/api/catalog` | 새 아이템 생성 |
| `GET` | `/api/catalog/[id]` | 아이템 상세 조회 |
| `PATCH` | `/api/catalog/[id]` | 아이템 수정 |
| `DELETE` | `/api/catalog/[id]` | 아이템 삭제 |
| `GET` | `/api/catalog/[id]/download` | ZIP 파일 다운로드 |
| `HEAD` | `/api/catalog/[id]/download` | 다운로드 메타데이터 (파일 수, 크기) |

### MCP 서버 API

| 메소드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `POST` | `/api/mcp` | JSON-RPC 2.0 요청 처리 |
| `GET` | `/api/mcp/status` | 서버 상태 및 헬스 체크 |
| `POST` | `/api/mcp?action=search` | 플러그인 검색 (REST) |
| `POST` | `/api/mcp?action=get` | 플러그인 조회 (REST) |
| `POST` | `/api/mcp?action=list` | 전체 목록 (REST) |

### 기타 API

| 엔드포인트 | 설명 |
|-----------|------|
| `/api/installations` | 설치 추적 및 통계 |
| `/api/updates/check` | 버전 업데이트 확인 |
| `/api/likes/[id]` | 좋아요 토글 |
| `/api/authors` | 작성자 목록 |
| `/api/tags` | 태그 목록 |

## MCP 도구

| 도구 | 설명 |
|------|------|
| `search_plugins` | 키워드/카테고리로 플러그인 검색 |
| `get_plugin_content` | 플러그인 전체 내용 조회 |
| `list_plugins` | 전체 플러그인 목록 |
| `deploy_skill` | 스킬/에이전트 배포 (V2) |
| `check_updates` | 설치된 스킬 업데이트 확인 |

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
pnpm test          # 유닛 + API 테스트
pnpm test:e2e      # E2E 테스트
pnpm lint          # ESLint
```

### 환경 변수

| 변수 | 설명 | 필수 |
|------|------|------|
| `DATABASE_URL` | Neon PostgreSQL 연결 문자열 | ✅ |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID | ✅ |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 시크릿 | ✅ |
| `NEXTAUTH_SECRET` | NextAuth 시크릿 | ✅ |
| `GH_TOKEN` | GitHub API 토큰 (마켓플레이스 동기화) | |
| `DEV_BYPASS_AUTH` | 개발 환경 인증 우회 (`true`로 설정) | |

## 스크립트

```bash
# 개발
pnpm dev            # 개발 서버 (포트 3000)
pnpm build          # 프로덕션 빌드
pnpm start          # 프로덕션 서버

# 품질
pnpm lint           # ESLint
pnpm test           # 유닛 + API 테스트
pnpm test:watch     # 테스트 워치 모드
pnpm test:api       # API 테스트만
pnpm test:e2e       # E2E 테스트
pnpm test:e2e:ui    # E2E UI 모드
pnpm test:all       # 전체 테스트

# 데이터베이스
pnpm db:generate    # 마이그레이션 생성
pnpm db:push        # 스키마 푸시
pnpm db:studio      # Drizzle Studio
```

## 주요 컴포넌트

### 페이지 컴포넌트

| 컴포넌트 | 설명 |
|----------|------|
| `SearchableCatalog` | 메인 검색/필터링 인터페이스 |
| `DetailPageLayout` | 상세 페이지 레이아웃 템플릿 |
| `ItemHero` | 아이템 헤더 (메타데이터, 액션 버튼) |
| `TableOfContents` | 페이지 내 네비게이션 |

### 콘텐츠 컴포넌트

| 컴포넌트 | 설명 |
|----------|------|
| `ContentSection` | 마크다운 콘텐츠 렌더링 |
| `ExamplesSection` | 사용 예시 표시 (input/output 분리) |
| `RelatedItems` | 관련 아이템 그리드 |
| `InstallGuide` | 설치 가이드 (복사 가능) |

### 유틸리티 컴포넌트

| 컴포넌트 | 설명 |
|----------|------|
| `DownloadButton` | ZIP 다운로드 버튼 |
| `MCPStatus` | MCP 서버 상태 인디케이터 |
| `MCPConfigGenerator` | MCP 설정 생성기 |
| `HookConfigGenerator` | 훅 설정 마법사 |
| `DraftBanner` | 드래프트 상태 배너 |

## 보안

- **인증**: NextAuth v5 + Google OAuth (@gpters.org 도메인만)
- **MCP 인증**: OAuth 2.1 (브라우저 로그인)
- **권한**: RBAC (admin, editor, viewer 역할)
- **Rate Limiting**: IP 기반 제한
- **개발 모드**: `DEV_BYPASS_AUTH=true`로 인증 우회

## 문서

- [팀 온보딩 가이드](docs/TEAM_ONBOARDING.md)
- [MCP 자동 검색 설정](docs/AUTO_PLUGIN_DISCOVERY.md)
- [V2 아키텍처](docs/ARCHITECTURE_V2.md)

## 기여하기

1. 새 스킬/에이전트 만들기
2. Claude Code에서 `"이 스킬 팀이랑 공유해줘"`로 배포
3. 또는 웹 관리자 대시보드(`/admin`)에서 직접 추가

## 라이선스

Private - GPTers Team Only
