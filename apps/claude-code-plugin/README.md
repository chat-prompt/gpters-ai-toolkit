# GPTers AI Toolkit - Claude Code Plugin

GPTers AI Toolkit MCP 서버와 연동하여, 작업 시작 시 관련 팀 스킬을 자동으로 검색하고 적용하는 Claude Code 플러그인입니다.

## 주요 기능

- **skill-suggest**: 사용자의 요청을 분석하여 GPTers AI Toolkit에서 관련 스킬을 자동 검색합니다. 검색된 스킬의 가이드라인과 체크리스트를 현재 작업에 적용하여, 팀의 베스트 프랙티스를 일관되게 활용할 수 있습니다.
- **MCP 서버 자동 연결**: 플러그인 설치 시 GPTers AI Toolkit MCP 서버(`https://ai-toolkit.gpters.org/api/mcp`)가 자동으로 등록됩니다. 별도의 `claude mcp add` 명령이 필요하지 않습니다.
- **사용량 자동 보고**: 하루 한 번, 세션 시작 시 Claude Code와 Codex 사용량을 집계해 [AX 대시보드](https://ai-toolkit.gpters.org/ko/ax)로 보냅니다. `aitk` CLI가 설치돼 있어야 동작합니다.
- **에이전트 텔레메트리 설정 지침**: 사용자가 요청하면 `agent-telemetry-setup` 스킬이 범위를 확인하고 macOS Keychain·launchd 기반 수집기를 안전하게 설치·진단·해제합니다. 자동 설치되지는 않습니다.

### 사용량 보고가 보내는 것

토큰 수, 세션 수, 모델별 사용량, 플랜명, 주간 한도 사용률만 보냅니다. **대화 내용·파일 경로·인증 토큰은 전송하지 않습니다.** Codex 플랜 확인에 쓰는 `id_token`은 로컬에서만 열어 플랜 문자열을 꺼내며, 토큰 자체는 저장하지도 보내지도 않습니다.

집계는 백그라운드에서 돌아 세션 시작을 지연시키지 않고, 하루 한 번만 실행됩니다. 끄려면:

```bash
export AITK_USAGE_REPORT=0
```

수동으로 확인하거나 보내려면:

```bash
aitk usage report --dry-run   # 무엇을 보낼지 출력만
aitk usage report             # 지금 보내기
```

### 에이전트/런타임 상세 수집

위 사용량 보고와 별도로, 특정 에이전트나 작업 범위의 도구·스킬·수집 건강도를
보려면 `@gpters/aitk` 0.7.0 이상의 `agent-telemetry` 설치형 수집기를 사용합니다.
사용자 승인 후 한 번 설치하면 주기 실행은 에이전트 프롬프트가 아니라 macOS
launchd가 담당합니다. collector token을 채팅으로 전달할 필요가 없습니다.

자세한 범위·Hermes 제한·운영 명령은
[수집기 운영 가이드](../../infra/agent-telemetry/README.md)를 참고하세요.

## 사전 요구사항

- Claude Code CLI가 설치되어 있어야 합니다
- GPTers 조직 계정(`@gpters.org`)이 필요합니다 (Google OAuth 인증)
- MCP 서버 최초 연결 시 브라우저에서 Google 로그인이 필요합니다

## 설치

### Marketplace를 통한 설치 (권장)

```bash
claude plugin marketplace add chat-prompt/gpters-ai-toolkit
claude plugin install gpters-ai-toolkit
```

설치 후 Claude Code를 재시작하면 플러그인이 자동으로 활성화됩니다.

### 수동 설치

이 저장소를 클론한 후, 프로젝트의 `.claude/plugins/` 디렉토리에 심볼릭 링크를 생성합니다:

```bash
# 1. 저장소 클론 (이미 있다면 생략)
git clone https://github.com/chat-prompt/gpters-ai-toolkit.git

# 2. 프로젝트에서 플러그인 디렉토리 설정
mkdir -p .claude/plugins
ln -sf /absolute/path/to/gpters-ai-toolkit/apps/claude-code-plugin .claude/plugins/gpters-ai-toolkit
```

## 사용 방법

플러그인이 설치되면, 별도의 명령 없이 자동으로 동작합니다.

### 자동 스킬 검색

새로운 작업을 요청하면, 플러그인이 자동으로 관련 팀 스킬을 검색합니다:

1. 사용자 요청에서 핵심 키워드를 추출합니다
2. GPTers AI Toolkit MCP 서버에서 관련 스킬을 검색합니다
3. 검색된 스킬의 가이드라인을 현재 작업에 적용합니다

### 수동 스킬 검색

MCP 도구를 직접 호출하여 스킬을 검색할 수도 있습니다:

```
# 키워드로 스킬 검색
mcp__gpters-ai-toolkit__semantic_search(query="코드 리뷰", category="skill", limit=5)

# 특정 스킬의 전체 내용 로드
mcp__gpters-ai-toolkit__get_plugin_content(pluginId="code-reviewer")

# 전체 플러그인 목록 조회
mcp__gpters-ai-toolkit__list_plugins()
```

### 추천 검색어

| 작업 유형 | 검색 키워드 |
|----------|------------|
| DB 스키마/쿼리 | data-source, database, schema |
| 코드 리팩토링 | refactor, clean-code |
| 코드 리뷰 | review, code-review |
| API 개발 | api, endpoint, route |
| 문서 작성 | docs, writing, documentation |
| 인프라/배포 | deploy, infrastructure, ci-cd |

## 구조

```
apps/claude-code-plugin/
├── .claude-plugin/
│   └── plugin.json          # 플러그인 메타데이터 및 MCP 서버 설정
├── skills/
│   ├── skill-suggest/
│   │   └── SKILL.md         # skill-suggest 스킬 정의
│   └── agent-telemetry-setup/
│       └── SKILL.md         # 승인 기반 수집기 설치·진단
└── README.md                # 이 파일
```

## 관련 문서

- [GPTers AI Toolkit 웹](https://ai-toolkit.gpters.org)
- [MCP 서버 문서](../../docs/AUTO_PLUGIN_DISCOVERY.md)
- [팀 온보딩 가이드](../../docs/TEAM_ONBOARDING.md)
- [V2 아키텍처](../../docs/ARCHITECTURE_V2.md)
- [OpenCode 플러그인](../opencode-plugin/README.md)
