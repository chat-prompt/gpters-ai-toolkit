# GPTers AI Toolkit

GPTers 팀을 위한 AI 코딩 스킬, 에이전트, 커맨드, 가이드, 훅 공유 플랫폼입니다.

비개발자의 바이브 코딩 과정에서 발생하는 노하우를 체계적으로 축적하고, 반복 패턴을 Skill/Command/Guide로 정제하여 팀 전체에 공유하는 **생산성 복리 엔진**입니다.

## 생산성 복리 엔진

> 코칭 과정에서 발생하는 노하우가 휘발되지 않고, 재사용 가능한 형태로 축적되어 팀 전체의 생산성이 복리처럼 성장하는 구조

![복리 엔진 흐름도](docs/compound_productivity_engine.png)

### 핵심 지표 (2026-02-06 기준)

| 지표 | 수치 |
|------|------|
| 등록된 스킬 | 32개 |
| 주간 스킬 조회 | 47회 |
| 주간 검색 | 1,054회 |
| TOP 활용 스킬 | Internal API 가이드, PostgreSQL 접근 가이드, create-issue |

### 마일스톤 현황

| 마일스톤 | 진행률 | 설명 |
|----------|--------|------|
| 생산성 복리엔진 툴킷 | 91% | MCP 서버, 배포 시스템, 의미 기반 검색 |
| 최신 AI 개발 기술 검증 | 100% | bkit, Ralph, Spec-driven 등 검증 |
| 바이브코딩 프로젝트 중앙 관리 | 100% | CodeRabbit 연동, PR 권한, 레포 관리 |
| 바이브코딩 가이드 이슈 모음 | 95% | 비개발자 Q&A 축적 및 패턴 식별 |

## 주요 기능

### 콘텐츠 관리

- **스킬/에이전트/커맨드 카탈로그** - 팀원들이 만든 리소스를 검색, 필터링, 설치
- **가이드 시스템** - 팀 내 지식 공유 및 온보딩 문서
- **훅 설정 관리** - Claude Code 훅 설정을 시각적으로 관리

### MCP 통합

- **MCP 서버** - Claude Code / OpenCode에서 직접 플러그인 검색 및 사용
- **의미 기반 검색** - "코드 리뷰 도와주는 스킬 찾아줘" 같은 자연어 요청 지원
- **V2 배포 시스템** - 대화 중 만든 스킬을 즉시 팀과 공유
- **개선 제안** - 다른 사람의 스킬에 개선을 제안하고 반영

### 플러그인 지원

- **Claude Code Plugin** - 마켓플레이스에서 원클릭 설치 (`claude plugin add`)
- **OpenCode Plugin** - npm 레지스트리 기반 설치 (`@gpters-internal/opencode`)
- **MCP 직접 연결** - `claude mcp add`로 HTTP MCP 서버 연결

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

### Claude Code (권장)

```bash
claude mcp remove gpters-ai-toolkit 2>/dev/null; claude plugin add chat-prompt/gpters-ai-toolkit
```

### OpenCode

터미널에서 원라인 설치:

```bash
grep -q "verdaccio.gpters.org" ~/.opencode/.npmrc 2>/dev/null || echo '@gpters-internal:registry=https://verdaccio.gpters.org
//verdaccio.gpters.org/:_authToken=Njg2NmMxZDYxZjBjMWVkMmRmZDI2Y2ZlMjMyZWRmOWM6ZTg1MWUyYzhiMGUxNjhkMmM5ODMwM2MxOTJiZTk3YWI2YTVlMzA5ZWM5YWM4YTJiMzY5YjI1NGQ=' >> ~/.opencode/.npmrc && \
grep -q "verdaccio.gpters.org" ~/.cache/opencode/.npmrc 2>/dev/null || (mkdir -p ~/.cache/opencode && echo '@gpters-internal:registry=https://verdaccio.gpters.org
//verdaccio.gpters.org/:_authToken=Njg2NmMxZDYxZjBjMWVkMmRmZDI2Y2ZlMjMyZWRmOWM6ZTg1MWUyYzhiMGUxNjhkMmM5ODMwM2MxOTJiZTk3YWI2YTVlMzA5ZWM5YWM4YTJiMzY5YjI1NGQ=' >> ~/.cache/opencode/.npmrc) && \
[ ! -f ~/.config/opencode/opencode.json ] && echo '{"$schema":"https://opencode.ai/config.json","plugin":[]}' > ~/.config/opencode/opencode.json; \
node -e "const fs=require('fs'),f=process.env.HOME+'/.config/opencode/opencode.json',c=JSON.parse(fs.readFileSync(f,'utf8'));c.plugin=c.plugin||[];c.plugin.includes('@gpters-internal/opencode')||c.plugin.push('@gpters-internal/opencode@latest');fs.writeFileSync(f,JSON.stringify(c,null,2))"
```

