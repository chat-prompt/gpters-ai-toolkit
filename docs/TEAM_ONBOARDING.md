# GPTers AI Toolkit - 팀 온보딩 가이드

## 개요

GPTers AI Toolkit은 팀이 만든 스킬, 에이전트, 커맨드를 공유하고 자동으로 활용하는 플랫폼입니다.

**구성 요소:**

| 구성 요소 | 역할 |
|-----------|------|
| **aitk CLI** | 스킬 검색, 배포, 인증 등 핵심 CLI 도구 |
| **Claude Code 플러그인** | Claude Code에서 자동 스킬 검색 + MCP 연동 |
| **OpenCode 플러그인** | OpenCode에서 자동 스킬 검색 + MCP 연동 |
| **Codex 플러그인** | Codex CLI에서 스킬 + MCP 연동 |
| **웹 대시보드** | https://ai-toolkit.gpters.org |

---

## 1단계: 로그인

npx로 바로 실행할 수 있습니다. 브라우저에서 Google 로그인 후 토큰이 자동 저장됩니다:

```bash
npx --yes @gpters/aitk login
```

> 참고: MCP 서버 없이도 독립적으로 스킬 검색/조회/배포가 가능합니다. 어떤 코딩 에이전트와도 함께 사용할 수 있습니다.

> 브라우저를 열 수 없는 환경에서는 웹에서 토큰을 복사한 뒤 `npx --yes @gpters/aitk login --token <TOKEN>`으로 수동 인증할 수 있습니다.

로그인 확인:

```bash
npx --yes @gpters/aitk whoami
```

## 2단계: 스킬 검색 & 조회

로그인 후 바로 스킬을 검색하고 조회할 수 있습니다:

```bash
npx --yes @gpters/aitk search "code review"
npx --yes @gpters/aitk get code-reviewer
```

## 글로벌 설치 (선택)

자주 사용한다면 글로벌로 설치하면 npx 없이 바로 사용할 수 있습니다:

```bash
npm install -g @gpters/aitk
```

설치 후에는 `npx --yes @gpters/aitk` 대신 `aitk`만으로 실행 가능합니다:

```bash
aitk search "code review"
aitk get code-reviewer
```

이미 설치돼 있다면 최신으로 올립니다. `aitk upgrade`는 Claude Code 플러그인까지 함께 갱신합니다:

```bash
npm i -g @gpters/aitk@latest && aitk upgrade
```

---

## 3단계: 코딩 도구별 플러그인 설치 (선택)

플러그인을 설치하면 팀 스킬 검색과 사용량 보고가 연결됩니다. 사용하는 도구에 맞게 설치하세요.

### Claude Code

```bash
claude plugin marketplace add chat-prompt/gpters-ai-toolkit
claude plugin install gpters-ai-toolkit
```

Claude Code를 재시작하면 자동으로 활성화됩니다.

**포함 기능:**
- 요청 시 팀 스킬 검색 (`skill-suggest` 스킬, 대화 중 실행되는 훅 없음)
- MCP 서버 자동 등록 (별도 `claude mcp add` 불필요)
- 세션 종료 시 사용자 입력 수만 집계해 전송 (SessionEnd hook), 세션 시작 시 하루 한 번 사용량 보고
- 주간 한도 수집: 플러그인 설치 후 아래 4단계의 `aitk usage setup`을 한 번 실행합니다

### OpenCode

프로젝트 루트의 `opencode.json`에 플러그인을 추가합니다:

```bash
# opencode.json이 없으면 생성
[ ! -f opencode.json ] && echo '{"$schema":"https://opencode.ai/config.json","plugin":[]}' > opencode.json
```

