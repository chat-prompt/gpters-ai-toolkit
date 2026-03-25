# 실습 생성 시 최신 도구 자동 반영 — 복리엔진 × Rona 통합 아키텍처

> 작성: 2026-03-10 · 상태: **v3 (Rona 현황 통합)** · 배경: Slack 대화 (현진우, 김태현, 윤누리)
> 원본 참고: [Rona 데이터 최신화 현황](https://github.com/chat-prompt/rona-practice/blob/master/docs/features/data-freshness-status.md) — §2에 전문 통합됨
> 리뷰: [종합 리뷰 리포트](./2026-03-10-exercise-aware-engine-review.md) — 5개 관점 전원 Conditional Go

---

## 1. 문제

**실습 생성 시 최신 도구(MCP, Skill, CLI, API 문서)가 반영되지 않는다.**

현재 플로우:
```
사용자: "Stripe 결제 연동 실습 만들어줘"
       → AI가 기억/학습 데이터에 의존하여 실습 생성
       → 구버전 API, 없어진 메서드, 옛날 모델명 사용
       → 실습이 실제로 돌아가지 않음
```

이상적 플로우:
```
사용자: "Stripe 결제 연동 실습 만들어줘"
       → Rona가 실습 구조를 생성 (Stage 1)
       → 복리엔진에서 관련 스킬/MCP를 자동 탐색 (Stage 2, 신규)
       → Rona가 최신 Stripe 문서를 Context7 캐시에서 가져옴 (Stage 2, 기존)
       → 최신 AI 모델 ID 적용 (Stage 2, 기존)
       → 스킬 + 도구 문서 + 모델 정보가 통합된 실습이 만들어짐 (Stage 3)
```

---

## 2. 두 시스템 현황

### Rona (실습 생성 플랫폼) — 이미 구현된 것

| 영역 | 구현 | 상세 |
|------|------|------|
| **도구 문서 싱크** | ✅ 운영 중 | GitHub Actions → Context7 API → Neon DB, 37개 도구, SHA256 Smart Probe |
| **AI 모델 매핑** | ✅ 운영 중 | 매일 새벽 3곳 fetch → 프롬프트 자동 갱신, `normalizeModelNames()` 구버전 차단 |
| **플랫폼 도구명 매핑** | ✅ 운영 중 | 6개 플랫폼별 도구명/CLI명 자동 변환 |
| **실습 생성 파이프라인** | ✅ 운영 중 | Stage 2에서 `reference_docs`로 도구 문서 최대 5개 자동 삽입 |

<details>
<summary>구현 세부사항 (Rona 코드베이스 참조)</summary>

#### 도구 문서 싱크 상세

| 항목 | 상세 |
|------|------|
| 자동화 방식 | GitHub Actions → Context7 API → Neon DB 저장 |
| 주기 | 매일 새벽 3시 (KST) |
| 커버리지 | 37개 도구 (34 synced, 3 pending) |
| 토픽 | 도구당 4개: quickstart, API reference, error handling, installation |
| 스마트 프로브 | SHA256 해시 비교 → 변경분만 풀싱크 (API 콜 60-70% 절감) |
| 실습 적용 | 생성 Stage 2에서 관련 도구 최대 5개의 문서가 `reference_docs`로 자동 삽입 |

**등록된 37개 도구:**
- 프레임워크: Next.js, React, Tailwind CSS, Hono
- ORM/DB: Drizzle ORM, Prisma, Supabase
- AI: Vercel AI SDK, Google Gemini API, Anthropic Claude API, OpenAI API
- 테스트: Playwright, Vitest
- 인프라: Vercel, Docker, GitHub Actions
- 봇/자동화: Telegram Bot API, Slack API, Trigger.dev, n8n
- 기타: OpenClaw, Google Sheets API 등

#### AI 모델 매핑 상세

| 항목 | 상세 |
|------|------|
| 자동화 방식 | GitHub Actions → 공식 3사 페이지 직접 fetch → 프롬프트 파일 자동 갱신 |
| 주기 | 매일 새벽 2시 (KST) |
| 소스 | Anthropic 모델 페이지, Google AI 문서, OpenAI Python SDK 소스코드 |
| 적용 범위 | 프롬프트 3개에 자동 반영 |
| 구버전 차단 | `normalizeModelNames()` — 실습/URL 기사에서 구버전 모델명 자동 치환 |

**현재 매핑표 (2026.03 기준):**

| 제공사 | 최신 모델 | API 모델 ID | 구버전 (사용 금지) |
|--------|----------|-------------|-------------------|
| Anthropic | Opus 4.6, Sonnet 4.6, Haiku 4.5 | `claude-opus-4-6`, `claude-sonnet-4-6` | ~~3.5~~, ~~3~~ |
| Google | Gemini 3.1 Flash, 3 Pro, 3.1 Pro | `gemini-3.1-flash-lite-preview` 등 | ~~2.5~~, ~~1.5~~ |
| OpenAI | GPT-5.4, GPT-5.2, GPT-5.2-PRO | `gpt-5.4`, `gpt-5.2`, `gpt-5.2-pro` | ~~4o~~, ~~4.1~~ |

#### 플랫폼 도구명 매핑 상세

| 항목 | 상세 |
|------|------|
| 파일 | `src/lib/platform/config.ts` |
| 지원 플랫폼 | Claude Code, Cowork, Codex, Antigravity, Gemini CLI, OpenCode |
| 매핑 내용 | 플랫폼별 도구명 (Read/Write/Edit 등), CLI 명령어, 설정 파일명 |
| 적용 | 실습 생성 시 선택된 플랫폼에 맞는 도구명으로 자동 변환 |

#### Rona 핵심 파일 경로

| 파일 | 역할 |
|------|------|
| `.github/workflows/sync-tool-docs.yml` | 도구 문서 일일 싱크 워크플로우 |
| `.github/workflows/sync-model-info.yml` | AI 모델 매핑표 일일 싱크 워크플로우 |
| `scripts/sync-tool-docs.ts` | Context7 → DB 싱크 스크립트 |
| `scripts/sync-model-info.ts` | 공식 페이지 → 프롬프트 파일 갱신 스크립트 |
| `scripts/tool-docs-seed.json` | 37개 도구 시드 데이터 |
| `src/lib/sync/tool-docs-sync.ts` | 싱크 코어 로직 (probe + full sync) |
| `src/lib/ai/enrich-tool-docs.ts` | 실습 생성 시 도구 문서 주입 |
| `src/lib/ai/context7-tools.ts` | Context7 AI 도구 정의 |
| `src/lib/platform/config.ts` | 플랫폼별 도구명 매핑 |
| `prompts/practice-generator.txt` | 실습 생성 메인 프롬프트 (매핑표 포함) |
| `prompts/personalized-practice.txt` | 맞춤 추천 프롬프트 (매핑표 포함) |
| `prompts/url-practice.txt` | URL 실습 프롬프트 (매핑표 포함) |

</details>

### Rona — 미대응 영역 (복리엔진 협업 필요)

| 영역 | 현상 | 영향 |
|------|------|------|
| **스킬 큐레이션** | 실습에서 "어떤 스킬이 있고 언제 쓰면 좋은지" 가이드 없음 | 학생이 스킬 존재 자체를 모름 |
| **MCP 서버 카탈로그** | MCP 서버 목록/설치법/활용 시나리오 없음 | 기본 도구에만 의존 |
| **CLI 설치형 기능** | CLI 패키지 목록/설치법/사용 패턴 없음 | 구버전 명령어 사용 |
| **API 실전 패턴 심화** | `reference_docs`가 quickstart 수준(토픽당 6KB)에 머무름. 스트리밍, 웹훅, 페이지네이션, 마이그레이션 가이드 등 실전 패턴 부재 | 실습의 코드가 "시작하기" 수준에서 막힘 |

### 복리엔진 (AI Toolkit) — 기존 스킬 추천 시스템

| 지표 | 현재 | 목표 | 비고 |
|------|------|------|------|
| 추천 적중률 | 15.5% | 30% | ④→⑤ 병목 |
| 검색 무결과율 | 25.0% | ≤10% | 카탈로그 커버리지 부족 |
| 카탈로그 규모 | 276개 public 스킬 | — | MCP 서버 9개 (메타 미비) |

---

## 3. 안 되고 있는 것

실습 생성 시:
1. **실습 내용을 구성하고** → ✅ Rona 자체 해결
2. **관련 스킬/MCP를 복리엔진에서 자연스럽게 찾아오고** → ❌ 연결 안 됨
3. **이를 바탕으로 최신 도구가 반영된 실습이 만들어지는 것** → ❌ 스킬/MCP 정보 없이 생성

→ **2번이 핵심 미싱 피스.**

---

## 4. 구현 전략: 바로 Phase 1 착수

> 범용 스킬 ~40개가 거의 모든 실습에 매칭 가능하고(§11), MCP/CLI 시드 데이터는 구현 과정에서 자연스럽게 검증되므로 별도 가치 검증 단계 없이 바로 구현에 진입한다.

### Phase 1a (1주) — REST 엔드포인트 + 스킬 검색

| 순서 | 항목 | 담당 | 기간 |
|------|------|------|------|
| 1a-1 | `POST /api/skills/search` REST 엔드포인트 (단순화된 응답) | 복리엔진 | 1.5일 |
| 1a-2 | 서비스 토큰 인증 + rate limiting + 감사 로깅 | 복리엔진 | 1일 |
| 1a-3 | `welfare-engine-client.ts` (AbortController 패턴) | Rona | 0.5일 |
| 1a-4 | `buildSkillDocsMessage()` 구현 + 토큰 예산 로직 | Rona | 1일 |
| 1a-5 | `handleGenerationPhase` 수정 + 통합 테스트 | Rona | 1.5일 |

### Phase 1b (1.5주) — MCP/CLI 시드 + 통합 응답

| 순서 | 항목 | 담당 | 기간 |
|------|------|------|------|
| 1b-1 | MCP 서버 15개 시드 데이터 보강 (설치 명령어/시나리오) | 복리엔진 | 2일 |
| 1b-2 | `cli_tools` 테이블 생성 + 25개 시드 | 복리엔진 | 1일 |
| 1b-3 | `GET /api/skills/curate` REST 엔드포인트 | 복리엔진 | 1일 |
| 1b-4 | `skill_events` 실습 액션 타입 추가 | 복리엔진 | 0.5일 |
| 1b-5 | E2E 검증 (다양한 주제 + level별) | 양쪽 | 1일 |

### Phase 2/3 — 보류 (별도 의사결정)

> Phase 2/3은 Phase 1 안정화 + SLA 실적 축적 후 재논의.

| Phase | 내용 | 전제 조건 | 예상 시점 |
|-------|------|----------|----------|
| 2 | AI 모델 레지스트리 이관 | Phase 1 안정 운영 2개월+, 가용성 데이터 축적 | Phase 1 + 2~3개월 |
| 3 | 도구 문서 + 플랫폼 매핑 이관 | SLA 99.5%+ 실적 3개월, dual-run 이관 계획서 | Phase 2 + 3~6개월 |

**Phase 2/3 이관 시 필수 원칙: Dual-run**
- 이관 전 최소 2주간 자체 싱크와 복리엔진 API를 동시 호출하여 결과 비교
- 불일치 발생 시 자동 경고 → 자체 싱크 폴백
- Dual-run 통과 후에만 자체 싱크 제거

---

## 5. REST API 설계 (v2 — 리뷰 반영)

### 왜 MCP가 아닌 REST인가

MCP는 "AI 클라이언트 ↔ 도구 서버" 프로토콜. Rona-복리엔진은 서버 대 서버 통신이므로
단순 HTTP REST가 적합. JSON-RPC 봉투/세션 관리/OAuth 브라우저 플로우 불필요.

### API 1: `POST /api/skills/search` — 스킬 통합 검색

> **리뷰 반영**: 응답 구조 대폭 단순화. `whyRelevant`, `suggestedStep`, `content` 전문, `workflowPattern` 제거.
> 이유: `whyRelevant`/`suggestedStep`은 LLM 생성이 필요한 필드 → REST 내 LLM 호출 시 응답 10초+ → 5초 타임아웃 초과.
> Rona가 `description`과 `score`를 보고 자체적으로 관련성 판단 + 실습 배치하는 것이 역할 분담 원칙에 부합.

```typescript
// 요청
POST https://ai-toolkit.gpters.org/api/skills/search
Authorization: Bearer <SERVICE_TOKEN>
X-Service-Name: rona
Content-Type: application/json

{
  "topic": "Stripe 결제 연동",
  "techStack": ["stripe", "next.js", "typescript"],
  "level": "intermediate",
  "platform": "claude-code",
  "limit": 5
}

// 응답 구조 (Phase 1 — 단순화)
interface SkillSearchResponse {
  /** 관련 스킬 (최대 5개) */
  skills: Array<{
    id: string
    name: string
    description: string
    type: 'skill' | 'agent' | 'command' | 'guide'
    score: number         // 시맨틱 검색 점수
    staleWarning?: string // "⚠️ 이 스킬은 구버전 모델(claude-3-opus)을 참조합니다"
  }>

  /** 추천 MCP 서버 (최대 3개) */
  mcpServers: Array<{
    id: string
    label: string
    description: string
    installCommand?: string  // "claude mcp add stripe -- npx @stripe/mcp"
    /** MCP 없이도 진행 가능한 대안 */
    fallbackApproach?: string // "Stripe SDK (@stripe/stripe-node)를 직접 사용"
  }>

  /** CLI 도구 (최대 5개) — techStack 기반 직접 매칭 */
  cliTools: Array<{
    name: string
    installCommand: string   // "npx create-next-app@latest"
    latestVersion?: string   // "16.0.0"
  }>

  /** 메타데이터 */
  meta: {
    searchDurationMs: number
    totalSkillsSearched: number
    catalogVersion: string
  }
}
```

**Phase 1에서 제거된 필드 (Phase 2 이후 검토):**

| 제거 필드 | 이유 | Phase 2 복원 조건 |
|-----------|------|-----------------|
| `whyRelevant` | LLM 생성 필요 → 응답 시간 폭증 | 비동기 사전 생성 또는 캐시 방식 확보 시 |
| `suggestedStep` | LLM 생성 필요 → 동일 문제 | Rona가 자체 판단으로 대체 가능하므로 불필요할 수 있음 |
| `content` (스킬 전문) | payload 25KB+ → 대부분 미사용 | 필요 시 별도 `GET /api/skills/:id/content` |
| `workflowPattern` | DB에 없는 데이터, 수동 시드 + 유지보수 비용 | 충분한 패턴 데이터 축적 후 |

### API 2: `GET /api/skills/curate` — 카테고리별 스킬 목록

```typescript
GET https://ai-toolkit.gpters.org/api/skills/curate?category=project-start
Authorization: Bearer <SERVICE_TOKEN>

// 응답
{
  "category": "project-start",
  "skills": [
    { "id": "brainstorming", "name": "브레인스토밍", "when": "기능 설계 전", "command": "/brainstorming" },
    { "id": "writing-plans", "name": "구현 계획 작성", "when": "코딩 전 설계", "command": "/writing-plans" },
    { "id": "test-driven-development", "name": "TDD", "when": "구현 시작 시", "command": "/tdd" }
  ],
  "mcpServers": [
    { "label": "GitHub MCP", "when": "레포지토리 관리", "installCommand": "claude mcp add github -- npx @anthropic/mcp-github" }
  ]
}
```

### 서비스 토큰 인증

> **리뷰 반영**: `x-service-name` 헤더 추가, rate limiting, 감사 로깅 포함.

```typescript
// 복리엔진: app/api/skills/search/route.ts
export async function POST(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const serviceName = req.headers.get("X-Service-Name") || "unknown";

  if (token !== process.env.RONA_SERVICE_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limiting (기존 미들웨어 재사용)
  // 감사 로깅 (mcp_audit_logs 패턴)
  await logServiceCall({ service: serviceName, endpoint: "/api/skills/search", ... });

  // ... 검색 로직
}
```

| 환경변수 | 위치 | 값 |
|----------|------|-----|
| `RONA_SERVICE_TOKEN` | 복리엔진 `.env` | 발급된 토큰 |
| `WELFARE_ENGINE_TOKEN` | Rona `.env` | 동일 토큰 |
| `WELFARE_ENGINE_URL` | Rona `.env` | `https://ai-toolkit.gpters.org` |

### 에러 처리 & Graceful Degradation

| 상황 | Rona 동작 |
|------|----------|
| 복리엔진 정상 응답 | 스킬/MCP/CLI 정보를 `toolDocsContext`에 포함 |
| 복리엔진 타임아웃 (5초) | 스킬 없이 실습 생성 (기존과 동일) |
| 복리엔진 500 에러 | 스킬 없이 실습 생성 (기존과 동일) |
| `WELFARE_ENGINE_TOKEN` 미설정 | 복리엔진 호출 스킵 |

### 두 프로토콜의 공존

```
[AI 클라이언트들]                    [Rona 서버]
  Claude Code ──MCP──┐                  │
  OpenCode ───MCP────┤                  │
  Codex ──────MCP────┤                  │
                     ▼                  ▼
              ┌──────────────────────────────┐
              │       복리엔진 서버            │
              │                              │
              │  /api/mcp (MCP JSON-RPC)     │ ← AI 클라이언트용
              │  /api/skills/* (REST)         │ ← 서버 간 통신용
              │                              │
              │  공유: semantic_search,       │
              │        catalog_items,        │
              │        skill_events          │
              └──────────────────────────────┘
```

---

## 6. 역할 분담 원칙 — "복리엔진은 실습을 모른다"

### 핵심 원칙

> **데이터를 가진 쪽이 API를 제공한다.** 복리엔진은 재료(스킬/MCP/CLI)를 주고, Rona가 요리(실습)한다.

| 원칙 | 설명 |
|------|------|
| **복리엔진은 실습 구조를 모른다** | Stage 1/2, terminology, reference_docs 등 실습 스키마를 알 필요 없음 |
| **Rona는 스킬을 저장하지 않는다** | 스킬 카탈로그는 복리엔진이 단일 소스(Single Source of Truth) |
| **API 파라미터는 범용적이다** | `topic`, `techStack`, `level` — 실습 전용이 아닌 일반 검색 파라미터 |
| **실습 조립은 Rona의 책임** | 관련성 판단, Step 배치, `toolDocsContext` 주입, 토큰 예산 관리 전부 Rona |
| **실패 시 기존과 동일** | 복리엔진 다운 → 스킬 없이 실습 생성 (graceful degradation) |

### 노출 UX 가이드라인 (Rona 측)

> **리뷰 반영**: 학습자에게 어떻게 보여줄지 최소 원칙 명시.

| 원칙 | 설명 |
|------|------|
| **level 기반 필터링** | beginner → 범용 스킬만 추천, MCP/CLI 추천 생략. intermediate+ → MCP/CLI 포함 |
| **인라인 추천** | 사전 준비에 몰아넣지 않고, 해당 Step의 맥락 안에서 노출 |
| **최대 노출 수** | 실습당 스킬 2개 + MCP 1개 (과부하 방지) |
| **MCP fallback** | MCP 연결 실패 시 대안 경로 표시 (`fallbackApproach` 필드 활용) |
| **stale 경고** | `staleWarning`이 있는 스킬은 경고와 함께 표시 |

### 도구 지식 통합 로드맵

현재 Rona가 자체 운영 중인 도구 문서 싱크·AI 모델 매핑은 본질적으로 **도구 지식**이다.
원칙상 복리엔진이 중앙 관리해야 하나, 단계적으로 이관한다.

| 도구 지식 | 현재 위치 | 원칙상 위치 | Phase |
|-----------|----------|------------|-------|
| 스킬 카탈로그 (276개) | 복리엔진 | 복리엔진 | — |
| MCP 서버 목록 | 복리엔진 | 복리엔진 | — |
| CLI 도구 목록 | 없음 → 복리엔진 | 복리엔진 | 1b |
| **AI 모델 매핑** | Rona | 복리엔진 | 2 (보류) |
| **도구 문서 싱크** | Rona | 복리엔진 | 3 (보류) |

---

## 7. Rona 측 연동 코드 (구현 참고)

### welfare-engine-client.ts

> **리뷰 반영**: `Promise.race` → `AbortController` 패턴으로 변경. 타임아웃 시 fetch abort로 좀비 연결 방지.

```typescript
// Rona: src/lib/ai/welfare-engine-client.ts (신규)
const WELFARE_ENGINE_URL = process.env.WELFARE_ENGINE_URL!;
const WELFARE_ENGINE_TOKEN = process.env.WELFARE_ENGINE_TOKEN!;
const TIMEOUT_MS = 5_000;

export async function searchSkillsForExercise(params: {
  topic: string;
  techStack: string[];
  level?: string;
}) {
  if (!WELFARE_ENGINE_TOKEN) return null; // 미설정 시 스킵

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${WELFARE_ENGINE_URL}/api/skills/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WELFARE_ENGINE_TOKEN}`,
        "X-Service-Name": "rona",
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    console.warn("[welfare-engine] search failed, skipping skill enrichment");
    return null; // graceful degradation
  } finally {
    clearTimeout(timeout);
  }
}
```

### buildSkillDocsMessage() 인터페이스 계약

> **리뷰 반영**: Rona 측 구현의 핵심 함수 계약서 추가.

```typescript
// Rona: src/lib/ai/build-skill-docs-message.ts (신규)

