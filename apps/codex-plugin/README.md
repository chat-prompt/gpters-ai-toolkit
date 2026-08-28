# @gpters/codex-plugin

GPTers Codex CLI 플러그인 - Agent Skills + MCP 서버 설정을 한 번에 설치합니다.

## 설치

```bash
npx @gpters/codex-plugin setup
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
| `agent-telemetry-setup` | 승인 기반 에이전트 수집기 설치·진단·해제 |

### 2. MCP 서버 설정

`~/.codex/config.toml`에 GPTers AI Toolkit MCP 서버를 등록합니다:

```toml
[mcp_servers.gpters-ai-toolkit]
type = "http"
url = "https://ai-toolkit.gpters.org/api/mcp"
```

### 3. AGENTS.md (선택)

프로젝트 레벨 설치 시 팀 컨벤션이 포함된 `AGENTS.md` 템플릿을 생성합니다.

### 4. 사용량 자동 보고 훅 (user 설치만)

`~/.codex/hooks.json`의 `SessionStart`에 훅을 등록해, 하루 한 번 Claude Code와 Codex 사용량을 [AX 대시보드](https://ai-toolkit.gpters.org/ko/ax)로 보냅니다. `aitk` CLI 0.6.0 이상이 필요합니다.

> **등록만으로는 실행되지 않습니다.** Codex는 훅마다 명령 해시를 승인받아야 실행합니다. 설치 후 **다음 Codex 실행 시 한 번 승인**해야 동작합니다. 설치 프로그램이 몰래 실행 코드를 심지 못하게 막는 Codex의 보안 장치이며, 이 플러그인은 승인 해시를 직접 쓰지 않습니다.

기존 훅은 건드리지 않습니다. `hooks.json`을 읽을 수 없거나 형식을 알 수 없으면 아무것도 쓰지 않고 물러납니다.

**보내는 것**: 토큰 수, 세션 수, 모델별 사용량, 플랜명, 주간 한도 사용률
**보내지 않는 것**: 대화 내용, 파일 경로, 인증 토큰 (Codex `id_token`은 로컬에서만 열어 플랜 문자열만 꺼냅니다)

```bash
export AITK_USAGE_REPORT=0   # 끄기
aitk usage report --dry-run  # 무엇을 보낼지 확인
aitk usage report            # 지금 보내기
```

### 에이전트/런타임 상세 수집

위 개인 사용량 보고와 별도로, 특정 Codex 작업 범위나 봇의 도구·스킬·수집
건강도를 연결하려면 AITK 0.7.0 이상의 설치형 수집기를 사용합니다. 내부
에이전트는 npm 공개 없이 repo의 `infra/agent-telemetry/install-from-repo.sh`로
영속 사용자 경로에 설치합니다.
`agent-telemetry-setup` 스킬은 사용자가 명시적으로 요청한 경우에만 설치를
진행하며 collector token은 macOS Keychain에 저장합니다. 주기 실행은 launchd가
담당하므로 Codex가 일정을 기억하거나 세션 시작 훅으로 매번 보낼 필요가 없습니다.

자세한 내용은 [수집기 운영 가이드](../../infra/agent-telemetry/README.md)를 참고하세요.

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
