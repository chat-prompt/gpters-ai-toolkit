# @gpters-internal/codex-plugin

GPTers Codex CLI 플러그인 - Agent Skills + MCP 서버 설정을 한 번에 설치합니다.

## 설치

```bash
npx @gpters-internal/codex-plugin setup
```

### 옵션

| 옵션 | 설명 |
|------|------|
| `--project` | 프로젝트 레벨 설치 (`.agents/skills/gpters/`) |
| `--user` | 사용자 전역 설치 (`~/.agents/skills/gpters/`) |
| `--force` | 기존 파일 덮어쓰기 |

## 설치 내용

### 1. 스킬 파일

| 스킬 | 설명 |
|------|------|
| `skill-suggest` | 새 작업 시 관련 팀 스킬 자동 검색 |
| `commit` | Semantic Commit 형식의 상세 커밋 메시지 생성 |
| `prd-review` | PRD 파일 심층 인터뷰 및 스펙 작성 |

### 2. MCP 서버 설정

`~/.codex/config.toml`에 GPTers AI Toolkit MCP 서버를 등록합니다:

```toml
[mcp_servers.gpters-ai-toolkit]
type = "http"
url = "https://ai-toolkit.gpters.org/api/mcp"
```

### 3. AGENTS.md (선택)

프로젝트 레벨 설치 시 팀 컨벤션이 포함된 `AGENTS.md` 템플릿을 생성합니다.

## 개발

```bash
# 의존성 설치
pnpm install

# 빌드
pnpm build

# 테스트
pnpm test

# 타입 체크
pnpm typecheck
```
