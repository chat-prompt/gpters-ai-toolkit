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

## 빠른 시작: 에이전트에게 붙여 넣기

처음 설치, 업그레이드, 주간 한도가 대시보드에 안 잡힐 때 모두 아래 프롬프트 하나로 됩니다.
Claude Code나 Codex에 그대로 붙여 넣으면 에이전트가 버전·계정·도구를 보고 필요한 단계만 진행하고,
마지막에 결과 블록을 출력합니다. aitk가 아직 없어도 됩니다. 아래 1~4단계는 같은 내용을 손으로 하는 방법입니다.

```text
팀 AI Toolkit(aitk)을 설치·최신화하고, AX 대시보드에 Claude·Codex 주간 한도 수집을 연결하려고 한다. 내가 쓰는 도구(Claude Code, Codex 중 해당하는 것)를 기준으로 아래 순서대로 하고, 막히면 우회하지 말고 그 지점에서 멈춰 보고해. 나에게 묻고 기다리는 곳은 4번의 표시줄 선택과 6번의 재시작뿐이다. 그 외에는 끝까지 진행한다.

1. 현재 상태 확인 (읽기만)
   - aitk --version   (명령이 없으면 "미설치"로 적고 2번으로)
   - which -a aitk  (여러 개면 전부 센다)
   - 내가 쓰는 도구 확인: ~/.claude/projects 와 ~/.codex/sessions 중 최근 7일 안에 바뀐 파일이 있는 쪽
2. 최신으로 올리기
   - npm install -g @gpters/aitk@latest
   - aitk upgrade   (Claude Code·Codex 플러그인도 함께 갱신된다)
   - aitk --version 이 올라갔는지 다시 확인한다. which -a aitk 의 첫 번째가 여전히 옛 버전이면 그 사실을 보고한다.
   - EACCES 같은 권한 오류가 나면 sudo 로 밀어붙이지 말고 오류 한 줄을 보고한다.
3. 계정 확인
   - aitk whoami 로 나온 이름을 결과 블록에 적고 다음 단계로 넘어간다. 이메일은 옮겨 적지 않는다.
   - 로그인이 안 돼 있다고 나올 때만 멈추고, 나에게 aitk login --device 를 직접 실행해 브라우저에서 회사 Google 계정으로 승인하라고 안내한다.
4. Claude Code 를 쓰면 — 플러그인과 주간 한도 수집
   - claude plugin list 에 gpters-ai-toolkit 이 없으면 아래 "3단계: Claude Code" 의 설치 명령을 나에게 안내한다.
   - aitk usage status 를 실행해 statusline.kind, autoSetup, snapshot 을 읽는다.
   - kind 가 user(이미 내 표시줄이 있음): aitk usage setup  — 표시는 그대로 두고 수집만 붙는다.
   - kind 가 none(표시줄 없음): 나에게 "aitk 기본 표시줄 보기(모델·컨텍스트·5시간/주간 한도 한 줄)" 와 "표시 없이 수집만" 중 무엇을 원하는지 먼저 묻고,
     aitk usage setup --display default  또는  aitk usage setup --display none
   - kind 가 aitk 인데 snapshot 이 null: aitk usage setup 을 한 번 더 실행해 명령 경로를 갱신한다.
   - autoSetup 이 declined(예전에 내가 끈 상태)여도 이번 요청이 다시 켜는 것이므로 aitk usage setup 을 실행한다.
   - kind 가 unsupported: 설정을 건드리지 말고 보고만 한다.
   - ~/.claude/settings.json 을 직접 편집하지 않는다. aitk 명령만 쓴다.
5. Codex 를 쓰면 — 플러그인과 보고 훅
   - ~/.codex/hooks.json 에 gpters-usage-report 가 없으면: npx --yes @gpters/codex-plugin@latest setup --user
   - 나에게 "다음에 Codex 를 열 때 gpters-usage-report 훅 승인을 물으면 허용해 주세요" 라고 안내한다.
   - ~/.codex/config.toml 이나 hooks.json 을 직접 편집하지 않는다.
6. 나에게 "Claude Code·Codex 를 완전히 종료했다가 다시 열고, 각각 아무 질문이나 하나 보내 주세요" 라고 안내하고 기다린다.
7. 확인하고 지금 한 번 보내기
   - aitk usage report --days 7 --dry-run 결과에서 client 별(claude-code, codex) limitUsedPercent 를 본다.
   - 하나라도 숫자가 나오면 aitk usage report --days 7 로 한 번 보낸다. 나머지 하나가 비어 있어도 멈추지 않는다.
     (Claude 는 Pro·Max 구독으로 로그인했을 때만 값이 있다. 구독이 없거나 API 키로 쓰면 비는 게 정상이다.)
   - 둘 다 비어 있을 때만 멈추고 보고한다.
8. 아래 결과 블록만 출력한다. 이메일·토큰·파일 경로는 넣지 않는다.

[aitk 설치·주간 한도 수집 결과]
- aitk 버전: 이전 → 현재
- aitk 설치본 개수(which -a):
- aitk 로그인 이름(whoami):
- Claude: statusline.kind / limitUsedPercent (안 쓰면 "안 씀")
- Codex: 훅 설치·승인 여부 / limitUsedPercent (안 쓰면 "안 씀")
- 막힌 곳 (없으면 "없음"):
```

