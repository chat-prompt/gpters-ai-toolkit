# semantic_search 두 갈래 — 재랭킹(정확도)과 임베딩 지연(성능)

작성 2026-09-21. 이 문서 하나로 두 작업을 이어받을 수 있게 썼다.

## 여기부터 — 어느 트랙을 할지 먼저 정한다

이 문서는 **서로 다른 두 작업**을 담고 있다. 하나만 골라서 한다. 두 개를 한 브랜치에서 같이 하지 않는다.

**고르는 법: 지금 있는 디렉터리가 정한다.** `pwd`를 찍어라.

| 지금 위치 | 할 것 | 읽을 절 | 이슈 | 브랜치 |
|---|---|---|---|---|
| `.claude/worktrees/dev-4484-search-rerank` | **트랙 A — 재랭킹 (정확도)** | §1 → §2 | [DEV-4484](https://linear.app/geniefy/issue/DEV-4484) | `hayoungchoi/dev-4484` |
| `.claude/worktrees/dev-4485-search-latency` | **트랙 B — 지연 (성능)** | §1 → §3 | [DEV-4485](https://linear.app/geniefy/issue/DEV-4485) | `hayoungchoi/dev-4485` |
| 그 외 (메인 체크아웃 등) | 아무것도 하지 말고 위 worktree 중 하나로 이동한다 | — | — | — |

worktree가 아직 없으면 (`git worktree list`로 확인):

```bash
cd /Users/hychoi/Projects/Geniefy/gpters-ai-toolkit
git worktree add -b hayoungchoi/dev-4484 .claude/worktrees/dev-4484-search-rerank origin/main
git worktree add -b hayoungchoi/dev-4485 .claude/worktrees/dev-4485-search-latency origin/main
```

**아직 트랙을 배정받지 않았고 어느 쪽이든 고를 수 있다면 B(지연)부터 한다.** A가 지연을 0.6~0.9초 더하는데 지금 이미 목표의 5배라, B를 먼저 잡아두면 A를 넣을 여유가 생긴다. 다만 **강제는 아니다** — A만 하라고 배정받았으면 그냥 A를 한다.

§1(공통 배경)은 두 트랙 모두 읽는다. §4·§5는 공통이다.

두 worktree 모두 `origin/main`(819533fb)에서 땄고 준비만 해뒀다. 코드 변경은 아직 없다(커밋 `1d9166a8`은 이 문서 자체다).

### 산출물을 어디에 쓰나

- **설계 노트·측정 기록**: 이 문서 옆에 `docs/plans/2026-09-21-<트랙>-<주제>.md`로 새 파일을 만든다. 이 문서는 고치지 않는다.
- **측정 수치**: 위 파일과 해당 이슈 코멘트 **양쪽에** 남긴다. 이슈만 보고 판단하는 사람이 있다.
- **임시 스크립트**: 커밋하지 않는다. 재현이 필요하면 명령을 문서에 적는다.

---

## 0. 하면 안 되는 것 (두 트랙 공통)

- `pnpm db:push` / `pnpm db:generate` / `packages/db`의 guarded migration runner 실행
- `pnpm test:api` / `pnpm test:e2e` 실행 — `AGENTS.md`에 격리 DB와 전용 서버 없이는 금지라고 되어 있다
- **메인 체크아웃 `/Users/hychoi/Projects/Geniefy/gpters-ai-toolkit`에서 브랜치 전환·파일 수정.** 커밋 안 된 변경이 다수 있고 다른 작업이 진행 중이다. 작업은 위 worktree에서만 한다
- Vercel 배포
- 운영 DB를 바라보는 서버에 쓰기 요청

돌려도 되는 것: `corepack pnpm --filter @gpters/web test` (unit만 돈다), `corepack pnpm --filter @gpters/lib test`, 타입체크, 린트, 운영 MCP **읽기** 호출.

---

## 1. 공통 배경 — 지금 검색이 어떻게 생겼나

**흔한 오해부터 정리한다. "keyword 검색 + semantic 검색 2단"이 아니다.** SQL 한 방이고, 키워드는 그 안의 보너스 항에 불과하다.

`packages/lib/src/search/vector-search.ts:66-73`

```ts
const similarity = sql`(1 - (cosineDistance(embedding, queryEmbedding)))
  + CASE WHEN name        ILIKE ${keywordPattern} THEN 0.15 ELSE 0 END
  + CASE WHEN description ILIKE ${keywordPattern} THEN 0.10 ELSE 0 END
  + CASE WHEN tags::text  ILIKE ${keywordPattern} THEN 0.05 ELSE 0 END`
```

여기서 알아야 할 것 다섯 가지:

1. **키워드 신호가 사실상 죽어 있다.** `keywordPattern`이 `%정제된 질문 전체%`다. 자연어 질문 한 문장이 통째로 description 안에 들어 있을 리 없으니 거의 안 걸린다. 2026-09-21 실측에서 상위 20개 전부 점수가 1.0 미만이었다 — 보너스 0이라는 뜻이다.
2. **`minSimilarity` 게이트(`:76`)는 순수 벡터 유사도를 쓰고, ORDER BY(`:135`)는 보너스 붙은 점수를 쓴다.** 보너스는 순서를 바꿀 뿐 문턱 아래 문서를 건져 올리지는 못한다.
3. **후보 풀이 없다.** `:136`의 `.limit(limit)`이 곧 최종 k다. ANN 인덱스에서 k개 뽑으면 끝이다. **지금 상태로는 재랭킹할 후보 자체가 없다.**
4. **폴백은 융합이 아니라 순차다.** 벡터가 0행일 때만 별도 ILIKE 쿼리가 돌고(`:140-221`), 결과는 전부 `similarity = 0.1` 고정(`:201`), 정렬은 `updatedAt DESC`.
5. **웹 UI용 Postgres FTS/트라이그램 경로가 따로 있다**(`packages/lib/src/search/full-text-search.ts:47`, 한국어는 `pg_trgm`). MCP는 그걸 안 쓴다. 분리 경위는 `docs/ANALYSIS_2026-02-23.md:206-211`.

### 규모

- `catalog_items` **약 405행** (`packages/db/drizzle/0020_restore_vector_indexes.sql:9`). `mcp_servers` 54, `cli_tools` 41.
- **청킹 없음.** 문서 1개 = 벡터 1개. 임베딩 입력은 `name + description + tags + readme + content`를 28,000자로 자른 것(`embedding.ts:27,192-207`).
- HNSW `halfvec_cosine_ops`, `m=16, ef_construction=64`.
- **405행이면 50~100개 overfetch해도 DB 시간은 sub-ms다.** 병목은 DB가 아니라 임베딩 API 호출이다.

### 호출 경로

```
클라이언트 → https://ai-toolkit.gpters.org/api/mcp
  → apps/web/app/api/mcp/route.ts:466  (JSON-RPC tools/call)
  → packages/lib/src/mcp/handlers.ts:1421  (case 'semantic_search')
  → packages/lib/src/search/vector-search.ts:39  semanticSearch()   ← 검색 엔진 전부
  → packages/lib/src/search/embedding.ts:58 + embedding-cache.ts:195
```

`semantic_search`는 **메타데이터만** 돌려준다(`handlers.ts:1465-1477`) — 본문·스니펫 없음, 잘라내기 로직도 없음. 본문은 후속 `get_plugin_content`가 `content`+`readme`+`files`를 **통째로** 돌려준다(`handlers.ts:280-315`). 시스템 전체에서 크기 제한은 OpenClaw 프록시의 80,000자 상한 하나뿐이다(`~/Projects/Geniefy/bbomit/plugins/ax-toolkit-read/index.js:196`).

뽀밋이가 쓰는 `ax_toolkit_search`는 서버 코드가 아니라 얇은 프록시다 — `~/Projects/Geniefy/bbomit/plugins/ax-toolkit-read/index.js:119-127`이 원격 `semantic_search`를 부른다.

**측정용으로 쓸 도구**: 에이전트에 `gpters-ai-toolkit` MCP가 붙어 있으면 그 `semantic_search` 도구가 **위 경로 그대로** 운영 `https://ai-toolkit.gpters.org/api/mcp`를 타고 `vector-search.ts`로 들어간다. 별도로 `curl`을 칠 필요 없고, 응답의 `searchTime` 필드가 서버가 잰 시간이다. MCP가 없으면 같은 엔드포인트에 JSON-RPC `tools/call`로 직접 쏘면 된다. **읽기 호출만 한다.**

---

## 2. 트랙 A — 재랭킹 (DEV-4484)

### 문제

임베딩 코사인 점수가 후보를 갈라내지 못한다.

2026-09-21, 운영 MCP에 "슬랙에 올라온 대화를 요약해서 정리해주는 도구"를 `limit=20`으로 물었다:

- `relevanceScore` **0.405 ~ 0.318** — 20개가 0.087 폭 안에 다 있다
- 1위가 `duckhu-archive`, **카카오톡** 아카이빙 도구다
- `meeting-archive`("Slack 스레드를 읽어서 회의록으로 아카이빙")는 2위
- `searchTime: 3041ms`

같은 후보 20개를 JEV(typesafe.ai System One, `jev-1.13.0`)에 noul로 물은 결과:

```
순위  임베딩                          →  JEV 재랭킹
 1    duckhu-archive        0.405    →  meeting-archive        0.87
 2    meeting-archive       0.388    →  openclaw-summarize     0.14
 3    claude-epub-reader    0.387    →  slack                  0.11
 4    kakao-extract         0.376    →  meeting-notes          0.09
...
10    kakaotalk             0.339    →  duckhu-archive         0.04

점수 폭: 임베딩 0.087  vs  JEV 0.86
0.3 넘는 후보: 1개
JEV 612ms · in=2,925 tok · $0.00012
```

### 왜 재랭킹 자리인가

JEV는 **코퍼스를 훑지 못한다.** 인덱스가 없고, 준 후보만 본다. 후보 수에 비례해 토큰을 쓴다(O(n)). 그래서 keyword나 vector를 **대체할 수 없고**, 그 뒤에 붙어야 한다.

반대로 keyword·vector는 훑는 걸 잘하지만 "말이 비슷한가"만 본다. "답이 되는가"는 못 본다. 역할이 갈린다.

```
지금:   질문 → 임베딩 → SQL LIMIT 5  → 모델          (정답이 6위면 영영 못 봄)
바꾸면: 질문 → 임베딩 → SQL LIMIT 50 → JEV → 문턱 통과분 → 모델
```

### 비용 근거

| 층위 | 영향 |
|---|---|
| DB | 사실상 0. 405행 HNSW, 5개든 50개든 sub-ms |
| 임베딩 | 변화 없음. 쿼리당 1회 그대로 |
| JEV | +$0.00012 (20개) ~ +$0.0003 (50개), +0.6~0.9초 |
| 다운스트림 | **여기가 핵심.** 잘못 고른 문서로 `get_plugin_content`를 한 번 부르면 최대 80,000자 ≈ 25,000토큰이 모델에 들어간다. Sonnet 5 입력가로 약 $0.05 |

**$0.0002짜리 재랭킹이 $0.05짜리 오폭을 한 번 막으면 250배를 갚는다.** 그리고 위 실측에서 첫 시도에 바로 오폭이 나왔다(카카오톡 도구가 1위).

### 삽입 지점

**`packages/lib/src/search/vector-search.ts`의 본 경로 반환 직전** — `results`가 배열로 materialize된 뒤, `:232`에서 시작하는 `return { items: results, ... }` 직전.

**반환 경로가 두 개다. 헷갈리지 마라.**

| 경로 | 위치 | 재랭킹 |
|---|---|---|
| 본 경로 (벡터 결과 있음) | `:232`의 `return` | **여기에 붙인다** |
| ILIKE 폴백 (벡터 0행일 때만) | `:216-221`의 `return` | **붙이지 않는다** (아래 이유) |

폴백은 `similarity`가 전부 `0.1` 고정이고 정렬이 `updatedAt DESC`라, 점수가 아니라 "벡터가 아무것도 못 찾았다"는 신호에 가깝다. 여기에 재랭킹을 붙이면 **임베딩이 실패한 상황에서 JEV까지 부르는** 꼴이라 지연만 늘어난다. 폴백 경로 재랭킹은 일부러 범위 밖에 둔다 — 하고 싶으면 별도 이슈로 뺀다.

여기를 고르는 이유:

- **모든 호출자가 여기를 지난다** — MCP `semantic_search`, Rona 연습 검색, CLI
- 행에 이미 `content`·`readme`·`tags`·`likes`·`updatedAt`이 실려 있다(`:98-131`). **추가 쿼리 없이** 재랭킹할 본문이 있다
- 후보 풀은 `:136`의 `.limit(limit)`을 `.limit(limit * K)`로 바꾸고 재랭킹 후 slice하면 된다

차선책은 `packages/lib/src/mcp/handlers.ts:1441-1487` (MCP 전용 규칙을 넣고 싶을 때)인데, 그 경우 `:1484-1488`의 `_meta.searchResults` 순위 배열을 **재랭킹 후 순위로 다시 만들어야** 분석 퍼널이 안 깨진다.

### JEV 호출 규칙 (실측에서 나온 것)

- **후보를 한 요청에 묶어라.** state 하나에 후보 전부를 넣고 noul 질문을 후보 수만큼 건다. 나눠 던지면 후보끼리 비교가 안 돼 점수가 뭉갠다 — 12개 실험에서 나눠 던지면 1등 0.51/2등 0.30, 묶으면 1등 0.91/2등 0.19였다.
- **지연은 state 크기와 거의 무관하다.** 468토큰 1.36초 / 5,483토큰 1.24초 / 20,783토큰 1.42초. 후보 62개(5.7k토큰)를 한 요청에 넣어도 약 0.9초.
- **문턱은 절대값으로 잡지 마라.** 1등 점수와 (1등−2등) 여유를 같이 본다. 위 실측은 1등 0.87 / 2등 0.14로 여유가 컸지만, 애매한 질문에서는 여유가 얕아진다. 얕으면 재랭킹을 포기하고 원래 순서를 쓰는 편이 안전하다.
- **0.2~0.4 구간이 애매하다.** 문턱은 반드시 실제 질의 몇 개에 사람 라벨을 붙여 정한다.
- 폴백: 키가 없거나 호출이 실패하면 **원래 순서 그대로** 돌려준다. 어설픈 점수로 순서를 흔드는 것보다 안 흔드는 게 낫다.
- API: `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer <TYPESAFE_API_KEY>`, body `{state, model, questions}`. 문서 색인 https://docs.typesafe.ai/llms.txt, 재랭킹 쿡북 `cookbooks/rerank_typesafe.md`.

### 첫 행동

1. worktree `.claude/worktrees/dev-4484-search-rerank`로 이동해 `vector-search.ts`의 `:66-73`, `:136`, `:137-232`를 직접 읽는다.
2. `.limit(limit)`을 overfetch로 바꾸고 `:232` 직전에 재랭킹 자리를 만든다. JEV 호출은 별도 모듈로 분리한다.
3. 재랭킹 **전/후 순위를 둘 다** 기록하게 한다.

### 완료 기준

- overfetch + 재랭킹이 붙었다
- JEV 키가 없거나 실패하면 기존 순서로 폴백한다
- 재랭킹 전/후 순위가 둘 다 남는다
- `corepack pnpm --filter @gpters/web test` (unit) 통과
- 문턱 결정 근거가 문서에 남는다

---

## 3. 트랙 B — 지연 (DEV-4485)

### 문제

`semantic_search`가 느리다. 그리고 **이건 이미 레포에 적혀 있는 문제다.**

- `docs/ANALYSIS_2026-02-23.md:18,31,191` — 평균 **2,637ms**, 목표 **500ms**, 원인은 "임베딩 API 호출이 병목"
- 2026-09-21 실측 `searchTime: 3041ms` — 7개월 전 수치와 같다. 안 고쳐졌다

### 의심 지점 셋

**1. 쿼리 임베딩 캐시가 프로세스 인메모리다 — 가장 유력**

`packages/lib/src/search/embedding-cache.ts`: LRU `maxSize 500` / TTL 1시간(`:47,50`), 키는 소문자화+공백압축 쿼리(`:61-63`), 프로세스 전역 인스턴스(`:195`). **파일 상단 주석(`:3-7`)에 "서버리스라 콜드 스타트마다 날아간다"가 이미 적혀 있다.**

Vercel 서버리스는 인스턴스가 자주 죽는다. 먼저 **실제 히트율을 재고**, 프로세스 밖으로 옮긴다. 키 정규화 규칙은 지금 것을 유지한다.

**어디로 옮길지 고르는 것이 이 작업의 일부다.** 문서가 정해주지 않는다 — 아래를 재보고 하나로 결론 내고 근거를 남긴다.

| | DB 테이블 (Neon Postgres) | 외부 KV (Vercel KV / Upstash 등) |
|---|---|---|
| 새 의존성 | 없음. 이미 쓰는 DB | 새로 붙여야 함 (비용·키 관리) |
| 지연 | DB 왕복 1회 추가 | 보통 더 빠름 |
| TTL·LRU | 직접 구현 (`expires_at` 컬럼 + 정리 크론) | 기본 제공 |
| 임베딩 크기 | 3072 dim `halfvec` 한 행당 약 6KB | 같은 값을 직렬화해 보관 |

코퍼스가 405행이라 **캐시 대상 쿼리 수 자체가 크지 않다.** 새 의존성 없이 DB로 가는 쪽이 기본값으로 무난하지만, 측정 결과가 DB 왕복도 아깝다고 말하면 KV로 간다.

전례가 있다: `packages/lib/src/mcp/skills-search.ts:196-209`는 중복 임베딩 호출이 "P50을 지배했다(~500ms/요청)"고 적고, 임베딩 1회를 벡터 쿼리 3개에 재사용하는 것으로 고쳤다.

**2. 임베딩 모델이 크다**

`embedding.ts:16,19` — OpenAI `text-embedding-3-large`, **3072 dims**. 저장은 `halfvec(3072)`(`packages/db/src/schema.ts:92` — pgvector HNSW가 `vector` 2000 dim을 못 넘어서 선택). 더 작은 모델이나 축소 차원이 가능한지 본다. **바꾸면 405행 전체 재인덱싱이 따라온다.** 측정 없이 먼저 손대지 않는다.

**3. `maxDuration`이 선언돼 있지 않다**

`apps/web/app/api/mcp/route.ts:82-83`에 `dynamic`·`fetchCache`만 있고 `maxDuration`이 없어 Vercel 기본값(~10초)을 쓴다. 다른 라우트는 명시한다(`app/api/ax/[panel]/route.ts:24`, `app/api/cron/evo-generate/route.ts:13`).

바깥 타임아웃도 좁다. 뽀밋이 MCP 클라이언트 10초(`~/Projects/Geniefy/bbomit/scripts/configure-ax-toolkit-read.py:52`), Claude Code 플러그인 훅은 SessionStart 10000/5000ms, **SessionEnd 1500ms**(`apps/claude-code-plugin/.claude-plugin/plugin.json:25,30,41`). **1.5초 안에 2.6초짜리 검색은 애초에 안 들어간다.**

### 첫 행동

1. `embedding-cache.ts`를 읽고 인메모리 LRU라는 것과 상단 한계 주석을 직접 확인한다.
2. **현재 p50을 먼저 측정한다.** 운영 MCP에 같은 쿼리와 서로 다른 쿼리를 섞어 반복 호출하고 응답의 `searchTime`을 기록한다. **읽기 호출만 한다.**
3. 캐시를 프로세스 밖으로 옮기는 설계를 적는다.

### 완료 기준

- 변경 전 p50이 기록돼 있다
- 콜드 스타트 이후에도 같은 쿼리가 캐시 히트한다
- 변경 후 p50이 같은 방법으로 측정돼 전/후가 나란히 남는다
- `maxDuration` 명시 여부를 판단하고 근거를 남겼다

---

## 4. 덤 — 하는 김에 보이면 같이

현재 PR 범위를 크게 넓히지 않는 선에서.

- **ILIKE 보너스가 자연어에서 안 걸린다**(트랙 A의 1번). 질문을 토큰으로 쪼개 OR로 걸거나, 이미 있는 FTS/트라이그램 경로를 MCP에도 물리는 선택지가 있다. 이건 범위를 넓히니 별도 이슈로 빼는 편이 낫다.
- **`embedding-cache.ts:1`의 주석이 "Gemini API 재호출을 방지"라고 되어 있다.** 실제 임베딩은 OpenAI `text-embedding-3-large`다(`embedding.ts:16,19`). 주석이 낡았거나 과거에 모델을 바꾼 흔적이다. 트랙 B에서 그 파일을 만질 때 같이 확인한다. (검증자가 파일을 읽다 발견했다)
- **`computePopularityScore` / `blendScore`가 쓰이지 않는다.** `packages/lib/src/search/popularity.ts:198-226`, 공식은 `similarity*0.8 + popularity*0.2`, popularity는 `min(applyCount/10, 1)`. 참조하는 곳은 `packages/lib/src/search/index.ts:13`(re-export)와 `apps/web/tests/unit/popularity-ranking.test.ts`뿐이다. **의도적으로 뺀 건지 붙이다 만 건지 확인이 필요하다.** 재랭킹을 넣으면 이것과 역할이 겹친다.

---

## 5. 이 문서를 만든 근거

전부 2026-09-21에 코드와 운영 MCP를 직접 읽고 호출해 확인했다. 인용한 `file:line`은 `openclaw` v2026.9.4 / 이 레포 `origin/main` 819533fb 기준이다. 임베딩 점수·JEV 점수·`searchTime`은 그날 운영 MCP 실측값이며, 재현하면 값이 조금 달라질 수 있다.

## 검증

- 작성: 2026-09-21 (Opus 5, 원 세션) / 마지막 검증: 2026-09-21
- 봉인 답지: 스크래치패드 (커밋 안 함). 핸드오프를 쓰기 **전에** 봉인했다.

### 라운드 1

- **A: claude sonnet** · 이 세션 밖 서브에이전트 · 메모리 없음 · Read/Bash/MCP 사용 가능
  - **트랙 B를 골랐다.** 근거로 문서의 "둘 다 할 거면 B를 먼저 본다"를 인용했다.
  - 첫 행동 3개 답지와 **3/3 일치** (embedding-cache 확인 → p50 실측 → 캐시 외부화 설계).
  - 2단계 실행: `embedding-cache.ts` 읽기. 문서가 인용한 `:3-7`, `:47`, `:50`, `:61-63`, `:195`를 전부 확인. 금지선 접근 없음.
  - **[추측] 1곳**: "설계 노트를 어디에 쓸지(스크래치패드 / `docs/` / PR 설명)가 문서에 없다."
  - 덤: `embedding-cache.ts:1` 주석이 "Gemini"라고 적혀 있는데 실제는 OpenAI라는 불일치를 발견.
- **B: codex gpt-5.6-terra, reasoning high** · `--sandbox read-only` · MCP 미연결 · 메모리 없음
  - **트랙 A를 골랐다.** (프롬프트가 `dev-4484` worktree 경로를 가리킨 것이 근거가 됐다)
  - `vector-search.ts`의 `:66-73`, `:136`을 정확히 찾았다. 금지선 접근 없음.
  - **반환 경로가 둘(`:216-221` 폴백 / `:232` 본 경로)이라는 것을 짚었다.** 문서는 `:232`만 말하고 폴백을 재랭킹할지 안 정해줬다.
  - 2·3단계 미수행 — 검증 프롬프트의 번호(1·2·3)가 검증자 자신의 계획 번호와 겹쳐 생긴 것이라 **문서 결함으로 세지 않았다.**

**결함 3건과 수정:**

1. **(최우선) 둘이 서로 다른 트랙으로 갔다** — 둘 다 문서 안에서 근거를 댈 수 있었으므로 틀린 건 검증자가 아니라 문서다. 시작 지점이 없었다. → 맨 위에 **"여기부터"** 절을 넣고 `pwd`(어느 worktree에 있는가)로 트랙이 정해지게 했다. "B를 먼저"는 배정이 없을 때만 적용되는 권고로 한정했다.
2. **[추측] — 산출물 위치** → "여기부터" 절에 **산출물을 어디에 쓰나** 항목을 추가했다.
3. **반환 경로 둘** → §2 삽입 지점에 표를 넣고, **폴백 경로는 일부러 범위 밖**임을 이유와 함께 명시했다.

그리고 검증자가 발견한 `Gemini` 주석 불일치를 §4에 덤으로 추가했다.

### 라운드 2

수정이 구조적(문서의 시작 지점을 새로 만듦)이라 **새 에이전트 둘**로, 각각 **다른 worktree에서** 시작시켜 라우팅이 실제로 갈라지는지 시험했다.

- **C: claude sonnet** · `dev-4485-search-latency`에서 시작 · 메모리 없음 · Read/Bash/MCP 사용 가능
  - `pwd`를 찍고 표를 따라 **트랙 B를 확정했다.** 라우팅 의도대로 동작.
  - 첫 행동 3개 답지와 **3/3 일치**. 1번 실행에서 `embedding-cache.ts:3-7,47,50,61-63,195`와 `route.ts`의 `maxDuration` 부재를 grep으로 확인(대조군으로 `ax/*/route.ts`의 `maxDuration=60`, `evo-generate`의 `120`까지 확인). 금지선 접근 없음.
  - **[추측] 2곳**: (1) 붙어 있는 MCP `semantic_search` 도구가 문서가 말하는 그 경로를 타는지 명시가 없음, (2) 캐시를 DB로 갈지 KV로 갈지 고르는 기준이 없음.
  - 세 번째 `[추측]`("2분 제한")은 검증 프롬프트가 준 제약이라 **문서 결함으로 세지 않았다.**
- **D: codex gpt-5.6-terra, reasoning high** · `dev-4484-search-rerank`에서 시작 · `--sandbox read-only` · MCP 미연결
  - **트랙 A를 확정했다.** 라우팅 의도대로 동작.
  - `:66-73`, `:136`, **`:216`(폴백 반환)과 `:232`(본 경로 반환)를 구분해서** 확인했고, 계획에 "폴백은 건드리지 않으며"를 명시했다 — 라운드 1에서 지적된 결함이 막혔다.
  - `[추측]` 표시 없음. 금지선 접근 없음.

**결함 2건과 수정:**

1. MCP `semantic_search` 도구와 문서가 서술한 호출 경로의 관계가 없었다 → §1 호출 경로에 **측정용으로 쓸 도구** 문단을 추가했다.
2. DB냐 KV냐를 고르는 기준이 없었다 → §3에 비교표를 넣고, **고르는 것이 이 작업의 일부**임을 명시했다.

라운드 2에서 **의도 모순 0건, 금지선 접근 0건**이었고 두 검증자가 서로 다른 절로 흩어지지 않았다. 라운드 3으로 넘어가지 않는다.

- 평결: **혼자 선다.** 남았던 구멍 둘은 한 줄짜리라 메웠고, 트랙 배정·금지선·삽입 지점·완료 기준은 두 티어 모두에서 의도대로 읽혔다.
