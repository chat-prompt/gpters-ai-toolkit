# DEV-4484 — semantic_search 재랭킹 문턱값 근거

작성 2026-09-21. `packages/lib/src/search/rerank.ts`의 `RERANK_THRESHOLDS` 값이 어디서 나왔는지 적는다. 상위 문서는 `2026-09-21-aitk-search-rerank-and-latency-handoff.md` §2다.

## 결론

| 문턱 | 값 | 뜻 |
|---|---|---|
| `embeddingGapBelow` | 0.05 | 임베딩 1·2등 차이가 이보다 작으면 JEV를 부른다 |
| `jevTopAtLeast` | 0.5 | JEV 1등 점수가 이보다 낮으면 원래 순서를 쓴다 |
| `jevMarginAtLeast` | 0.2 | JEV 1·2등 차이가 이보다 작으면 원래 순서를 쓴다 |
| `timeoutMs` | 800 | JEV가 이보다 늦으면 기다리지 않고 원래 순서를 쓴다 |

- 질의 15개 기준으로, 1등 정답이 임베딩만 쓸 때 **13/14**에서 재랭킹 후 **14/14**가 된다. 틀렸던 하나(슬랙 요약 → 카카오톡 도구)가 고쳐졌고, 맞던 순서가 뒤집힌 경우는 없다.
- 시험한 27개 조합(gap 0.03/0.05/0.08 × top 0.3/0.5/0.7 × margin 0.1/0.2/0.3)이 **모두 14/14**다. 이 표본으로는 문턱값끼리 우열을 가릴 수 없다. 문턱값을 바꾸면 JEV 호출 수만 달라진다.
- 그래서 가운데 값을 골랐다. 이 설정이면 15개 중 **9개에서 JEV를 부르고**, 그중 **4개에만** JEV 순서를 적용한다. 나머지 5개는 JEV도 가르지 못해서 원래 순서를 유지했다.
- **제한 시간 800ms**: 정식 채택 전인 실험 기능이라 검색을 오래 붙잡지 않는다(처음 값은 2.5초였다). 대부분의 호출(220~280ms)은 여유 있게 통과하고, 연결을 처음 맺는 느린 호출(700~860ms)은 원래 순서로 넘긴다. 운영 함수(sin1)에서 잰 값은 아래 Preview 절에 있다.
- **키가 없으면 바로 기존 방식이다.** 후보를 넓게 뽑지도, JEV를 부르지도 않는다(unit 테스트로 고정).
- **"항상 재랭킹"도 이 표본에서는 14/14였다.** 그래도 문턱을 둔 이유는 둘이다. 첫째, 임베딩이 확신하는 질의(6/15)에서는 지연과 비용을 아낄 수 있다. 둘째, JEV 점수가 뭉칠 때(예: 블로그 초안 0.72/0.70) 순서를 흔들지 않는다.

## JEV 지연·비용 (한국에서 호출)

- 후보 20개를 한 요청에 담으면 입력이 5,150~5,714토큰이다.
- 지연은 대부분 221~281ms다. 처음 두 건만 697ms, 856ms였다(연결 준비로 보인다). 핸드오프가 예상한 0.6~0.9초보다 짧다.
- 운영 함수(sin1)에서의 지연은 Preview 배포에서 따로 잰다.

## 방법

1. 질의 15개에 대해 운영 MCP `semantic_search`(`limit=20`)로 임베딩 후보 20개를 받았다. 읽기 호출이고, `_source: latency-measure`를 붙였다.
2. 각 질의에 정답 라벨을 붙였다. 후보의 이름과 설명을 보고 사람이 판단했다(아래 표). 맞는 도구가 없는 질의(DB 마이그레이션)는 정확도 계산에서 빼고 호출 수에만 넣었다.
3. `rerank.ts`의 `buildJevRequest`를 그대로 써서 질의마다 JEV(`jev-latest`)를 한 번씩 불렀다.
4. `rerank.ts`와 같은 판정 로직으로 문턱 조합을 오프라인에서 돌려 비교했다. 스크립트는 커밋하지 않았다.