/**
 * 복리엔진 검색 결과를 toolDocsContext 포맷으로 변환
 *
 * @param result - SkillSearchResponse (복리엔진 응답)
 * @param level - 학습자 레벨 (beginner → MCP/CLI 생략)
 * @returns 마크다운 문자열 (최대 8KB)
 *
 * 토큰 예산: 기존 toolDocsContext 20KB 중 8KB를 스킬 정보에 할당.
 *           기존 도구 문서 12KB + 스킬 정보 8KB = 총 20KB 유지.
 *
 * 포맷:
 *   ## 관련 스킬
 *   - **스킬명** (score: 0.72) — 설명. staleWarning 표시.
 *
 *   ## 추천 MCP 서버 (intermediate+ only)
 *   - **서버명** — 설명. 설치: `명령어`. 대안: fallbackApproach
 *
 *   ## CLI 도구 (intermediate+ only)
 *   - **도구명** v버전 — `설치 명령어`
 *
 * 우선순위:
 *   1. skills: score 내림차순, 최대 2개
 *   2. mcpServers: 최대 1개 (level=beginner 시 생략)
 *   3. cliTools: techStack 매칭, 최대 2개 (level=beginner 시 생략)
 *
 * 중복 제거: Rona의 기존 tool_docs와 동일 도구명이면 제외
 */
