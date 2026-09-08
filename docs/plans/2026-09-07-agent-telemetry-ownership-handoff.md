# 에이전트 텔레메트리 소유권과 뽀짝이 등록 — 인수인계 (2026-09-07 저녁)

**한 줄**: 뽀짝이를 AX 텔레메트리에 붙이려다 **미니의 aitk가 다른 사람(파트타임 직원)의 개인 계정으로 조용히 동작 중**인 것을
발견했다. 등록은 아직 안 했고, 진저님 계정으로 붙이기로 정해졌다. 이 문서만 읽고 이어받을 수 있다.

같이 읽을 것: `2026-09-07-agent-ops-context-handoff.md`(§7이 이번 교차검증 결과) ·
`2026-09-02-ax-dashboard-next-work-handoff.md`(AX 정본) · `AGENT_SLACK_CHANNEL_RULES.md`(뽀짝이 방 규칙)

---

## 1. 가장 중요한 것 — aitk는 로그인 없이 남의 신원을 물려받는다

`apps/aitk-cli/src/auth.ts`의 `resolveToken()` 우선순위:

```
1. GPTERS_TOKEN 환경변수
2. ~/.config/aitk/config.json          ← aitk login 이 쓰는 곳
3. ~/.claude/.credentials.json 의 mcpOAuth   ← 함정
```

3번(`findClaudeCredentialToken`)은 `mcpOAuth` 안에서 키에 `gpters-ai-toolkit`이 들어간 항목의
`accessToken`을 **그냥 쓴다.** 그 머신의 Claude Code가 툴킷 MCP에 연결돼 있으면 **aitk는 로그인 없이
그 사람으로 동작한다.** 로그인한 적이 없어도 그렇다.

또한 `findClaudeCredentialToken()`은 `homedir()/.claude`를 **하드코딩**한다 — `CLAUDE_CONFIG_DIR`를
보지 않는다. 봇이 설정 디렉터리를 분리해 돌아도 aitk가 잡는 신원은 **머신 사용자의 것**이다.

### 실측된 피해 (뽀짝이 미니)

```
aitk whoami → dahye@gpters.org (송다혜 — 파트타임 재직 중. 9/7엔 퇴사자로 오인했다)
skill_events: 8/19~9/6 사이 143건이 이 계정으로 기록됨 (9/1 54건, 9/3 32건)
그 사람의 마지막 로그인: 8/11
```

**과거 143건은 소급 정정이 안 된다.** 앞으로만 막을 수 있고, 막는 방법은 우선순위 2번을 채우는 것
(`aitk login --device`로 `~/.config/aitk/config.json`에 올바른 토큰을 쓰면 3번을 덮는다).

> 다른 머신도 같은 상태일 수 있다. 에이전트를 새로 붙일 때는 **반드시 `aitk whoami`를 먼저 본다.**

---

## 2. 수집기 소유권 모델 (오해가 많았던 부분)

| 사실 | 근거 |
|---|---|
| 수집기는 **봇 계정이 아니라 기기 코드를 승인한 사람** 계정에 묶인다 | `api/device/approve/route.ts`의 `auth()` → `userId: dbUser.id` |
| 봇은 자기를 승인할 수 없다 (브라우저 세션이 필요) | 같은 라우트 |
| 머신 주인과 계정 주인이 갈릴 수 있다 | `bbodoong`=박수오(머신 주인), `bbokeoter`=최하영(승인자) |
| **공동/백업 소유는 불가능** | `ax_agent_telemetry_collectors.user_id`가 단일, `(agent_id, source)` 유니크 |
| 소유자만 해지할 수 있다 | `revokeAgentTelemetryCollector(collectorId, userId)`가 userId를 WHERE에 검 |
| 다른 사람이 같은 `(agent, source)`를 등록하면 409 | `enrollAgentTelemetryCollector`의 `AgentTelemetryCollectorConflictError` |
| 계정 **삭제** 시 수집기도 cascade로 사라짐 (정지만으로는 안 멈춤) | `schema.ts` `onDelete: 'cascade'` / 인증은 `is_active`만 봄 |
| 배치 전송은 collector 전용 토큰이라 사용자 토큰과 무관 | `authenticateAgentTelemetryCollector`가 `tokenHash`로만 조회 |

### 사람/에이전트 집계는 이미 분리돼 있다

