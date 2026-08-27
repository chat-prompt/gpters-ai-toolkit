# 사내 에이전트 사용량 — 연결 현황과 남은 결정

> 2026-08-26 갱신: 이 문서의 “에이전트 토큰 저장 칸이 없다”는 분석은 0025
> `ax_agent_telemetry_batches`와 `aitk agent-telemetry collect` 구현 전 기록이다. 현재 정본은
> [에이전트 telemetry v1](./2026-08-26-agent-telemetry-v1.md)이다. 아래 내용은 당시 제약의 근거로 보존한다.

`ax-shared-skills.md`가 정의한 계약을 에이전트 쪽에서 충족하려 할 때 실제로 무엇이 걸리는지 실측한 문서다. 계약 자체를 대체하지 않는다 — 계약은 그대로 두고, 그 계약이 닿지 않는 지점과 구현 전에 정해야 할 것을 적는다.

- 실측일: 2026-08-19
- 대상: `gpters-ai-toolkit` (HEAD, 브랜치 `hychoi/dev-4140`) · `bbopters-shared` (HEAD)
- 관련 문서: [ax-dashboard.md](./ax-dashboard.md) 전체 구조 · [ax-shared-skills.md](./ax-shared-skills.md) 연결 계약

## 지금 어디까지 붙어 있나

| 단계 | 계약 | 구현 |
| -- | -- | -- |
| 1. 인벤토리 | `ax-shared-skills.md` §1 | **됨** — `shared-skills` 패널. `shared-skills.ts:154`가 `eventsConnected: false`를 함께 내려보내 "미연결"을 화면이 구분한다 |
| 2. 버전 식별 | §2 | 계약만. 아래 "버전 계약의 실측" 참고 |
| 3. 실행 이벤트 | §3 | 계약만. `ax_agent_skill_events`·`report_agent_skill_event` 모두 레포에 없다(grep 0건) — 계약이 정한 "첫 구현이 붙는 시점에 만든다"를 지키고 있는 상태다 |

## 에이전트는 실제로 어떻게 도는가

`bbopters-shared`의 봇들(`bboya`·`bbojjak`·`twojjak` 등)은 별도 런타임이 아니라 **설정 디렉터리만 분리한 Claude Code CLI**다.

```
CLAUDE_CONFIG_DIR=~/.openclaw/agents/<bot>/agent  claude ...
```

출처: `bbopters-shared/projects/claude-skill-registry/guides/slack-claude-cli-agent/01~03`. 계정도 봇마다 따로 로그인한다(`03-multi-hosts.md:600` — "OAuth 한 머신에서 다른 머신으로 복사 시 계정 차단").

스킬 활성화는 심링크다. `bbopters-shared/bin/bbopters-skill install`이 `skills/<name>`을 `~/.claude/skills/<name>`으로 건다.

이 구조가 뒤에 나오는 문제의 원인이라 먼저 적어 둔다: **에이전트는 설정 디렉터리가 분리돼 있는데, 수집 경로는 전부 `HOME`을 본다.**

## 계약이 덮지 않는 것 — 에이전트의 토큰 사용량

`ax-shared-skills.md` §3이 정의하는 것은 **스킬 실행 이벤트**(어떤 스킬이 언제 돌았나)다. 토큰은 그 스키마에 없다.

토큰이 들어가는 곳은 `ax_client_usage`인데, 이 테이블의 주체 키는 `member_name`이고 유니크 키는 `(member_name, client, period_start)`다(`0023_ax_client_usage.sql`). 그리고 그 이름은 서버가 인증 세션에서 유도한다 — `usage-report.ts:57`이 이유까지 적어 두었다.

> **`memberName`이 없는 것은 의도다.** 누구의 사용량인지는 서버가 인증 세션에서 유도한다. 클라이언트가 이름을 실어 보내면 남의 이름으로 기록을 남길 수 있다.

정리하면 이렇게 갈린다.

| | 토큰 | 스킬 | 주체 |
| -- | -- | -- | -- |
| `ax_client_usage` | O | X | 사람 (`member_name`) |
| `skill_events` | X | O | 사람 (`user_id` → `users.id`) |
| `ax_agent_skill_events` (계약) | X | O | 에이전트 (`agent`) |

**어느 칸에도 "에이전트의 토큰"이 없다.** 이게 의도적 제외인지 아직 안 다룬 항목인지가 이 문서가 요청하는 첫 번째 결정이다.

참고로 `ax-dashboard.md`의 "지금 넣지 않은 것"에는 *"OpenClaw 등 공유 계정 사용량 — 한 계정을 여러 명이 쓰는 형태라 사용자 귀속이 안 된다"*가 있다. 다만 위에서 확인했듯 봇은 실제로 **봇마다 계정이 따로**다. 공유 계정이라 못 하는 게 아니라, 수집기가 그 계정의 데이터를 못 읽는 상태에 가깝다.

## 지금 코드에서 걸리는 것 — 전부 `HOME` 결합

`CLAUDE_CONFIG_DIR`은 `gpters-ai-toolkit` 전체에 참조가 **0건**이다. 봇 프로필로 수집기를 돌리면 아래가 그대로 문제가 된다.