`opencode.json`의 `plugin` 배열에 추가:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@gpters/opencode"]
}
```

OpenCode를 재시작하면 자동 설치됩니다.

### Codex CLI

```bash
npx @gpters/codex-plugin setup
```

**옵션:**

| 옵션 | 설명 |
|------|------|
| `--user` | 사용자 전역 설치 (`~/.agents/skills/gpters/`) |
| `--project` | 프로젝트 레벨 설치 (`.agents/skills/gpters/`) |
| `--force` | 기존 파일 덮어쓰기 |

이 명령으로 스킬 파일과 MCP 서버 설정(`~/.codex/config.toml`)이 함께 설치됩니다.

---


## 4단계: Claude Code 주간 한도 수집 연결

AX 대시보드의 주간 한도 지표는 Claude Code가 상태 표시줄 명령에 넘겨주는 공식 값에서만 얻을 수
있습니다. 플러그인 설치 후 한 번 실행합니다:

```bash
aitk usage setup
```

- 상태 표시줄을 이미 쓰고 있으면 그대로 감싸기만 하므로 화면은 바뀌지 않습니다.
- 상태 표시줄이 없으면 aitk 기본 한 줄(모델 · 컨텍스트 · 5시간/주간 한도)을 보여줄지 묻습니다.
  아니오를 고르면 화면에는 아무것도 그리지 않고 한도만 수집합니다.
- Claude Code를 재시작하면 적용됩니다. Claude Code 안에서 "usage 설정해줘"라고 해도 `usage-setup`
  스킬이 같은 절차를 안내합니다. 되돌리려면 `aitk usage uninstall`.
- 보내는 값은 토큰 수·세션 수·플랜·모델별 사용량·주간 한도 사용률뿐입니다. 대화 내용·경로·세션 ID·
  인증 토큰은 보내지 않습니다.

## 인증 구조

aitk CLI는 다음 순서로 인증 토큰을 탐색합니다:

| 우선순위 | 소스 | 설명 |
|---------|------|------|
| 1 | `GPTERS_TOKEN` 환경변수 | CI/CD 등 자동화 환경용 |
| 2 | `~/.config/aitk/config.json` | `aitk login`으로 저장된 토큰 |
| 3 | `~/.claude/.credentials.json` | Claude Code MCP OAuth 토큰 자동 탐지 |

Claude Code 플러그인을 통해 MCP에 이미 로그인한 경우, `aitk login` 없이도 CLI가 자동으로 토큰을 탐지합니다.

---

## 주요 CLI 명령어

| 명령어 | 설명 |
|--------|------|
| `aitk search <query>` | 스킬/에이전트/커맨드 검색 |
| `aitk get <id>` | 특정 플러그인 상세 조회 |
| `aitk deploy --id <slug> --type skill --name <name> --content <text\|@file>` | 스킬 배포 |
| `aitk undeploy <id>` | 배포한 스킬 삭제 |
| `aitk updates` | 설치된 스킬 업데이트 확인 |
| `aitk suggest` | 다른 사람의 플러그인에 개선 제안 |
| `aitk config` | CLI 설정 확인/변경 |
| `aitk whoami` | 현재 인증 사용자 확인 |

각 명령어의 상세 옵션은 `aitk <command> --help`로 확인할 수 있습니다.

---

## 설정

```bash
# 현재 설정 확인
aitk config

# 스킬 검색 방법 변경
aitk config set searchMethod cli    # CLI 직접 호출
aitk config set searchMethod mcp    # MCP 서버 경유
aitk config set searchMethod auto   # 자동 (기본값: MCP 우선, CLI 폴백)
```

설정 파일 위치: `~/.config/aitk/config.json`

---

## 문제 해결

### `aitk: command not found`

npm 글로벌 바이너리 경로가 PATH에 포함되어 있는지 확인:

```bash
# npm 글로벌 경로 확인
npm bin -g

# PATH에 추가 (zsh 기준)
echo 'export PATH="$(npm bin -g):$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 인증 오류 (`exit code 2`)

```bash
# 토큰 상태 확인
aitk whoami

# 재로그인
aitk login
```

### 플러그인이 동작하지 않음

- Claude Code: `claude plugin list`로 설치 확인, 재시작 필요
- OpenCode: `opencode.json`의 `plugin` 배열 확인, 재시작 필요
- Codex: `~/.codex/config.toml`에 MCP 서버 등록 확인

---

## 관련 문서

- [웹 대시보드](https://ai-toolkit.gpters.org)
- [MCP 서버 문서](./AUTO_PLUGIN_DISCOVERY.md)
- [V2 아키텍처](./ARCHITECTURE_V2.md)
