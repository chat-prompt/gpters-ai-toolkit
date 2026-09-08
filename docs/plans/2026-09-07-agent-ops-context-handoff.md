# 사내 에이전트(뽀짝이) 개선용 관측 컨텍스트 — 대시보드가 수집·시각화할 것 (2026-09-07 인수인계)

**목적**: 9/2~9/7 `bbojjak-analysis` 조사에서 "에이전트를 고치려면 무엇을 봐야 하는가"가 확정됐다. 이 문서는 그 결과를 **대시보드(apps/web)가 수집·저장·시각화할 수 있는 형태**로 옮긴 것이다. 9/4 인수인계(`bbojjak-analysis/analysis/HANDOFF-DASHBOARD.md`, 상황판 P1~P6·파이프라인·TV 요구사항)는 그대로 유효하고, 이 문서는 **그 이후 바뀐 사실·새 지표·정정**을 담는다. 두 문서를 같이 읽는다.

원 분석 위치: `bbojjak-analysis/HANDOFF.md`(현재 상태) · `analysis/LOG.md` §26~§31(9/7 과정) · `analysis/FINDING-0907-tool-inventory.md` · `analysis/EXP-0907-history-replay.md` · `analysis/impl/12-rules-move/`, `13-read-guard/`. Linear: DEV-4320(부팅·컨텍스트) · DEV-4277(할루 원인) · DEV-4279(지식 SSOT) · DEV-4300(느려짐, 관측만).

---

## 0. 9/4 문서에서 **틀린 것으로 확인된 것** (대시보드에 그대로 그리면 안 됨)

| 9/4 문서의 서술 | 9/7 실측 | 대시보드 영향 |
|---|---|---|
| "컴팩션 요약이 CLI `--resume` 경로에서 폐기돼 무효" (P1) | **틀림.** CLI 네이티브 자동 컴팩션이 ≈978k 에서 실제로 돌고 요약을 정상 사용(9/4 타타 스레드 978,140 → 17,492). OpenClaw 컴팩션(980k)은 발동 기회가 없음 | P1 임계선은 **978k(CLI)**. "컴팩션 = 무효" 경고문 삭제. 컴팩션 발생은 이상이 아니라 "3분 정지 + 세부 망각" 비용 이벤트로 표시 |
| "세션 50/50 상한, 19.5시간마다 축출" (P3) | **틀림.** 슬랙 스레드 세션은 `maxEntries` 축출에서 **보호**된다(`isProtectedSessionMaintenanceEntry`). 사라지는 경로는 `/new`·03:00 유휴 24h 리셋뿐 | P3 "축출 수" 대신 **03:00 리셋 수·다이제스트 수·미정리 수**(`session-wrapup.log`)를 그린다 |
| "MEMORY.md 가 채널 세션에 주입 안 됨 → 도구 접근 추세로 감시" (P2) | 9/7 A안으로 채널 필수 11절을 **AGENTS.md 로 원문 이관**(자동주입). 나머지는 여전히 `memory_search`/Read | P2 는 유지하되 "기억 미주입" 문구는 "MEMORY.md 잔여분(24기 상태·제도·잔여·함정)만 도구 접근" 으로 |
| "첫 턴 ~117k, ctx p50 127k" | 업그레이드 후 **첫 턴 p50 86,931**, 세션 peak p50 102,481, 200k 초과율 7.0%→6.8%(불변). 9/7 규칙 이관 후 첫 턴 p50 **93,771**(+7k, 규칙이 작동하게 하는 대가) | 기준선을 교체. "이관 전/후" 주석선 필요 |
| 자수 단위 | 9/7 오전 문서들의 "자수" 일부가 `wc -c` **바이트**였음(한글은 ×1.9). `systemPromptReport.*Chars`·`bootstrapMaxChars` 는 **문자 수** | 대시보드는 **문자 수·바이트·토큰을 별도 필드**로. 절대 섞지 말 것 |

---

## 1. 9/7 에 적용된 변경 3건 — 전후 비교가 필요한 것

대시보드가 "이 변경이 효과가 있었나"를 보여줘야 다음 개선 결정이 가능하다. 각 변경의 **적용 시각을 주석선**으로 두고 전후를 같은 지표로 비교한다.