export function buildSkillDocsMessage(
  result: SkillSearchResponse,
  level: string,
): string
```

### handleGenerationPhase 수정

> **리뷰 반영**: `toolDocsContext`에 값 주입 전 현재 동작 검증 필수.
> ⚠️ **사전 확인**: `runGenerationPipeline`의 4번째 파라미터가 `undefined`인 이유가 "미구현"인지 "의도적"인지 확인 후 진행.

```typescript
// Rona: src/app/api/chat/route.ts의 handleGenerationPhase() 수정
async function handleGenerationPhase(...) {
  const techStack = extractToolNames(/* 기존 재사용 */);

  // 복리엔진 + 기존 도구 문서를 병렬 호출
  const [skillResult, toolDocs] = await Promise.all([
    searchSkillsForExercise({ topic: "...", techStack, level: userLevel }),
    fetchToolDocs(techStack),                              // 기존
  ]);

  // toolDocsContext에 스킬 정보 합류
  const skillContext = skillResult ? buildSkillDocsMessage(skillResult, userLevel) : "";
  const toolDocsContext = buildToolDocsMessage(toolDocs) + "\n" + skillContext;

  const practice = await runGenerationPipeline(
    modelMessages, enrichedPrompt, callback,
    toolDocsContext,  // ← undefined가 아닌 실제 값 전달
    { learnedConcepts, userLevel },
  );
}
```

---

## 8. DB 스키마 변경

### mcp_servers 테이블 보강

기존 테이블에 컬럼 추가:

```sql
ALTER TABLE mcp_servers
  ADD COLUMN install_command TEXT,       -- "claude mcp add stripe -- npx @stripe/mcp"
  ADD COLUMN npm_package TEXT,           -- "@stripe/agent-toolkit"
  ADD COLUMN github_repo TEXT,           -- "stripe/agent-toolkit"
  ADD COLUMN platforms TEXT[],           -- {"claude-code","cursor","windsurf"}
  ADD COLUMN use_cases TEXT[],           -- {"결제 처리","구독 관리"}
  ADD COLUMN fallback_approach TEXT,     -- "Stripe SDK를 직접 사용"
  ADD COLUMN last_synced_at TIMESTAMPTZ;