- 사람 축 = `skill_events` (MCP·CLI 경로)
- 에이전트 축 = `ax_agent_telemetry_batches`의 `skillLoads` (`aggregateAgentLoads`)

**소스가 다르다.** 수집기의 `user_id`는 등록·해지 권한일 뿐 집계에 안 들어간다. 화면의
`AxAgentReporterRow`에 사용자 필드조차 없다. → **토큰 사용량이 사람에게 붙는 일은 없다.**
섞이는 건 §1의 경로(에이전트가 `aitk` 명령을 사람 토큰으로 부를 때)뿐이다.

---

## 3. 뽀짝이 등록 — 확정된 값과 남은 단계

### 확정

| 항목 | 값 | 확인 방법 |
|---|---|---|
| 소유자 | **진저(홍지연) `ginger@gpters.org`** | 뽀짝이 답변 + `users`에 존재(viewer, active) |
| 소스 | `claude-code` **하나만** | `infra/agent-telemetry/README.md`가 명시적으로 금지 |
| `--sessions-dir` | `~/.claude/projects` | 뽀짝이 실측 |
| `--project-slugs` | `-Users-dahtmad--openclaw-workspace-bbojjak` | 뽀짝이 실측 (첫 하위 디렉터리명 하나, 정확 일치) |
| 최초 수집 | `--days 1` | 기본 7일이면 첫 배치가 기간 경계에서 통째로 제외됨 |

`CLAUDE_CONFIG_DIR`는 그 세션에서 **unset**이라 기본값 `~/.claude`로 돈다.
`~/.openclaw/agents/bbojjak/agent/projects/`는 존재하지 않는다.
(`2026-08-19-agent-usage-wiring.md`의 `CLAUDE_CONFIG_DIR` 서술은 이 봇에 해당하지 않았다.)

### 미니 현재 상태 (2026-09-07 저녁, 뽀짝이 보고)

```
which aitk               → /opt/homebrew/bin/aitk  (있음)
aitk whoami              → dahye@gpters.org  (봇 것이 아닌 개인 계정, ⚠️)
aitk agent-telemetry     → Unknown command  (CLI가 옛 버전, upgrade 필요)
LaunchAgents             → 없음
```

### 남은 단계 (9/8: **실행되지 않았다** — 실제 등록은 아래 §3-1)

> 이 절차는 `login --device`(진저님 승인) 기준으로 짠 것인데, 그날 밤 #116의 새 흐름(`aitk agent`
> 전용 자격증명)으로 등록이 끝났다. 기록으로만 남긴다.

1. `aitk upgrade` — `agent-telemetry` 서브커맨드가 생겨야 한다.
   ⚠️ 메모리 `agent-telemetry-upgrade-path`·`bbokeoter-slack-protocol` 참고. launchd plist에
   **실행 셸의 node 경로가 박힌다.** 승인 커밋에서 `infra/agent-telemetry/install-from-repo.sh`로
   깐다(`--force`/`--allow-dirty`/`--skip-build` 금지).
2. `aitk login --device` — 뽀짝이가 코드·URL을 `#024`에 붙인다.
3. **진저님이 자기 브라우저에서** 그 URL을 열고 코드 입력 → 승인.
   승인한 사람이 소유자가 되므로 **다른 사람이 누르면 안 된다.** 코드에 유효시간이 있어 진저님이
   대기 중일 때 2번을 실행해야 한다.
4. `aitk whoami` → `ginger@gpters.org` 확인.
5. `aitk agent-telemetry install --source claude-code --sessions-dir ~/.claude/projects \
   --project-slugs -Users-dahtmad--openclaw-workspace-bbojjak --days 1`
6. AX 「에이전트 활동」 패널에 `bbojjak`이 뜨는지 확인.

### 3-1. 실제 등록 결과 (9/7 밤 ~ 9/8, `#024` 스레드 기준)

하영님이 SSH로 직접(코덱스 세션) 진행했다. 뽀짝이는 읽기 전용 진단만 했다.