| # | 변경 | 적용 | 기대 효과 | 확인 지표 |
|---|---|---|---|---|
| A | **rules 01(응답 판단)·03(권한) → AGENTS.md 원문 이관** — 채널 세션에 자동주입. 실측: 이관 전 채널 세션의 19%만 rules 를 읽었고 01 은 4% | 9/7 14:27 커밋 `49461c2`(+`4ac046e`·`79a680c`·타타 결정 `6171f25`) | 침묵 사고·존댓말 끼어듦·권한 오판 감소. 비용: 첫 턴 +7~9k 토큰 | §3 의 `first_turn_tokens`, `incident_candidates`(3유형), `rules_read_sessions` |
| B | **슬랙 봉투 히스토리 매 턴 재전송 제한** `channels.slack.accounts.bbojjak.historyLimit: 8`(종전 기본 50) — 재생 실험으로 히스토리가 `--resume` 과 완전 중복임을 확인(B 조건 −37%, 기억 동일) | 9/7 15:28 (hybrid 리로드, 9/8 확인 필요) | 세션 컨텍스트 성장률 감소, 특히 장수 스레드. 위험: 03:00 리셋 뒤 첫 턴 씨앗 손실 | `wrapper_history_repeat_ratio`, `ctx_growth_per_turn`, `peak_ctx`, 리셋 후 첫 턴 씨앗 유무 |
| C | **read-guard 훅**(PreToolUse: Read·Bash·sessions_history·sessions_list) — 8,000자 넘는 통째 Read·`cat` 차단, 세션·파일 누적 32k 차단, 세션 도구 limit 강제 + AGENTS.md 「📉 컨텍스트 절약」 3줄 + 도구 인덱스 압축(27,045 → 26,360자) | 9/7 15:56 커밋 `824c261`, 훅 `~/.claude/hooks/read-guard.py` | 도구 결과가 컨텍스트 성장의 55% → 감소. 위험: 차단 뒤 잘게 나눠 읽는 루프, 정당 작업 차단 | `read_guard_deny/allow`, `post_deny_read_ratio`, `tool_result_chars_by_tool` |

---

## 2. 데이터 소스 (전부 미니 `bbojjak-mini`, ssh `bbojjak`, **읽기 전용**)

| 소스 | 경로 | 무엇이 있나 | 주의 |
|---|---|---|---|
| 세션 DB | `~/.openclaw/agents/bbojjak/agent/openclaw-agent.sqlite` (`mode=ro`) `session_nodes` | 세션별 `entry_json`: `claudeCliSessionId`, `totalTokens`, **`systemPromptReport`**(아래), `abortedLastRun`, `lifecycleRevision` | 2.7GB WAL. 반드시 `file:…?mode=ro`. `transcript_events` 는 대화 원문(PII) — 올리지 말 것 |
| `systemPromptReport` | 위 entry_json 안 | `systemPrompt.chars`, `injectedWorkspaceFiles[{name, injectedChars, truncated}]`, `bootstrapTruncation{nearLimitFiles, truncatedFiles, warningShown}`, `tools.schemaChars`(설명 미포함) + `tools.entries[{name, schemaChars, summaryChars}]`, `currentTurn.promptChars` | 세션 시작 시점 스냅샷. 문자 수 단위 |
| CLI 트랜스크립트 | `~/.claude/projects/-Users-<user>--openclaw-workspace-bbojjak/<cliSessionId>.jsonl` (⚠️ 실제 위치는 §7-2 참고) | 턴별 `usage`(input/cache_creation/cache_read/output), tool_use 이름·입력, tool_result 크기, 사용자 봉투 원문 | **유일한 도구 호출 소스**(OpenClaw 쪽엔 안 남음). 원문·경로에 PII 있음 → 집계만 |
| 훅 로그 | `~/.claude/hooks/read-guard.jsonl` | `{ts, session, tool, path, decision(allow/deny), chars, offset, limit, cumulative}` 5MB 회전 | 9/7 15:56~ 신규. `absence-guard.log`·`slack-bold-guard.log` 도 같은 폴더 |
| 랩업·폴러 로그 | `~/.openclaw/logs/session-wrapup.log`(03:00 리셋·다이제스트·미정리 수) · `context-watch.log`(5분, `max=NN%`, `posted=`) | 생존 신호·리셋 통계 | 9/4 문서 P3·P4 그대로 |
| 크론 | `openclaw cron list`(ok/실패, 마지막 실행) | 03:00 정리·23:00 업무일지·밤 자율작업 | `lastRunStatus=ok` ≠ 스크립트 성공(9/4 문서) |
| 설정 | `~/.openclaw/openclaw.json` | `historyLimit`, `bootstrapMaxChars`(32,000), `session.maintenance`, 채널별 `requireMention` | 변경 이력은 `.bak-*` 파일 |
| 워크스페이스 git | `~/.openclaw/workspace-bbojjak` | AGENTS.md 자수·커밋 작성자·"auto: 세션 정리" vs 사람 커밋 | 봇 자기수정(M6) 감시 소스 |

