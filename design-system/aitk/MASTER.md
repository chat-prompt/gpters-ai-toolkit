# Design System Master File

> **LOGIC:** 특정 페이지를 만들 때는 `design-system/aitk/pages/[page-name].md`를 먼저 확인한다.
> 그 파일이 있으면 그쪽 규칙이 이 문서를 **override** 한다. 없으면 아래를 따른다.

---

**Project:** aitk (복리엔진 / GPTers AI Toolkit)
**Stack:** Next.js 16 · React 19 · Tailwind CSS v4 · next-intl (ko/en)
**Category:** Internal developer tool — 스킬 카탈로그 + 사내 AX 대시보드
**Design Dials:** Variance 5/10 (Balanced) | Motion 3/10 (Subtle) | Density 6/10 (Standard)

**정본은 `apps/web/app/globals.css`다.** 이 문서는 거기 있는 값을 설명하는 것이지 새로 정하는 게 아니다.
토큰을 바꾸려면 globals.css를 고치고 이 문서를 같이 갱신한다.

---

## Global Rules

### Color Palette

**라이트/다크 양쪽을 모두 지원한다.** `[data-theme="light"]`가 `:root`를 덮어쓴다.
색은 하드코딩하지 않고 항상 CSS 변수로 참조한다.

| Role | CSS Variable | Dark (`:root`) | Light (`[data-theme="light"]`) |
|------|--------------|----------------|-------------------------------|
| 배경 (기본) | `--bg-primary` | `#0c0c0d` | `#ffffff` |
| 배경 (표면/카드) | `--bg-secondary` | `#141416` | `#fafafa` |
| 배경 (한 단계 더) | `--bg-tertiary` | `#1c1c1f` | `#f0f0f0` |
| 본문 텍스트 | `--text-primary` | `#f5f5f5` | `#0a0a0a` |
| 보조 텍스트 | `--text-secondary` | `#a1a1a6` | `#52525b` |
| 흐린 텍스트 | `--text-muted` | `#71717a` | `#8b8b93` |
| **브랜드/CTA** | `--brand-primary` | `#F26522` | `#D95A1E` |
| 브랜드 (보조) | `--brand-secondary` | `#FF8C42` | `#E07538` |
| 경계선 (기본) | `--border-subtle` | `rgba(255,255,255,0.09)` | `rgba(10,10,10,0.10)` |
| 경계선 (hover) | `--border-hover` | `rgba(255,255,255,0.22)` | `rgba(10,10,10,0.24)` |
| 상태 — 정보 | `--accent-cyan` | `#38bdf8` | `#0284c7` |
| 상태 — 성공 | `--accent-green` | `#22c55e` | `#16a34a` |
| 상태 — 주의 | `--accent-orange` | `#f97316` | `#ea580c` |

**Color Notes**
- 브랜드 오렌지 `#F26522`는 GPTers 브랜드 색이다. 강조색은 이것 하나뿐 — accent-* 는 **상태 표시 전용**이고 장식으로 쓰지 않는다.
- 라이트 모드 브랜드색을 다크와 다르게 둔 이유: `#F26522`는 흰 배경에서 대비 4.5:1을 못 넘긴다. `#D95A1E`가 통과한다.
- 크림/베이지 계열 배경은 쓰지 않는다 (2026-08-06 명시적으로 기각됨 — "누리끼리하다"). 배경은 순백 또는 근사흑.

### Typography

- **본문·제목 모두:** `Pretendard Variable` → `Pretendard` → `var(--font-geist-sans)` → system sans
- **숫자·코드:** `var(--font-geist-mono)` → `ui-monospace`
- 로드: `apps/web/app/[locale]/layout.tsx`의 `<head>`에서 jsDelivr CDN preload + stylesheet (dynamic subset)

**Inter를 쓰지 않는다.** 한글 자소 커버리지가 없어 한글이 fallback 폰트로 떨어지면서 한 화면에 두 서체가 섞인다. 이 프로젝트는 ko/en 이중 언어이므로 Pretendard가 요구사항이다.

대시보드 수치·토큰 수·퍼센트는 monospace로 렌더한다 (자릿수가 흔들리지 않아야 표에서 읽힌다).

### Spacing