| 시각 | 한 것 |
|---|---|
| 9/7 저녁 | 미니의 개인 토큰 연결 해제 — 서버에서 aitk-cli 토큰 비활성화, `config.json`의 token 제거. `whoami → No token found` |
| 9/7 저녁 | CLI 0.4.0 → 0.7.10 (main 4777e323 저장소 빌드) |
| 9/7 22:57 | **#116 새 흐름으로 등록** — `aitk_agent_credentials` `bbojjak`(소유자 하영, 12/7 만료, deploy 불허), 수집기 `claude-code`, launchd 1시간(`org.gpters.aitk.agent-telemetry.bbojjak-claude-code.plist`), `credentialStore: file`(의도된 구성) |
| 9/8 | 저장소 빌드 `0.7.13-collector.1` → `.2`. **Codex 수집기 추가**(`source=codex`) — 공용 `~/.codex` 기록 631건 중 뽀짝이 것만 고르려고 `--thread-source aitk-agent:bbojjak` 표시를 붙이는 전용 실행기 `~/.openclaw/workspace-bbojjak/.aitk-codex/run`을 두고 AGENTS.md 맨 앞에 호출 지침. 서버 대조 healthy, AX에 'Codex 자동 / 정상' |

미니 쪽 실측(뽀짝이, 9/8 17:32 재확인 — 하영님이 내부를 직접 손본 뒤): CLI `0.7.13-collector.3`,
`aitk whoami → bbojjak`(deploy 불허), `agent status` org `f31f5a73…` · `credentialStore: file`,
`agent-telemetry doctor` `claude-code`·`codex` 둘 다 ok/healthy/scheduleLoaded, warnings 0, LaunchAgents 2개.
AGENTS.md 맨 앞 「Codex 사용량 귀속 (AITK)」 절과 `.aitk-codex/run` 실행기 그대로. 뽀짝이가 마지막 확인(14:04) 대비
달라졌다고 짚은 것은 CLI `collector.2 → .3`과 codex LaunchAgent 추가 둘뿐, 스스로 바꾼 건 없음.
AGENTS.md 권한 표에는 하영님이 9/7 타타 확정으로 전체 관리자로 들어가 있다(뽀짝이 9/7 "관리자 아님" 답은 그 이전 기준).

**§2의 "진저님 소유" 결정은 실행되지 않았다.** #116 구조에서 소유자는 발급·해지 권한일 뿐이고 활동은
`bbojjak` 이름으로 집계되므로 지표엔 영향이 없다. 바꾸려면 하영님이 `aitk agent revoke` 후 진저님 머신에서
`aitk agent authorize`(현재 CLI `0.7.13`에 있음) → 미니에서 `agent import`.

뽀짝이가 짚은 남은 수집 공백: 수집 경계를 넘는 도구 결과 연결 · 작업 ID 연결 · read-guard 이벤트 ·
실제 Slack 전달 결과(출력 생성과 발송 성공은 다르다). 도구 실패는 collector가 `tool_result.is_error`로 이미 센다.

뽀케터(9/8 17:32 답, DM `D0BNWKWKXTM`): aitk `0.7.8`, **인증 계정 `hayoung.choi@gpters.org`** — §1의 신원 상속 그대로다.
`bbokeoter/hermes` 수집기 installed·scheduleLoaded true(마지막 성공 시각은 status 출력에 없음). `aitk agent status`는 명령 자체가 없어
에이전트 전용 인증 없음. 즉 뽀케터는 아직 #116 흐름 이전 상태이며, 지인님 머신에서 CLI 업그레이드 → `agent authorize`(소유자는 지인님)
→ 옛 개인 토큰 제거가 남아 있다. 뽀케터 활동은 지금 하영 개인 이름으로 집계될 수 있으므로 그 전까지 사람 지표에서 걸러 봐야 한다.

---

## 4. 이번에 처리한 것

### 커밋