## 질의별 결과 (gap 0.05 / top 0.5 / margin 0.2)

| 질의 | 정답 라벨 | 임베딩 1·2등 차이 | JEV 1·2등 점수 | 판정 | 최종 1등 |
|---|---|---:|---|---|---|
| 슬랙에 올라온 대화를 요약해서 정리해주는 도구 | meeting-archive | 0.017 | 0.89 / 0.14 | 적용 | meeting-archive ✅ (임베딩 1등은 duckhu-archive ❌) |
| PR 코드 리뷰를 자동으로 해주는 스킬 | openclaw-pr-reviewer | 0.063 | 0.91 / 0.43 | 임베딩 확신 | openclaw-pr-reviewer ✅ |
| 발표 자료 슬라이드 만들기 | slide-deck 외 5 | 0.067 | 0.87 / 0.74 | 임베딩 확신 | slide-deck ✅ |
| 데이터베이스 마이그레이션 안전하게 적용하기 | (없음) | 0.040 | 0.14 / 0.12 | JEV 불확실 | supabase-postgresql-best-practices |
| 블로그 글 초안 작성 도와줘 | bbojjak-column-writer, kaizen, content-research-writer | 0.014 | 0.72 / 0.70 | JEV 불확실 | bbojjak-column-writer ✅ |
| 카카오톡 대화 내용을 파일로 뽑아내고 싶어 | kakao-extract, kakaotalk | 0.033 | 0.74 / 0.57 | JEV 불확실 | kakao-extract ✅ |
| 파워포인트 파일 수정하기 | pptx-creator, create-pptx | 0.004 | 0.88 / 0.78 | JEV 불확실 | pptx-creator ✅ |
| 배포 전에 보안 취약점 점검 | secure-check 외 3 | 0.006 | 0.85 / 0.63 | 적용 | secure-check ✅ |
| 회의록 정리해줘 | meeting-notes, meeting-archive | 0.022 | 0.90 / 0.36 | 적용 | meeting-notes ✅ |
| 논문 초안에 대한 심사 의견 받기 | peer-review | 0.060 | 0.93 / 0.23 | 임베딩 확신 | peer-review ✅ |
| 구글 슬라이드 템플릿 복제해서 이름만 바꿔 여러 개 만들기 | ot-slide-generator | 0.016 | 0.84 / 0.07 | 적용 | ot-slide-generator ✅ |
| 쓰레드(Threads)에 글 올리기 | gpters-threads, bbojjak-column-to-thread | 0.021 | 0.62 / 0.48 | JEV 불확실 | gpters-threads ✅ |
| 비개발자가 DB 설계하기 | db-design-deep-interview | 0.073 | 0.79 / 0.18 | 임베딩 확신 | db-design-deep-interview ✅ |
| 전자책 파일로 변환 | claude-epub-reader | 0.168 | 0.78 / 0.22 | 임베딩 확신 | claude-epub-reader ✅ |
| HTML 파일을 공유 링크로 발행하고 코멘트 받기 | html-share | 0.157 | 0.96 / 0.16 | 임베딩 확신 | html-share ✅ |

## 한계와 다음 조정

- **표본이 15개이고, 임베딩이 틀린 사례는 1개뿐이다.** 문턱값은 이 표본으로 "망가뜨리지 않는다"만 확인했다. 최적값이라는 근거는 아니다.
- 배포 후에는 감사 로그 `mcp_audit_logs.search_results`의 `embeddingRank`(재랭킹 전 순위)와 `rerankScore`(JEV 점수)로 실제 질의에서 순위가 얼마나 바뀌는지 모은다. 여기에 후속 `get_plugin_content` 로드 여부를 붙이면 문턱값을 실데이터로 다시 맞출 수 있다.
- 클라이언트가 받는 `relevanceScore`는 임베딩 점수 그대로 둔다. 팀 규칙의 "관련도 0.40 이상이면 로드"가 이 값을 쓴다. 그래서 재랭킹이 적용되면 목록이 점수 내림차순이 아닐 수 있다.