| # | 위치 | 지금 | 에이전트일 때 |
| -- | -- | -- | -- |
| 1 | `apps/aitk-cli/src/usage/claude-code.ts:71-72` | `homedir()` + `.claude/projects` | 봇 트랜스크립트(`~/.openclaw/agents/<bot>/agent/projects`)를 못 읽는다. 대신 사람 것을 읽는다 |
| 2 | `apps/aitk-cli/src/usage/claude-code.ts:37` (`readPlanRaw`) | `~/.claude.json` | 봇 플랜이 아니라 사람 플랜이 기록된다 |
| 3 | `apps/claude-code-plugin/scripts/usage-report.sh` (`STAMP_DIR`) | `$HOME/.cache/gpters-aitk` | 한 머신의 봇들이 스탬프를 공유한다. 첫 봇이 그날을 선점하고 나머지는 조용히 스킵된다 |
| 4 | `apps/aitk-cli/src/auth.ts:17,45-47` | `GPTERS_TOKEN` → 없으면 `~/.claude/.credentials.json` | env를 안 주면 봇 전원이 같은 사람으로 기록된다 |
| 5 | `bbopters-shared/bin/bbopters-skill:22` | `SKILLS_DIR="$HOME/.claude/skills"` | 레지스트리 경로는 `BBOPTERS_SKILLS_DIR`로 바꿀 수 있는데 설치 대상은 못 바꾼다 |

1과 4가 짝이다. **4만 고치면 더 나쁘다** — 토큰은 봇 것인데 읽는 데이터는 사람 것이라, 엉뚱한 수치가 봇 이름으로 들어간다. 순서를 바꿀 수 없는 의존이다.

3은 별도로 봐야 한다. 훅은 하루 1회 · 7일 롤링이라 하루를 걸러도 다음 날 레코드가 그 구간을 덮는다(스크립트 주석이 근거를 적어 두었다). 사람 한 명이면 무해한 설계인데, 한 `HOME`에 주체가 여럿이면 그 전제가 깨진다.

## 버전 계약의 실측

`ax-shared-skills.md` §2는 정본을 `SKILL.md` frontmatter의 `version`으로 정하고, 없으면 커밋 SHA 앞 7자리를 쓰기로 했다.

실측하면 **126개 중 4개**만 `version:`을 갖는다(`cohort-guide-todo`·`md2notion`·`md2pdf`·`member-ai-profile`).

계약이 틀린 건 아니다 — 대체 표기 규칙이 이미 있으니 122개는 SHA로 표시된다. 다만 화면에 나갈 값의 97%가 대체 표기라면, 그건 "버전 식별"이라기보다 "변경 감지"에 가깝다. 셋 중 하나를 고르는 문제다.

1. 그대로 둔다 — SHA도 변경 추적에는 충분하다
2. `bbopters-shared` 쪽에 frontmatter `version`을 채우는 작업을 별건으로 만든다
3. §2의 권고대로 CI가 `skills-manifest.json`을 생성하되, 버전이 없는 스킬은 SHA로 채워 넣는다

## 선택지

### A. 스킬 실행 이벤트만 붙인다 (계약대로)

`ax-shared-skills.md` §3을 그대로 구현한다. 에이전트가 `report_agent_skill_event`로 보고하고 `ax_agent_skill_events`에 쌓인다. 주체는 `agent`, 인증은 에이전트별 서비스 토큰.

`HOME` 결합 5건과 무관하다 — 트랜스크립트를 읽지 않고 에이전트가 직접 보고하기 때문이다. 계약이 이미 서 있어서 설계 논의도 필요 없다.

얻는 것: 어떤 봇이 어떤 스킬을 얼마나 쓰는지. 못 얻는 것: 그 스킬이 토큰을 얼마나 태우는지.

### B. 에이전트 토큰 사용량까지 붙인다

수집기를 설정 디렉터리 인지형으로 바꾼다. `collectClaudeCode`에 루트 경로를 주입 가능하게 하고 `CLAUDE_CONFIG_DIR ?? ~/.claude`로 해석한다. 스탬프도 같은 기준으로 옮긴다. 봇별 `GPTERS_TOKEN`을 얹는다.

여기서 **설계 충돌을 먼저 정리해야 한다.** 이대로 하면 봇이 `ax_client_usage`에 사람과 같은 테이블·같은 컬럼으로 들어간다. 그런데 `ax-shared-skills.md`는 *"공유 계정 에이전트는 사용자 귀속이 안 되므로 사람이 아니라 에이전트 단위로만 집계한다"*는 원칙을 세워 뒀다. 원칙을 지키려면 주체 종류를 구분하는 필드나 별도 테이블이 필요하다.

지표 의미론에도 영향이 간다. 봇은 크론으로 상시 활성이라 "활성 인원"에 섞이면 그 지표가 무의미해진다. 지금 브랜치가 `weeklyActiveUsers`를 `totalParticipants` + `periodLinked`로 정리하는 중이라, 구분 여부를 여기서 같이 정하면 나중에 다시 안 건드려도 된다.

### C. 스킬 × 토큰을 결합한다

"스킬 X를 돌리는 데 토큰 얼마"를 내려면 두 스트림을 조인해야 한다. 한 턴에 스킬이 여러 개 붙을 수 있어 정확한 귀속이 불가능하고, 근사치를 내려면 그 근사의 근거를 화면이 밝혀야 한다.

A와 B가 끝나기 전에는 붙일 대상 자체가 없다. 지금 다룰 항목이 아니다.

## 정해야 할 것

1. **에이전트 토큰 사용량은 범위인가** — 범위가 아니면 A만 하면 되고 `HOME` 결합은 손댈 이유가 없다. 범위면 B를 A와 함께 설계해야 한다. 이 답이 나머지 전부를 가른다.
2. **봇과 사람을 한 지표에서 섞을 것인가** — 섞지 않기로 하면 주체 구분을 어디에 둘지(컬럼 · 별도 테이블 · 이름 규약) 지금 브랜치에서 정하는 편이 싸다.
3. **버전 표기를 SHA로 둘 것인가** — 위 세 선택지 중 하나. `bbopters-shared` 쪽 작업이 필요한 건 2번뿐이다.

1번이 먼저다. 나머지 둘은 1번 답에 따라 필요 여부가 달라진다.