---

## 3. 수집할 지표 정의 (9/7 확정분 — 계산식과 스크립트가 이미 있다)

기존 P1~P6 에 더해 아래를 수집한다. 전부 `bbojjak-analysis/analysis/tools/oc_sqlite.py`·`~/tmp/bbojjak-analysis/obs_daily.py`(미니)·`watch_thread.py`·LOG §26 스크립트 요지에서 계산식을 그대로 가져올 수 있다. **주기 = 하루 1회(09:13)** 면 충분하고, `context-watch` 만 5분.

| 지표 | 정의 | 소스 | 단위 | 기준선(9/7) | 주의/임계 |
|---|---|---|---|---|---|
| `first_turn_tokens` p50/p95 | 세션 첫 assistant 턴의 `input+cache_creation+cache_read` | CLI 트랜스크립트 | 토큰 | 이관 전 86,931 / 이관 후 93,771 (n=12) | 채널 vs 크론 세션 분리(크론 37~45k). 목표 70k |
| `peak_ctx` p50/max, `over_200k_rate` | 세션 최대 입력 토큰, 200k 초과 세션 비율 | 〃 | 토큰, % | 102,481 / 6.8% | 목표 3.4%. **CLI 컴팩션 임계 978k** |
| `ctx_growth_by_component` | 세션별 사용자 텍스트(봉투)·도구 결과·도구 입력·assistant 텍스트 자수 | 〃 | 문자 | 4일 합 11.5M: 55%/27%/15%/3% | 이미지 블록은 자수 아님(Opus 5 장당 ≤4,784 토큰) |
| `wrapper_history_repeat_ratio` | 봉투(`Conversation info` 블록)의 `#session:`/`#<ts>` 줄 중 직전 턴 봉투와 동일한 줄 비율 | 〃 | % | 67.9% (변경 B 전) | 변경 B 효과 지표. 봉투 줄 수 ≤8 확인 |
| `tool_result_chars_by_tool` | 도구별 tool_result 텍스트 자수 합·p50·p90·max | 〃 | 문자 | Bash 4.0M(누적 최대)·Read 단일 최대 33k·sessions_history 42k | 이미지 base64 제외 |
| `rules_read_sessions` | 세션 중 `.claude/rules/0N-*.md` 를 Read 한 비율(파일별) | 〃 | % | 이관 전 19%(01: 4%, 02: 15%) → 이관 후 01·03 은 0 이 정상, 02 는 발송 세션에서 유지돼야 함 | 02 가 0 으로 떨어지면 이상 |
| `read_guard_deny`, `read_guard_allow` | 훅 로그 결정 수(도구별·경로 종류별) | `read-guard.jsonl` | 건 | 9/7 15:57~ deny 2·allow 2 | deny 급증 = 정당 작업 차단 의심 |
| `post_deny_read_ratio` | 차단된 파일에 대해 같은 세션이 이어서 허용받은 자수 ÷ 파일 자수 | 훅 로그 + 파일 크기 | 비율 | — | 1 에 가까우면 우회(잘게 나눠 읽기). 0.1 이하가 목표 |
| `incident_candidates` | ① 멘션 받고 `NO_REPLY` ② 존댓말·무멘션 대화에 응답 ③ 비관리자 요청에 "수정/발송했어요" | 트랜스크립트(`obs_daily.py` 휴리스틱) | 건 | 9/7 ①1건(질문 문구 유발, 재질문 정상) | 후보일 뿐 — **사람/에이전트 판정 후에만** "사고"로 표시 |
| `agents_md_chars`, `near_limit_files` | 주입 AGENTS.md 문자 수, `bootstrapTruncation.nearLimitFiles` | systemPromptReport | 문자, 건 | 26,360 (82%), 0 | 경고선 85% = 27,200 / 한도 32,000 |
| `system_prompt_chars`, `tools_total_chars` | `systemPrompt.chars`, `tools.schemaChars + Σsummary` | 〃 | 문자 | 46,183 / 54,597(32개 도구) | 도구 5주 미사용 11개(12,113자) 끄기는 보류 |
| `compaction_events` | CLI `compact_boundary` 발생 수·preTokens | 트랜스크립트 | 건 | 9/3~9/7 1건 | 발생 = 3분 정지 이벤트 |
| `session_reset_stats` | 03:00 리셋 수·다이제스트 수·미정리 수 | `session-wrapup.log` | 건 | 9/5 27 · 9/6 28 · 9/7 8 | 9/4 P3 대체 |
| `workspace_self_edits` | 하루 중 봇 커밋(`auto:`·밤 자율작업)이 AGENTS.md·rules·policies 를 건드린 수 | 워크스페이스 git | 건 | 8/26 `99600c8` 실적 있음 | DEV-4277 조치 8 감시. 9/7 AGENTS.md 에 "자율작업 중 수정 금지" 추가 |