```

### cli_tools 테이블 (신규)

> **리뷰 반영**: `catalog_items`에 type='cli-tool'로 넣지 않는다. 별도 테이블로 분리하여 기존 시맨틱 검색 오염 방지.

```sql
CREATE TABLE cli_tools (
  id TEXT PRIMARY KEY,                    -- "create-next-app"
  name TEXT NOT NULL,                     -- "create-next-app"
  install_command TEXT NOT NULL,          -- "npx create-next-app@latest"
  latest_version TEXT,                    -- "16.0.0"
  npm_package TEXT,                       -- "create-next-app"
  sync_source TEXT DEFAULT 'npm',        -- 'npm' | 'github' | 'manual'
  related_tags TEXT[],                    -- {"next.js","react","typescript"} — techStack 매칭용
  tier INTEGER DEFAULT 3,                -- 1=필수, 2=프레임워크, 3=테스트/배포, 4=서비스
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**techStack 매칭 방식**: 임베딩 검색이 아닌 `related_tags && $techStack` ARRAY 연산자로 직접 매칭.
기존 `semantic_search` 파이프라인과 완전 분리.

### skill_events 확장

기존 테이블의 `action` enum에 추가:

| action | 의미 |
|--------|------|
| `exercise_search` | 실습 생성 시 스킬/도구 탐색 |
| `exercise_apply` | 생성된 실습을 사용자가 실행 |

`referral_source: 'rona-exercise'`로 Rona 경유 전환율 별도 측정.

---

## 9. CLI 도구 초기 시드 목록 (25개)

> Rona 실습 130건의 CLI 명령어 출현 빈도 분석 기반.

### Tier 1: 필수 (실습 80%+) — 8개

| CLI 도구 | 설치 명령어 | 싱크 소스 |
|----------|-----------|----------|
| `node` / `npm` | `nvm install --lts` | nodejs.org |
| `npx` | npm 내장 | — |
| `python` / `pip` | `pyenv install` | python.org |
| `git` | 공식 설치 | git-scm.com |
| `gh` (GitHub CLI) | `brew install gh` | github.com/cli/cli |
| `claude` | `npm i -g @anthropic-ai/claude-code` | npm |
| `codex` | `npm i -g @openai/codex` | npm |
| `opencode` | `npm i -g opencode` | npm |

### Tier 2: 프레임워크 (실습 30~80%) — 6개

| CLI 도구 | 실행 명령어 | 싱크 소스 |
|----------|-----------|----------|
| `create-next-app` | `npx create-next-app@latest` | npm |
| `create-vite` | `npx create-vite@latest` | npm |
| `shadcn` | `npx shadcn@latest init` | npm |
| `prisma` | `npx prisma init` | npm |
| `drizzle-kit` | `npx drizzle-kit generate` | npm |
| `create-expo-app` | `npx create-expo-app@latest` | npm |

### Tier 3: 테스트/배포 (실습 10~30%) — 6개

| CLI 도구 | 설치/실행 명령어 | 싱크 소스 |
|----------|----------------|----------|
| `playwright` | `npx playwright install` | npm |
| `vitest` | `npx vitest` | npm |
| `vercel` | `npm i -g vercel` | npm |
| `wrangler` | `npm i -g wrangler` | npm |
| `docker` | 공식 설치 | docker.com |
| `trigger.dev` | `npx trigger.dev@latest init` | npm |

### Tier 4: 서비스 (실습 5~10%) — 5개

| CLI 도구 | 설치/실행 명령어 | 싱크 소스 |
|----------|----------------|----------|
| `supabase` | `npx supabase init` | npm |
| `firebase` | `npm i -g firebase-tools` | npm |
| `stripe` | `brew install stripe/stripe-cli/stripe` | GitHub |
| `neon` | `npm i -g neonctl` | npm |
| `resend` | API only (CLI 없음) | — |

---

## 10. 데이터 최신화 파이프라인

### 복리엔진 자체 싱크 (Phase 1)

| 파이프라인 | 싱크 주기 | 신뢰 소스 | Phase |
|-----------|----------|----------|-------|
| MCP 서버 레지스트리 | 주 1회 | GitHub `modelcontextprotocol/servers` + npm | 1b |
| 스킬 Stale 감지 | 주 1회 | 내부 스캔 (deprecated 모델 ID, 구버전 패키지, 깨진 URL) | 1b |
| CLI 도구 버전 | 주 1회 | npm registry + GitHub releases | 1b |

### Stale 감지 규칙

| 패턴 | 예시 | 심각도 |
|------|------|--------|
| deprecated 모델 ID | `claude-3-opus`, `gpt-4-turbo` | 🔴 높음 |
| 구버전 패키지 | `next@13`, `react@17` | 🟡 중간 |
| deprecated CLI | `npx create-react-app` | 🟡 중간 |
| 깨진 URL (404) | 링크 깨짐 | 🟠 중간 |

> **리뷰 반영**: stale 감지 결과를 사용자에게 가시화.
> API 응답의 `staleWarning` 필드 + Claude Code에서 "⚠️ 구버전 참조 포함" 표시.

### Phase 2/3에서 추가 (보류)

| 파이프라인 | 싱크 주기 | Phase |
|-----------|----------|-------|
| AI 모델 레지스트리 | 일 1회 | 2 |
| 도구 문서 (Context7) | 일 1회 | 3 |

---

## 11. 데이터 기반 매칭 분석

> 분석 기준일: 2026-03-10
> 데이터 소스: Rona DB (`rona.practices` 130건), 복리엔진 DB (`catalog_items` public 276개, `mcp_servers` 9개)

### Rona 실습 주제 분포 (130건)

| 주제 | 실습 수 | 비율 |
|------|---------|------|
| 자동화/파이프라인 | 40 | 31% |
| AI API 활용 | 12 | 9% |
| 데이터 분석 | 10 | 8% |
| 업무 도구 연동 | 8 | 6% |
| AI 에이전트 | 7 | 5% |
| 웹 스크래핑/테스트 | 7 | 5% |
| 기타 | 46 | 35% |

### 키워드 매칭 결과

| 매칭 수준 | 키워드 (매칭 스킬 수) |
|-----------|---------------------|
| ✅ 충분 (3+) | 자동화(21), API(13), 에이전트(11), Python(9), GitHub(8), React(8), Claude(8), Vercel(7), Playwright(5), Next.js(5), Notion(5), OpenAI(5), Docker(3), Tailwind(3) |
| ⚠️ 부족 (1~2) | PostgreSQL, Firebase, Gemini, LLM, Linear, Node.js, Slack, Stripe, 스크래핑 |
| ❌ 없음 (0) | Supabase, Webhook, 챗봇, LangSmith, Express, Trigger.dev |

### 범용 스킬 (~40개)

어떤 실습이든 적용 가능: Brainstorming, TDD, Writing Plans, Executing Plans, Code Review, Refactoring, Debugging, Git Worktree, Vitest 등.

→ **범용 스킬만으로도 거의 모든 실습에 1개 이상 매칭 가능** (적중률 80%+ 추정)

### MCP 서버 카탈로그 (가장 큰 갭)

- 현재: 9개, 설치 명령어 0개, 활용 시나리오 0개
- 필요: 최소 15개 + 메타 완비

### 유의미한 통합 최소 기준

| 항목 | 최소 기준 | 현재 | 갭 |
|------|----------|------|-----|
| MCP 서버 (메타 완비) | **15개** | 9개 (메타 없음) | 🔴 1순위 |
| 주제 특화 스킬 | ❌ 6개 중 **4개+** | 0/6 | 🟡 2순위 |
| 범용 스킬 | ≥ 15개 | ~40개 | ✅ 충분 |
| 적중률 (실습 대상) | ≥ 60% | **MVP에서 실측** | 🟡 실측 필요 |

---

## 12. 성공 기준

> **리뷰 반영**: 산출물 지표에 사용자 성과 지표 추가.

### 산출물 지표

| 지표 | 기준 | 측정 방법 |
|------|------|----------|
| 실습 내 스킬 포함율 | ≥ 50% | Rona 실습 생성 로그 |
| 실습 내 MCP 포함율 | ≥ 30% (intermediate+ only) | Rona 실습 생성 로그 |
| API 응답 시간 | P50 ≤ 3초 | REST 응답 시간 로깅 |

### 사용자 성과 지표

| 지표 | 기준 | 측정 방법 |
|------|------|----------|
| **실습 실행 성공률** | 통합 전 대비 향상 | 실습 따라했을 때 에러 없이 완료되는 비율 |
| **스킬 실제 활용률** | 추천된 스킬을 설치/실행한 비율 ≥ 10% | skill_events (referral_source='rona-exercise') |
| **구버전 도구 사용** | 0건 | normalizeModelNames + staleWarnings |

---

## 13. 열린 질문

### 착수 전 필수 결정

| # | 질문 | 제안 |
|---|------|------|
| 1 | `toolDocsContext` 현재 `undefined`인 이유 — 미구현인가 의도적인가? | Rona 코드 확인 (1일 이내) |
| 2 | 서비스 토큰 발급/관리 방식 | 초기: 환경변수 고정 토큰. 향후: admin에서 발급/폐기 |

### 구현 중 결정 가능

| # | 질문 | 제안 |
|---|------|------|
| 3 | MCP 서버 시드 범위 — Rona 37개 도구와 겹치는 것부터? | 교집합 우선 (Stripe, Supabase, Playwright, GitHub 등) |
| 4 | skill_events에 Rona 출처 표시 | `referral_source: 'rona-exercise'`로 구분 |
| 5 | `toolDocsContext`에 스킬을 어떤 형태로 삽입? | §7의 `buildSkillDocsMessage()` 계약서 참조 |
| 6 | Phase 간 시간 간격 | Phase 1→2: 최소 2개월, Phase 2→3: 최소 3개월 |
| 7 | API 실전 패턴 심화 — `reference_docs` 6KB 제한 내 스트리밍/웹훅 등 심화 패턴 커버 방안 | Context7 토픽 확대 또는 복리엔진 별도 데이터 소스 (Phase 2 이후 검토) |

---

*다음 단계: Phase 1a 착수 — 복리엔진 REST 엔드포인트 + Rona 클라이언트 병렬 진행*