| 커밋 | 내용 |
|---|---|
| `4b798639` | 뽀짝이 관측 컨텍스트 인수인계 + 착수 전 교차검증 정정(§7) |
| (폐기) | `/ax/tv` TV 보드 — 만들었다가 **9/8 폐기**. 브랜치에서 뺐고 `tv-board-archive` 태그로만 남겼다 |
| `7610f6bf` | 뽀짝이 두 방(#021·#024) Slack 규칙 |
| `73b68bb5` | 뽀짝이는 DM을 받지 않는다 |

### 운영 DB 변경 (사용자 승인 후 실행)

퇴사자로 본 계정 2건을 `suspended`로 바꿨다. **9/8 정정: 송다혜님은 파트타임으로 재직 중이라 `active`로
복구했다**(`deactivated_at`·사유 null). 실제 정지 대상은 김소연 1건이다. 미니가 송다혜님 개인 토큰을
물려받았던 문제 자체는 재직 여부와 무관하게 맞다 — 봇은 개인 계정으로 돌면 안 된다.

**9/8 오프보딩 완료 (DEV-4347)**: 김소연 + 5월 이전 마지막 로그인 6명 + 홍지연 옛 계정(`chloe@`) = 8명.
admin 화면의 멤버 제거는 하영님이 GPTers 조직 안에서 `org_viewer`라 안 먹었다(라우트는 org_admin/super_admin
요구, 둘 다 진우님뿐). 라우트와 같은 5개 쓰기를 한 트랜잭션으로 하는 스크립트를 하영님이 직접 실행했다 —
소속 offboarded 8 · 계정 suspended 8 · access 토큰 45 비활성 · refresh 2 폐기 · 인가 코드 4 삭제.
복구는 admin 화면에서 같은 이메일로 멤버 재추가(POST 라우트가 소속·계정을 되살린다). 토큰은 재로그인.
이어서 그 8명이 소유하던 카탈로그 29개(skill 26 · command 3)의 `author_id`를 하영님 계정으로 옮겼다 —
정지 계정 소유 항목은 admin만 고칠 수 있어서다. 담당자가 정해지면 그때 넘긴다. §5-1의 "31개"는 이 시점
기준으로 정리됐다(송다혜님 16개는 재직 중이라 그대로).

```
dahye@gpters.org  (송다혜)  active → suspended   deactivated_at=2026-09-07 17:53 KST
soyeon@gpters.org (김소연)  active → suspended   deactivated_at=2026-09-07 17:53 KST
reason: '퇴사 — 2026-09-07 계정 정리'
```

⚠️ **정지만으로는 §1의 유출이 안 멈춘다.** 인증이 `oauth_access_tokens` 유효성만 보고 계정 상태를
보지 않는다. 실질적 차단은 미니에서 토큰을 덮어쓰는 것(§3의 2~4단계)이다.

스크립트: 세션 스크래치패드 `suspend-departed.mjs` (`APPLY=1` 없이 돌리면 조회만).

---

## 5. 이 과정에서 드러난, 따로 처리할 것

### 5-1. 정지 계정이 소유한 카탈로그 항목 31개

```
dahye@gpters.org  → 16개
soyeon@gpters.org → 15개   (utm-builder, utm-builder-rona 포함)
```

MCP 핸들러의 소유권 검사가 **"작성자 본인 또는 admin"**이라(`handlers.ts:555·902·969·1096`
"admin can override ownership check"), 이 31개는 이제 **admin만 고칠 수 있다.**

> 뽀짝이는 이걸 "소유자가 개인 계정이라 못 고친다"고 설명했는데 **사실이 아니다.** 소유자는
> 회사 계정(`soyeon@gpters.org`)이었고 당시 `active`였다. 진짜 원인은 진저·타타가 `viewer`라
> 소유권 검사를 못 넘는 것이다. **회사 계정으로 묶는다고 이 문제는 안 풀린다.**
> 개인 도메인 계정이 소유한 항목은 DB에 **0개**다.

해결책 후보: `author_id`를 현 담당자로 옮기거나, 조직 단위 소유 개념을 넣거나, 담당자에게
`editor` 이상을 주거나.

### 5-2. 정식 오프보딩 경로는 「조직 → 멤버 제거」다 (9/8 정정)

9/7에는 "계정 정지 기능이 앱에 없다"고 적었는데 **틀렸다.** admin 사용자 페이지의 PATCH는
`role`만 바꾸지만, `DELETE /api/organizations/[orgId]/members`(admin 조직 화면의 멤버 제거 버튼)가
정식 오프보딩이다 — 마지막 활성 소속이 끝나면 `suspended` + access/refresh 토큰 전부 비활성화 +
인가 코드 삭제까지 한 번에 한다.

문제는 이 경로를 **아무도 안 눌렀다**는 것이다. 9/7의 SQL 정지는 `account_status`만 바꿔 반쪽이다
(소속 남음, 김소연 토큰 1개 생존). 마무리는 admin 화면에서 두 사람을 멤버 제거하는 것이다.

그리고 9/7 시점엔 Bearer 검증(`validateAccessToken`)과 리프레시 발급이 **계정 상태를 안 봤다** —
`isAllowedAccountEmail`은 @gpters.org면 무조건 통과. 그래서 SQL 정지로는 토큰이 안 막혔다.
9/8에 정지 계정의 토큰을 거부하도록 고쳤다(`fix(auth)` 커밋).

### 5-3. 퇴사자 계정 점검 크론을 붙였다 (9/8)

두 계정 다 마지막 로그인이 4월·8월인데 9월까지 `active`였다. 9/7엔 우연히 발견했다.
9/8에 `api/cron/account-audit`(매일 05:30 UTC)를 붙였다 — 휴면(90일 넘게 로그인 없는 active),
반쪽 정지(suspended인데 소속·토큰 남음), 이름 중복(같은 이름의 활성 계정)을 찾아 `#toolkit-알림`에
목록을 낸다. 문제가 없으면 조용하다. 퇴사 판정은 사람 몫이라 **결론이 아니라 물어볼 목록**이다.

9/8 실측(수동 조회): 휴면 후보 6명(최수민 2025-12 · 이강준·김한솔·신연권 2026-01 · 김욱영 2026-01 ·
조재호 2026-02, 전원 아직 조직 멤버, 신연권 소유 스킬 9개), 이름 중복 1건(홍지연 `chloe@`·`ginger@`).
정리 여부는 진우님께 물어보는 중.

---

## 6. 아직 시작 안 한 본 작업 — 관측 파이프라인

`2026-09-07-agent-ops-context-handoff.md` §3·§4가 요구하는 것은 **하나도 만들어지지 않았다.**
기존 텔레메트리 배치는 창 단위 **합계**만 담아서 §3의 분포·문자 수 지표를 담을 수 없다(같은 문서 §7-4).

| | 작업 | 비고 |
|---|---|---|
| W2 | 스키마 3종 — `ops_metric_samples` · `ops_events` · `ops_collector_runs` | `unit`(chars/bytes/tokens) 컬럼으로 단위 혼동 방지. 마지막 마이그레이션은 0038 |
| W3 | `ops-metrics-contract.ts` — 허용 지표 화이트리스트·단위 고정·PII 거부 | 선례 `agent-telemetry-contract.ts` |
| W4 | `POST /api/ops/metrics` + 미들웨어 **정확 일치** 등록 + 테스트 | 인증은 `/api/ax/agent-telemetry` 방식(Bearer + SHA-256 스코프 해시) |
| W5 | 미니 수집기 (레포 밖) — §3의 12개 지표 | 여기부터 데이터가 쌓인다 |
| W6 | `ops_events`에 9/7 변경 3건 시드 (A 14:27 `49461c2` · B 15:28 · C 15:56 `824c261`) | 차트 주석선 기준점 |
| W7 | AX 패널 — P1 컨텍스트 추세 · P2 규칙 이행 | |
| W8 | (폐기) TV 화면 | 9/8 TV 보드 폐기. 다시 필요하면 `tv-board-archive` 태그에서 복원 |
| W9 | P3~P6 확장 | |

---

## 7. 작업 환경 메모

- **worktree**: `.claude/worktrees/ops-agent-observability`, 브랜치 `worktree-ops-agent-observability`,
  base `origin/main` 06c743cb. 다른 코딩 에이전트가 같은 레포에서 병행 중이니
  `AxDashboard.tsx`·`components/ax/panels/*`는 건드리지 않는다.
- **로컬 dev**: env는 **`apps/web/.env.local`**에 둔다(루트 `.env.local`에 두면 next-intl이 자기
  자신으로 307 무한 리다이렉트한다). 실행은 `apps/web`에서 `corepack pnpm exec next dev`.
  `DEV_BYPASS_AUTH=true` + `INTERNAL_ORGANIZATION_DOMAIN` + `NEXTAUTH_SECRET` 필요.
- **로컬 build**: `NEXT_PUBLIC_BASE_URL`이 `.env.local`에 없어 `/robots.txt` 프리렌더에서 실패한다.
  Vercel 환경변수라 로컬에선 인라인으로 주고 돌린다.
- **교차검증**: Codex(`codex exec -m gpt-6-astra -s read-only`) + Fable(Agent, model=fable)을 같은
  브리프 파일로 돌린다. 9/7에도 각각 다른 결함을 잡았다 — Codex는 이중 계상·SQLite 전량 로드,
  Fable은 운영 문서의 명문 금지 조항과 트랜스크립트 경로 불일치.
