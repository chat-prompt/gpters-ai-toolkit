# Deployment Guide

AI Toolkit을 자체 환경에 배포하기 위한 가이드입니다.

## 사전 요구사항

| 항목 | 버전 | 비고 |
|------|------|------|
| Node.js | 22+ | `node -v`로 확인 |
| pnpm | 10+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| PostgreSQL | Neon Serverless 권장 | 또는 호환 PostgreSQL |

## 1. 저장소 클론 & 의존성 설치

```bash
git clone https://github.com/your-org/your-repo.git
cd your-repo
pnpm install
```

## 2. 데이터베이스 설정

### Neon PostgreSQL (권장)

1. [neon.tech](https://neon.tech)에서 프로젝트 생성
2. 데이터베이스 생성 후 연결 문자열 복사
3. `.env.local`에 설정:

```bash
DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require"
```

### 스키마 적용

```bash
pnpm db:push
```

이 명령은 Drizzle ORM을 통해 테이블을 생성하고, Public 조직 등 초기 데이터 마이그레이션을 실행합니다.

> 기존 운영 DB에는 `db:push --force`를 사용하지 마세요. AX 0026–0030처럼 데이터 백필이나
> 중복 정리가 포함된 변경은 [전용 실행 가이드](./plans/2026-08-25-ax-migration-runbook.md)에 따라
> 격리 DB 프리플라이트 → 백업 → 순차 SQL → 사후 검증으로 반영합니다.

## 3. Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials)에 접속
2. 프로젝트 생성 (또는 기존 프로젝트 선택)
3. **OAuth 동의 화면** 설정:
   - User Type: External (또는 Internal - Google Workspace 사용 시)
   - 앱 이름, 이메일 입력
   - 범위(Scope): `email`, `profile`, `openid` 추가
4. **사용자 인증 정보** > **OAuth 클라이언트 ID** 생성:
   - 애플리케이션 유형: 웹 애플리케이션
   - 승인된 리디렉션 URI 추가:
     - 로컬 개발: `http://localhost:3000/api/auth/callback/google`
     - 프로덕션: `https://your-domain.com/api/auth/callback/google`
5. 클라이언트 ID와 시크릿을 `.env.local`에 설정

## 4. 환경변수 설정

`.env.example`을 `.env.local`로 복사하고 값을 채웁니다:

```bash
cp .env.example .env.local
```

### 필수 환경변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgresql://...` |
| `GOOGLE_CLIENT_ID` | OAuth 클라이언트 ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth 시크릿 | `GOCSPX-...` |
| `NEXTAUTH_SECRET` | 세션 암호화 키 | `openssl rand -base64 32`로 생성 |
| `NEXT_PUBLIC_BASE_URL` | 사이트 URL | `https://your-domain.com` |

### 선택 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `NEXT_PUBLIC_SITE_NAME` | 사이트 이름 | `AI Toolkit` |
| `CONTACT_EMAIL` | 문의 이메일 | `admin@example.com` |
| `INTERNAL_ORGANIZATION_DOMAIN` | 내부 전용 기능 도메인 + AX 대시보드 접근 판정 | 빈 값 (비활성) |
| `VERCEL_API_TOKEN` | AX 대시보드 배포 사이트 패널 | — (미설정 시 해당 패널만 안내 표시) |
| `VERCEL_TEAM_ID` | Vercel 팀 계정 조회 시 | — |
| `GH_TOKEN` | GitHub API 토큰 (플러그인 싱크) | — |
| `GH_OWNER` | GitHub 조직/사용자명 | — |
| `GH_REPO` | GitHub 저장소명 | — |
| `GEMINI_API_KEY` | 시맨틱 검색용 임베딩 | — |
| `DEV_BYPASS_AUTH` | 개발 시 인증 우회 | `false` |

## 5. 로컬 실행

```bash
# 개발 서버 (hot reload)
pnpm dev

# 프로덕션 빌드 & 실행
pnpm build
pnpm start
```

`http://localhost:3000`에서 접속 확인.

## 6. 프로덕션 배포

### Vercel (권장)

1. [vercel.com](https://vercel.com)에서 GitHub 저장소 연결
2. **Framework Preset**: Next.js (자동 감지)
3. **Root Directory**: `apps/web`
4. **Build Command**: (자동 — turbo 사용)
5. **Environment Variables**: 위 필수 변수 모두 설정
6. Deploy 클릭

> Vercel에서는 `NEXTAUTH_URL`이 자동 설정되므로 별도 지정 불필요.

### Railway / Render

```bash
# Build command
pnpm install && pnpm build

# Start command
pnpm start

# Port
3000
```

환경변수를 플랫폼 대시보드에서 설정하세요.

## 7. 배포 후 확인

```bash
# 사이트 접속 확인
curl -I https://your-domain.com

# MCP 서버 확인
curl -X POST https://your-domain.com/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 8. 조직 설정

배포 후 첫 로그인한 사용자가 자동으로 Public 조직에 배정됩니다.

조직별 도메인 제한을 설정하려면:
1. 첫 사용자에게 admin 권한 부여 (DB에서 `users` 테이블의 `role` → `super_admin`)
2. `/admin/organizations`에서 조직 생성
3. 허용 도메인 설정 → 해당 도메인 이메일로 로그인 시 자동 배정

## 9. 브랜딩 커스터마이징

### 로고 변경

`apps/web/public/` 디렉토리에 로고 파일을 추가하고, `apps/web/app/auth/signin/page.tsx`에서 경로를 수정하세요.

### 브랜드 컬러 변경

`apps/web/app/globals.css`에서 CSS 변수를 수정합니다:

```css
:root {
  --brand-primary: #F26522;    /* 메인 브랜드 컬러 */
  --brand-secondary: #FF8C42;  /* 보조 브랜드 컬러 */
}

[data-theme="light"] {
  --brand-primary: #D95A1E;
  --brand-secondary: #E07538;
}
```

## 10. MCP 클라이언트 연결

배포 완료 후 사용자들은 다음 명령어로 연결할 수 있습니다:

```bash
# Claude Code
claude mcp add your-toolkit https://your-domain.com/api/mcp -t http

# Codex CLI (~/.codex/config.toml)
[mcp_servers.your-toolkit]
type = "http"
url = "https://your-domain.com/api/mcp"
```

브라우저에서 Google 로그인 후 자동으로 OAuth 인증이 완료됩니다.

## 트러블슈팅

### 빌드 실패

```bash
# 의존성 캐시 정리 후 재설치
rm -rf node_modules .turbo
pnpm install
pnpm build
```

### OAuth 리디렉트 에러

- `NEXT_PUBLIC_BASE_URL`과 Google OAuth 리디렉션 URI가 정확히 일치하는지 확인
- HTTPS 사용 여부 확인 (프로덕션에서는 필수)

### 데이터베이스 연결 실패

- `DATABASE_URL`의 `?sslmode=require` 파라미터 확인
- Neon 대시보드에서 IP 허용 목록 확인