*Density 6/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` | 아이콘·인라인 간격 |
| `--space-sm` | `8px` | 라벨·입력 묶음 |
| `--space-md` | `16px` | 기본 패딩 |
| `--space-lg` | `24px` | 카드 내부 패딩 |
| `--space-xl` | `32px` | 섹션 간격 |
| `--space-2xl` | `48px` | 큰 섹션 구분 |

페이지 컨테이너는 `max-w-[1400px] mx-auto` (`.page-shell`).

### Elevation — 그림자를 쓰지 않는다

깊이는 **1px 경계선과 배경 단계 차이**로 표현한다. `box-shadow`는 모달·드롭다운 등 실제로 떠 있어야 하는 요소에만 허용한다.

`.glow-cyan` / `.glow-green`은 `box-shadow: none`으로 무력화돼 있다 — 네온 글로우는 이 시스템에서 제거됐다. 다시 넣지 않는다.

---

## Component Specs

### Cards — `.surface-card` / `.ax-card`

```css
.surface-card, .ax-card {
  padding: 1.75rem;          /* md 이상에서 2rem */
  border-radius: 0.75rem;    /* 12px */
  border: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
  transition: border-color 200ms ease, background-color 200ms ease;
}
```

hover 시 `--border-hover`로 경계선만 바꾼다. **transform으로 카드를 띄우지 않는다** (레이아웃 흔들림).

밀도가 높은 영역(표, 지표 나열)에서는 카드를 쓰지 않고 `border-t` / `divide-y`로 묶는다. 카드는 실제로 계층이 필요할 때만.

### Buttons

Primary는 `--brand-primary` 배경 + 흰 텍스트. Secondary는 투명 배경 + `--border-subtle` 경계선.
누를 때 `translateY(-1px)` 또는 `scale(0.98)` — 둘 중 하나만, 레이아웃을 밀지 않는 범위에서.

### Focus

```css
outline: 2px solid var(--brand-primary);
outline-offset: 2px;
box-shadow: none;
```

`:focus-visible`에만 건다. `outline: none`은 금지.

### 상태 3종 필수

목록·데이터를 그리는 컴포넌트는 세 상태를 모두 구현한다:
- **로딩** — 레이아웃 크기에 맞춘 스켈레톤 (`.shimmer` / `.ax-shimmer`). 원형 스피너 금지.
- **비어 있음** — 왜 비었고 뭘 하면 채워지는지 한 줄.
- **오류** — 인라인 메시지. 데이터 소스 미연결은 오류가 아니라 별도 상태(`not_configured`)로 다룬다.

---

## Motion

*Motion 3/10 — Subtle*

- 전환은 `150–300ms`, easing `cubic-bezier(0.16, 1, 0.3, 1)`.
- **`transform`과 `opacity`만 애니메이션한다.** `top`/`left`/`width`/`height` 금지.
- 등장 효과는 `.reveal` / `.ax-reveal` (opacity + 8~16px y 오프셋). 슬라이드가 아니라 페이드로 읽혀야 한다.
- 무한 루프 애니메이션은 스켈레톤 shimmer 외에는 쓰지 않는다.
- `prefers-reduced-motion` 존중.

GSAP·ScrollTrigger·Framer Motion을 새로 들이지 않는다 — 현재 모션은 전부 CSS transition으로 충분하다.

---

## Anti-Patterns (Do NOT Use)

- ❌ **Inter 등 한글 미지원 서체** — 한글이 fallback으로 떨어져 서체가 섞인다
- ❌ **네온 글로우 / box-shadow 장식** — 제거된 스타일이다
- ❌ **크림·베이지 배경**
- ❌ **노이즈 오버레이 / 그리드 패턴 배경** — `content: none`으로 꺼져 있다
- ❌ **이모지를 아이콘으로 사용** — SVG 아이콘 사용
- ❌ **사용자 대면 UI에 내부 토큰 노출** — Linear 티켓번호(`DEV-1234`), 코드 섹션 기호(`§5`) 등. 어드민 UI도 사용자 대면이다
- ❌ **레이아웃을 흔드는 hover** — scale/translate로 주변을 밀지 않는다
- ❌ **`h-screen`** — `min-h-[100dvh]` 사용 (모바일 주소창)
- ❌ **대비 4.5:1 미만 텍스트**
- ❌ **보이지 않는 focus 상태**

---

## Pre-Delivery Checklist

- [ ] 색을 CSS 변수로 참조했는가 (하드코딩 hex 없음)
- [ ] 라이트/다크 양쪽에서 확인했는가
- [ ] 로딩·비어있음·오류 3종 상태 구현
- [ ] 숫자는 monospace
- [ ] 아이콘은 SVG (이모지 아님)
- [ ] 클릭 요소에 `cursor-pointer`
- [ ] `:focus-visible` 링 보임
- [ ] `prefers-reduced-motion` 존중
- [ ] 반응형: 375 / 768 / 1024 / 1440px
- [ ] 모바일 가로 스크롤 없음
- [ ] 내부 토큰(티켓번호·§기호) 노출 없음