**계산 스크립트 위치**: `bbojjak-analysis/analysis/tools/oc_sqlite.py`(metrics/health/boot/thread) · 미니 `~/tmp/bbojjak-analysis/obs_daily.py`(첫 턴·rules Read·후보 턴) · `watch_thread.py`(스레드 단위) · `analysis/snapshots/0907-tool-inventory/`(도구 인벤토리 CSV·리뷰) · LOG §26 에 봉투 반복률·성분 분해 스크립트 요지.

---

## 4. 파이프라인 — 9/4 설계에 덧붙이는 것

- **push 만**(미니 → `POST /api/ops/metrics`, API key). 웹은 미니를 못 읽는다. 원본·세션 키·스레드 ts·파일 경로·사람 이름은 올리지 않는다(경로는 종류로 분류해서: SKILL.md/rules/learnings/일지/기타).
- 하루 1회 배치(09:13) + `context-watch` 5분. 배치 실패는 **결측**으로 남긴다(0 으로 그리지 않는다).
- 변경 A·B·C 의 **적용 시각을 이벤트 테이블**에 넣고 차트에 주석선으로 그린다. 앞으로의 개선도 전부 이 방식(변경 → 전후 비교)이므로 `ops_events{ts, agent, kind, ref(Linear/commit), note}` 테이블이 필요하다.
- 후보 턴(`incident_candidates`)은 원문 없이 **건수와 유형만**. 판정은 `bbojjak-analysis` 세션이 트랜스크립트를 읽고 LOG 에 남긴다 — 대시보드는 "후보 n / 확정 m" 두 숫자.
- 단위 필드를 강제: `chars`(문자), `bytes`, `tokens` 를 이름에 넣는다.

---

## 5. 운영 규칙 (이 조사에서 배운 것, 수집기·화면 둘 다 적용)

1. 미니는 읽기 전용. 수집기가 미니에 쓰는 유일한 것은 자기 로그 1개. 9/7 에 오프라인 재생이 실제 훅 로그 경로에 675줄을 써서 기준선을 오염시킨 사고가 있었다.
2. 슬랙 게시는 봇 토큰이 아니라 사람 계정 커넥터로만. 디버깅 방(`#024`)은 하영·진우 전용, 팀원·타타에게 묻는 건 `#021-뽀짝이-업무방`. 형제 봇 이름(뽀야·뽀둥이·뽀식이·뽀케터)을 메시지에 쓰면 `mentionPatterns` 로 그 봇이 소환된다 — 역할어로.
3. "죽은 것"과 "조용한 것"을 구분한다(9/4). 여기에 하나 더: **"규칙이 있는 것"과 "규칙이 읽히는 것"을 구분한다** — rules 파일이 있어도 19%만 읽었다. 대시보드는 "존재"가 아니라 "관측된 행동"을 그린다.
4. 훅은 문서보다 강하다(뽀짝이 본인 판단: 문서 지시 준수율 19%, 훅 100%). 앞으로 규범을 넣을 때는 훅 로그를 같이 설계한다.
5. 교차검증: 수치·설계는 Codex(`codex exec -m gpt-6-astra -s read-only`)와 별도 Fable 세션, 그리고 뽀짝이 본인 검토를 거친다. 9/7 에 세 검증자가 각각 다른 결함(단위 오류·limit 줄 수 우회·Bash 우회)을 잡았다.