설치 뒤에 한도가 다시 안 잡히면 Claude Code 안에서 "주간 한도가 대시보드에 안 잡혀"라고 하면 `usage-setup` 스킬이 같은 점검을 합니다.

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

Claude Code·Codex 플러그인이 설치돼 있으면 aitk는 하루 한 번 자동으로 최신이 됩니다(npm 전역 설치본일 때, 끄려면 `AITK_AUTO_UPDATE=0`). 직접 올리려면 아래를 실행합니다. `aitk upgrade`는 aitk 자신과 Claude Code 플러그인까지 함께 갱신합니다:

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
- 주간 한도 수집: 세션 시작 훅이 화면을 바꾸지 않는 방식으로 자동 연결합니다(아래 4단계)

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


## 4단계: 주간 한도 수집 연결 (Claude Code · Codex)

AX 대시보드의 주간 한도 지표는 Claude Code가 상태 표시줄 명령에 넘겨주는 공식 값에서만 얻을 수
있습니다. **aitk 0.7.23 이상과 플러그인이 깔려 있으면 따로 할 일이 없습니다.** 세션 시작 훅이 하루 한 번
`aitk usage setup --auto`를 실행해 화면이 바뀌지 않는 방식으로 연결하고, 다음 세션부터 수집됩니다.

- 상태 표시줄을 이미 쓰고 있으면 그대로 감싸기만 하므로 화면은 바뀌지 않습니다.
- 상태 표시줄이 없으면 화면에는 아무것도 그리지 않고 한도만 수집합니다.
- 결과는 `~/.cache/gpters-aitk/usage-setup.log`에 남습니다. 끄려면 `aitk usage uninstall`
  — 연결 전에 실행해 둬도 되고, 이후 자동으로 다시 켜지지 않습니다. 셸의 `export AITK_USAGE_SETUP=0`은
  GUI·IDE에서 띄운 Claude Code·Codex에는 전달되지 않을 수 있으니 `uninstall`을 우선합니다.
- aitk 기본 한 줄(모델 · 컨텍스트 · 5시간/주간 한도)을 화면에 보고 싶으면 직접
  `aitk usage setup --display default`. Claude Code 안에서 "usage 설정해줘"라고 해도 `usage-setup`
  스킬이 같은 절차를 안내합니다.
- 에이전트 머신, `CLAUDE_CONFIG_DIR`을 다른 곳으로 쓰는 경우, `settings.json`이 심링크(dotfiles 공유)인 경우,
  command 형식이 아닌 상태 표시줄, 연결 뒤 `settings.json`에서 표시줄을 지운 경우는 자동 연결하지 않습니다.
  다른 앱(Clawd on Desk 등)이 표시줄을 자기 명령으로 덮어쓰거나 직접 다른 명령으로 바꾸면, 다음 날 첫 세션에 그 명령을
  다시 감쌉니다(aitk 0.7.27 이상, 화면은 그대로). 수집을 끄려면 `aitk usage uninstall`을 씁니다.
- node·aitk 경로가 사라져도 원래 상태 표시줄은 그대로 나옵니다(다음 날 첫 세션에 경로를 다시 맞춤).
- Codex 주간 한도는 따로 켤 것이 없습니다. 보고할 때 `~/.codex/sessions`에서 함께 읽습니다. Codex만 쓰면
  `npx @gpters/codex-plugin setup --user`로 보고 훅을 깔고, 다음 Codex 실행 때 훅 승인을 허용해야 보고가 돕니다.
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