### MCP 직접 연결

```bash
claude mcp add gpters-ai-toolkit https://ai-toolkit.gpters.org/api/mcp -t http
```

브라우저에서 Google (@gpters.org) 로그인 후 자동 연결됩니다.

> 설치 가이드: https://ai-toolkit.gpters.org/getting-started

### 사용하기

Claude Code / OpenCode에서 자연어로 요청:

```
"코드 리뷰 스킬 찾아줘"
"DB 마이그레이션 도와주는 스킬 있어?"
"이 스킬 팀이랑 공유해줘"  # V2 배포
```

## 아키텍처

![플러그인 아키텍처](docs/plugin_architecture.png)

## 프로젝트 구조

```
gpters-ai-toolkit/
├── apps/web/                        # Next.js 웹 애플리케이션
│   ├── app/                         # App Router 페이지 및 API
│   │   ├── api/                     # API 라우트 (catalog, mcp, auth, admin)
│   │   ├── skill/[id]/              # 스킬 상세 페이지
│   │   ├── agent/[id]/              # 에이전트 상세 페이지
│   │   ├── command/[id]/            # 커맨드 상세 페이지
│   │   ├── hook/[id]/               # 훅 설정 페이지
│   │   ├── guides/                  # 가이드 목록 및 상세
│   │   ├── getting-started/         # 설치 가이드 (Claude Code / OpenCode / MCP)
│   │   ├── admin/                   # 관리자 대시보드
│   │   └── playground/[id]/         # 스킬 테스트 환경
│   ├── components/                  # React 컴포넌트 (50+)
│   ├── lib/                         # 비즈니스 로직 (db, mcp, auth, rbac)
│   └── tests/                       # 테스트 (Vitest, Playwright)
│
├── packages/lib/                    # 공유 라이브러리
├── plugins/                         # Claude Code 플러그인 정의
├── docs/                                  # 문서 및 다이어그램
│   ├── compound_productivity_engine.png   # 복리 엔진 흐름도
│   └── plugin_architecture.png            # 플러그인 아키텍처 다이어그램
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

### MCP 서버 API

| 메소드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `POST` | `/api/mcp` | JSON-RPC 2.0 요청 처리 |
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
| `semantic_search` | 의미 기반 플러그인 검색 |
| `get_plugin_content` | 플러그인 전체 내용 조회 |
| `deploy_skill` | 스킬/에이전트 배포 (V2) |
| `check_updates` | 설치된 스킬 업데이트 확인 |
| `suggest_improvement` | 다른 플러그인에 개선 제안 |

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
| `DATABASE_URL` | Neon PostgreSQL 연결 문자열 | O |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID | O |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 시크릿 | O |
| `NEXTAUTH_SECRET` | NextAuth 시크릿 | O |
| `GH_TOKEN` | GitHub API 토큰 (플러그인 동기화) | |
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

## 보안

- **인증**: NextAuth v5 + Google OAuth (@gpters.org 도메인만)
- **MCP 인증**: OAuth 2.1 (브라우저 로그인)
- **권한**: RBAC (admin, editor, viewer 역할)
- **Rate Limiting**: IP 기반 제한

## 관련 링크

| 링크 | 설명 |
|------|------|
| [AI Toolkit](https://ai-toolkit.gpters.org) | 마켓플레이스 (스킬 배포/검색) |
| [설치 가이드](https://ai-toolkit.gpters.org/getting-started) | Claude Code / OpenCode / MCP 설치 |
| [Linear 프로젝트](https://linear.app/geniefy/project/생산성-복리-엔진-프로젝트-541a0544201b) | 복리 엔진 프로젝트 관리 |

## 기여하기

1. 새 스킬/에이전트 만들기
2. Claude Code에서 `"이 스킬 팀이랑 공유해줘"`로 배포
3. 또는 웹 관리자 대시보드(`/admin`)에서 직접 추가
4. 다른 사람의 스킬에 `suggest_improvement`로 개선 제안

## 라이선스

MIT License - see [LICENSE](LICENSE) for details.