---

## 6. 열린 것 (대시보드가 답을 줘야 하는 질문)

- 변경 B(historyLimit 8)가 실제로 봉투 줄을 줄였나, 03:00 리셋 뒤 첫 턴 씨앗은 남나 → 9/8 아침 확인. 안전하면 0 까지 갈지.
- 변경 C 뒤 정당 작업 차단(`read_guard_deny` 중 SKILL.md·rules·코드 0 이어야 함)과 우회(`post_deny_read_ratio`)가 있나.
- 변경 A 뒤 침묵·끼어듦·권한 오판 후보가 줄었나(3일 관측 ~9/10, `bbojjak-analysis` 세션 크론 09:13 이 판정).
- 첫 턴 70k 목표는 어디서 줄일 수 있나 — 남은 후보: AGENTS.md 「팀 운영 컨텍스트」·auto-memory 인덱스(13.6k자, DEV-4279 와 함께), 도구 11개(보류).
- M4(미전달)·M5(도구 뒤 침묵) 테이블(`conversation_deliveries`·`message_tool_run_outcomes`)이 채워지기 시작하는지 — 9/14 까지 0행이면 DEV-4300 Done.

---

## 7. 착수 전 교차검증 결과 (2026-09-07, toolkit 세션)

이 문서를 받은 `gpters-ai-toolkit` 세션이 착수 직전 **Codex(astra)·Fable 두 검토자**에게 계획을
교차검증시키고(§5-5 규칙), 지적을 레포 코드로 재확인한 결과다. 아래는 **확정된 정정**이다.

### 7-1. 뽀짝이는 `claude-code` **한 소스로만** 수집기에 등록한다

착수 계획은 "openclaw(SQLite) + claude-code(트랜스크립트) 두 소스로 등록"이었다. **틀렸다.**

- openclaw SQLite 수집 경로는 `transcript_events` 테이블을 읽는다
  (`apps/aitk-cli/src/agent-telemetry/openclaw.ts`). 이건 Claude CLI 트랜스크립트와 **같은 대화**다.
- 서버는 소스를 구분하지 않고 agent 단위로 합산한다(`packages/lib/src/features/ax/agent-activity.ts`).
  `(agent_id, source)` 유니크 인덱스는 **등록 중복만** 막지, 집계 중복은 못 막는다.
- 체크포인트가 `<agentId>-<source>.json`으로 분리되고 `seenMessages` 해시도 소스마다
  다른 세션 식별자로 만들어져서, **소스 간 중복 제거가 원천적으로 불가능**하다.
- 코드에 이미 이 위험이 경고로 박혀 있다 — "OpenClaw·Claude 중복 가능성 … 토큰·턴을 이중 계상할 수 있습니다".
- 그리고 운영 문서가 이미 명문으로 금지한다(`infra/agent-telemetry/README.md`):
  > Do not install OpenClaw and Claude Code collectors for overlapping work;
  > prefer the runtime transcript when gateway summaries lack reliable tool and skill activity.

§2가 "CLI 트랜스크립트가 **유일한 도구 호출 소스**"라고 적은 것과도 맞는다. 런타임 원본을 쓴다.

### 7-2. ⚠️ 트랜스크립트 실제 경로를 **설치 전에 확인해야 한다**

§2는 CLI 트랜스크립트를 `~/.claude/projects/-Users-<user>--openclaw-workspace-bbojjak/`로 적었다.
그런데 `docs/plans/2026-08-19-agent-usage-wiring.md`는 봇들이

```
CLAUDE_CONFIG_DIR=~/.openclaw/agents/<bot>/agent  claude ...
```

로 돈다고 기록하고 있다. 그렇다면 트랜스크립트는 `$CLAUDE_CONFIG_DIR/projects/` 아래, 즉
`~/.openclaw/agents/bbojjak/agent/projects/`에 있을 수 있다. **두 문서가 어긋난다.**

경로가 틀리면 수집기가 파일을 0개 찾고 `no-files-in-scope`로 설치가 거부된다. 미니에서
`ls`로 실제 위치를 먼저 확인하고 `--sessions-dir`를 정한다. `--project-slugs`는 전체 경로가
아니라 **첫 하위 디렉터리명 하나**이며 정확히 일치해야 한다.

### 7-3. 최초 설치는 `--days 1`로 한다

기본값 `--days 7`로 설치하면 첫 backfill 배치의 창 시작이 대시보드 7일 조회 cutoff보다
앞서서, 그 배치가 **통째로 합계에서 제외**된다(`agent-activity.ts` — 기간에 완전히 들어온
batch만 합산, 제외 사실은 insight로 표시). `--days 1`이면 첫 배치가 바로 창 안에 들어온다.
이후는 1시간 증분이라 문제없다.

### 7-4. 기존 수집기는 §3 지표를 **하나도 만들지 않는다** — 범위를 혼동하지 말 것

배치 계약(`apps/aitk-cli/src/agent-telemetry/types.ts`의 `AgentTelemetryBatch`)은 창 단위
**합계**만 담는다: 토큰 총량, 세션·턴 수, 도구별 `{호출수, 실패수}`, 스킬 로드, 작업 분류.

§3의 `first_turn_tokens`·`peak_ctx`·`ctx_growth_by_component`·`wrapper_history_repeat_ratio`·
`tool_result_chars_by_tool`·`rules_read_sessions`·`read_guard_*` 등은 **분포와 문자 수**이거나
트랜스크립트 밖 소스(훅 로그·wrapup 로그·systemPromptReport·워크스페이스 git)라 이 계약에
들어갈 수 없다. 특히 p50/p95는 창 합계로 되돌릴 수 없다.

→ 뽀짝이 등록으로 얻는 것은 **토큰·도구·스킬 3개 축**뿐이다. §3·§4의 push 파이프라인
(`ops_metric_samples`·`ops_events`·`ops_collector_runs` + `POST /api/ops/metrics`)은 그대로 필요하다.

### 7-5. §5-1 문구 정정 — "자기 로그 1개"

설치형 수집기는 실제로 Keychain 항목, `~/.cache/gpters-aitk/agent-telemetry/`의 설치 기록·
체크포인트, LaunchAgents plist, stdout/stderr 로그를 쓴다. 체크포인트 쓰기를 없애면 재전송
멱등성이 깨지므로 없앨 수도 없다. 취지(에이전트 데이터를 건드리지 않는다)는 지켜지므로
규칙을 다음으로 읽는다:

> 수집기는 **자기 디렉터리 밖에 쓰지 않는다.** `~/.openclaw/`·`~/.claude/hooks/`·워크스페이스에는
> 절대 쓰지 않는다. DB는 `mode=ro`로만 연다.

### 7-6. TV 화면(9/4 §4)에 대한 확정 사항

> 2026-09-08: TV 화면 자체는 **폐기**했다(`tv-board-archive` 태그). 아래는 다시 만들 때를 위한 기록이다.

- **인증은 3중이다** — 미들웨어·페이지·패널 API. `?tv=1` 같은 화면 플래그만으로는 데이터
  조회가 전부 실패한다. TV는 **내부 도메인의 viewer 역할 전용 계정**으로 키오스크 로그인한다
  (관리자 계정을 쓰면 admin 전용 패널이 TV에 노출된다). 세션은 폴링이 갱신을 유지한다.
- **기존 대시보드를 그대로 띄우면 안 된다** — 데이터 로더가 캐시가 있을 때 재조회 실패를
  조용히 넘긴다(`AxDashboard.tsx`의 `if (cached) return`). 무인 TV에서는 세션이 끊겨도
  마지막 값이 영구히 남는다. 9/4 §4가 요구한 "연결 끊김을 화면에 표시"와 정면으로 충돌한다.
- `panelOk`의 `generatedAt`은 **응답 생성 시각**이지 데이터 수집 시각이 아니다. TV의
  "마지막 갱신"으로 그대로 쓰면 안 되고, 마지막 **성공** 응답 시각을 따로 들고 있어야 한다.
- 구현은 기존 `AxDashboard.tsx`를 건드리지 않고 별도 라우트·컴포넌트로 둔다(동시 작업 충돌 회피).
