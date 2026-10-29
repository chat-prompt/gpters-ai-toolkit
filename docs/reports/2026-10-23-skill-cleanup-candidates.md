# 스킬 정리 후보 (2026-10-23 기준)

Linear [DEV-4709](https://linear.app/geniefy/issue/DEV-4709)를 하면서 운영 DB에서 스킬별 사용량을 뽑고 정리 후보를 골랐습니다.

## 요약

| 단계                            |             90일 기준 |            180일 기준 |
| ----------------------------- | -----------------: | -----------------: |
| 기간                            | 2026-07-25 ~ 10-22 | 2026-04-26 ~ 10-22 |
| 게시된 항목 전체 (스킬·커맨드·가이드·훅·에이전트) |                516 |                516 |
| 기간 시작 전에 올라온 것                |                484 |                441 |
| 그중 기간 동안 한 번도 안 쓰임            |            **210** |            **155** |
| 그중 검색 결과에도 한 번도 안 나옴 (A)      |             **12** |              **9** |
| 검색에는 나왔지만 불러온 기록 없음 (B)       |                198 |                146 |

- 아직 아무것도 지우거나 숨기지 않았습니다. 이 문서는 후보를 정리만 해 둔 것입니다.
- A는 먼저 정리할 대상이고 B는 작성자와 같이 볼 대상입니다.
- `article-extractor`는 두 기준 모두 A에 들어가지만 **살립니다.**  임베딩이 없어서 처음부터 검색에 나올 수 없었습니다(아래 "임베딩" 참고).
- 등록 시기: 4/26 이전 441개, 4/26(180일 기준 시작일) ~ 7/24 43개, 7/25(90일 기준 시작일) 이후 32개. 지금 게시 상태인 것만 셌습니다.

## 기준

1. **기간 시작 전에 올라온 항목만 봅니다.** 새 스킬은 아직 쓰일 기회가 적었을 수 있습니다.
2. **기간 동안 한 번도 안 쓰인 것만 남깁니다.** "썼다"는 스킬 내용을 불러온 기록(load)을 말합니다. 검색 결과에 보인 것은 쓴 것으로 세지 않습니다.
3. **불러온 기록과 검색에 나온 기록은 두 곳에 남습니다. 둘을 합쳐서 셌습니다.**
   - MCP 호출 기록(`mcp_audit_logs`): `aitk search`·`aitk get` 같은 호출마다 한 줄씩 남습니다. 불러온 기록은 2026-01-06부터, 검색 결과는 2026-02-19부터 있습니다.
   - 스킬 사용 기록(`skill_events`): 스킬 단위로 따로 정리한 기록입니다. 2026-06-14부터만 있습니다.
   - 불러온 기록은 두 기준 모두 스킬 사용 기록의 load와 MCP 호출 기록의 `get_plugin_content` 성공 건을 합쳤습니다.
   - 검색에 나온 기록은 기준마다 다르게 셌습니다. 180일 기준은 스킬 사용 기록의 search와 MCP 호출 기록의 `semantic_search` 결과를 합쳤습니다. 90일 기준은 스킬 사용 기록의 search만 셌습니다. 90일 구간은 모두 6/14 이후라 스킬 사용 기록이 빠짐없이 있습니다.
   - 6/14 이후에는 검색 한 번이 두 기록에 모두 남습니다(`apps/web/app/api/mcp/route.ts`). 그래서 180일 기준의 횟수는 6/14 이후 부분이 두 번 세어졌습니다. 0번인지 아닌지는 바뀌지 않아 A·B 분류에는 영향이 없습니다. 180일 B 목록의 노출 횟수는 순서를 볼 때만 씁니다.
   - 180일 기준 앞부분(4/26~6/13)은 스킬 사용 기록이 없어서 MCP 호출 기록으로만 셌습니다. MCP 호출 기록은 1월부터 있어서 빠진 기간은 없습니다. 다만 이 구간은 MCP 호출 기록의 `pluginId` 칸으로만 스킬을 알아봤습니다. 다른 칸으로 스킬을 부른 호출이 있었다면 빠졌을 수 있습니다(확인하지 않음).
4. **검색에 나온 횟수로 A와 B를 나눴습니다.** 기간 동안 한 번도 안 쓰인 것 가운데 검색 결과에도 한 번도 안 나온 것은 A입니다. 검색 결과에는 나왔지만 아무도 불러오지 않은 것은 B입니다.

## 임베딩

검색은 항목마다 저장된 임베딩(검색용 벡터)으로 찾습니다. 
임베딩이 없으면 검색 결과에 나오지 않습니다(`packages/lib/src/search/vector-search.ts`). 의미 검색 결과가 0개일 때만 이름·설명·태그 글자로 다시 찾습니다. 이런 경우는 드뭅니다. 스킬 ID를 알고 바로 불러오는 것(`aitk get`, `get_plugin_content`)은 임베딩이 없어도 됩니다.

게시된 516개 중 514개는 임베딩이 있습니다(초안 2개도 있음). 모두 3072개 숫자로 된 벡터로, 지금 모델(text-embedding-3-large)로 만든 것입니다. 3/4 모델 변경 때 전부 지우고 다시 만들었기 때문에 옛 모델 임베딩은 남아 있지 않습니다.

없는 것은 2개입니다. 둘 다 `aitk` CLI의 deploy로 올라왔습니다. deploy는 스킬을 저장한 뒤 임베딩 생성을 기다리지 않고 성공을 돌려줍니다. 생성이 끝내 실패해도 서버 로그만 남깁니다. 나중에 임베딩만 다시 만드는 단계도 없습니다(`packages/lib/src/mcp/handlers.ts`). 토큰 한도를 넘었을 때만 글을 줄여 최대 3번 보냅니다. 그래서 올린 사람은 실패를 알 수 없습니다. 실패한 몇 개만 빈 채로 남습니다.

| id | 이름 | 작성자 | 등록일 | 빠진 이유 | 할 일 |
|----|------|--------|--------|-----------|-------|
| `article-extractor` | 아티클 추출기 (Article Extractor) | 현진우 | 2026-03-05 | 466토큰짜리 짧은 글이라 길이 문제는 아닙니다. 3/4 전체 재생성 다음 날 올라왔습니다. 올라오기 직전(3/5 14:50~14:59)에 deploy 경로를 고치는 커밋이 연달아 들어갔습니다. 그때 한 번 실패한 것으로 보이지만 로그가 없어 확정하지 못했습니다 | 작성자에게 **같은 내용으로 다시 올려 달라고** 요청합니다. 짧은 글이라 다시 올리면 임베딩이 만들어질 것입니다. 올린 뒤 운영 DB에서 임베딩이 생겼는지 확인합니다 |
| `gpters-newsletter-v2` | gpters-newsletter-v2 | 강지인 | 2026-08-31 | 본문이 길어서 임베딩 API 한도(8,191토큰)를 넘습니다. 서버가 30%씩 줄여 가며 최대 3번(처음 1번, 다시 2번) 보내도 20,006 → 13,552 → 9,424토큰으로 계속 넘습니다. 8/31~9/3에 10번 넘게 다시 올렸지만 매번 실패했습니다 | 다시 올려도 해결되지 않습니다. DEV-4697 변경(임베딩에 본문을 넣지 않음)이 배포되면 해결됩니다. 그 전까지는 ID로 불러 쓰는 데 문제가 없습니다. 90일 동안 검색 노출 0번, 사용 24번이고 모두 `aitk` CLI로 ID를 지정해 불러온 것입니다 |

같은 이유로 `write-post`와 `feedback-coach`도 지금 본문 길이로는 임베딩 생성이 실패합니다. 둘은 본문이 짧던 예전에 만든 임베딩이 남아 있습니다. 그래서 검색은 예전 내용 기준으로 됩니다. 이 둘도 DEV-4697 배포 때 전체 임베딩을 다시 만들면 새 내용으로 바뀝니다.

## 90일 기준 (2026-07-25 ~ 10-22)

### A. 검색에도 안 나온 12개

모두 스킬입니다.

| id | 이름 | 작성자 | 등록일 | 비고 |
|----|------|--------|--------|------|
| `article-extractor` | 아티클 추출기 (Article Extractor) | 현진우 | 2026-03-05 | **살림** (임베딩 없음) |
| `user-story-writing` | 유저 스토리 작성 | 현진우 | 2026-02-24 | |
| `codex-sentry` | Sentry Error Tracking | 현진우 | 2026-03-09 | |
| `codex-playwright-interactive` | Playwright Interactive Browser | 현진우 | 2026-03-09 | |
| `codex-winui-app` | WinUI App Development | 현진우 | 2026-03-09 | |
| `indirect-prompt-injection` | indirect-prompt-injection | 현진우 | 2026-04-16 | |
| `detect-injection` | content-moderation | 현진우 | 2026-04-16 | |
| `defuddle-parse` | Defuddle Parse | 김태현 | 2026-03-16 | 180일 기준에서는 검색 노출 1번 |
| `gstack-design-consultation` | gstack / design-consultation | 김태현 | 2026-03-19 | 180일 기준에서는 검색 노출 1번 |
| `gstack-retro` | gstack / retro | 김태현 | 2026-03-19 | |
| `html-slides` | html-slides | 김태현 | 2026-03-31 | |
| `builderio-visual-plan` | BuilderIO / visual-plan | 김태현 | 2026-06-17 | 180일이 안 돼서 180일 기준에는 없습니다 |

### B. 검색에는 나왔지만 안 쓰인 198개

작성자별 개수:

| 작성자 | 개수 |
|--------|-----|
| 현진우 | 169 |
| 김태현 | 19 |
| 최하영 | 5 |
| 조효희 (타타) | 3 |
| 한가경 | 1 |
| 윤누리 | 1 |

<details>
<summary>전체 목록 (90일 검색 노출 많은 순)</summary>

| id | 이름 | 종류 | 작성자 | 등록일 | 검색 노출 90일 |
|----|------|------|--------|--------|----:|
| `evals-build-review-interface` | AI Build Review Interface (evals-skills) | skill | 현진우 | 2026-03-25 | 114 |
| `bbopters-newsletter-onboarding` | bbopters-newsletter-onboarding | skill | 조효희 (타타) | 2026-06-23 | 103 |
| `modusign-auto-send` | 모두싸인 계약서 자동 발송 | skill | 최하영 | 2026-03-12 | 102 |
| `excalidraw-diagram` | Excalidraw 다이어그램 생성기 | skill | 현진우 | 2026-02-12 | 94 |
| `db-design-deep-interview` | DB 설계 Deep Interview | skill | 현진우 | 2026-01-20 | 82 |
| `kakao-extract` | kakao-extract | skill | 조효희 (타타) | 2026-06-19 | 82 |
| `study-detail-page` | study-detail-page | skill | 현진우 | 2026-04-16 | 80 |
| `video-mask` | video-mask - 민감정보 마스킹 영상 제작 | skill | 한가경 | 2026-07-10 | 79 |
| `billing` | billing | skill | 현진우 | 2026-04-16 | 76 |
| `zoom-survey-pipeline` | zoom-survey-pipeline | skill | 현진우 | 2026-04-16 | 75 |
| `openclaw-lesson` | openclaw-lesson | skill | 현진우 | 2026-04-16 | 72 |
| `ot-slide-generator` | ot-slide-generator | skill | 현진우 | 2026-04-16 | 67 |
| `gpters-free-purchase` | GPTers 0원결제 (무상 구매) 처리 | skill | 현진우 | 2026-02-12 | 65 |
| `lms-plaza-banner` | lms-plaza-banner | skill | 현진우 | 2026-04-16 | 59 |
| `bettermode-field-sync` | bettermode-field-sync | skill | 현진우 | 2026-04-16 | 56 |
| `expo-app-design` | Expo App Design | skill | 현진우 | 2026-02-24 | 55 |
| `best-presentation-export` | best-presentation-export | skill | 현진우 | 2026-04-16 | 53 |
| `product-marketing-manager` | 프로덕트 마케팅 매니저 | skill | 현진우 | 2026-03-05 | 50 |
| `leader-self-enroll` | leader-self-enroll | skill | 현진우 | 2026-04-16 | 47 |
| `gpters-renewal-interview` | GPTers 리뉴얼 인터뷰 | command | 최하영 | 2026-02-25 | 47 |
| `deep-interview-prompt` | Deep Interview Prompt | skill | 현진우 | 2026-01-13 | 47 |
| `zoom-gateway` | Zoom 게이트웨이 설정 | skill | 현진우 | 2026-03-16 | 46 |
| `openclaw-deploy-agent` | OpenClaw 배포 에이전트 (Deploy Agent) | skill | 현진우 | 2026-02-26 | 45 |
| `newsletter-creation` | 뉴스레터 생성 | skill | 현진우 | 2026-03-05 | 44 |
| `portone-payment-link` | 포트원 결제 링크 생성 | skill | 최하영 | 2026-01-27 | 42 |
| `add-schedule` | add-schedule | skill | 현진우 | 2026-04-16 | 41 |
| `account-merge` | 계정통합 원클릭 | skill | 현진우 | 2026-04-16 | 40 |
| `modusign-contract-sender` | 모두싸인 계약서 자동발송 | skill | 최하영 | 2026-03-12 | 38 |
| `marketing-content-anthropic` | 마케팅 콘텐츠 크리에이터 (Anthropic) | skill | 현진우 | 2026-02-24 | 38 |
| `free-tool-strategy` | 무료 도구 전략 (Engineering as Marketing) | skill | 현진우 | 2026-03-05 | 37 |
| `neon-postgres-access` | GPTers PostgreSQL 접근 가이드 | skill | 현진우 | 2026-01-12 | 36 |
| `mixpanel-api-guide` | Mixpanel API 가이드 | skill | 현진우 | 2026-03-05 | 35 |
| `scientific-poster` | 학술 포스터 생성 (Scientific Poster) | skill | 현진우 | 2026-03-05 | 33 |
| `schema-markup` | 스키마 마크업 | skill | 현진우 | 2026-03-05 | 32 |
| `app-store-optimization` | 앱스토어 최적화 (ASO) | skill | 현진우 | 2026-03-05 | 32 |
| `hightouch-sync` | hightouch-sync | skill | 현진우 | 2026-04-16 | 28 |
| `build-check-hook` | Build Check Hook | hook | 현진우 | 2026-01-06 | 27 |
| `mp4-to-gif` | mp4-to-gif | skill | 최하영 | 2026-03-11 | 27 |
| `kipris-mcp-installer` | KIPRIS MCP Installer | skill | 김태현 | 2026-04-04 | 27 |
| `literature-review` | 문헌 리뷰 (Literature Review) | skill | 현진우 | 2026-03-05 | 26 |
| `zoom-survey-sync` | zoom-survey-sync | skill | 현진우 | 2026-04-16 | 26 |
| `codex-vercel-deploy` | Vercel Deploy | skill | 현진우 | 2026-03-09 | 25 |
| `codex-security-best-practices` | Security Best Practices | skill | 현진우 | 2026-03-09 | 25 |
| `bbopters-instatoon-onboarding` | bbopters-instatoon-onboarding | skill | 조효희 (타타) | 2026-06-23 | 24 |
| `qa-answer` | qa-answer | skill | 현진우 | 2026-04-16 | 23 |
| `github-actions-generator` | GitHub Actions 워크플로우 생성기 | skill | 현진우 | 2026-03-05 | 22 |
| `monitor-setup` | 모니터링 설정 커맨드 | command | 현진우 | 2026-03-05 | 22 |
| `site-architecture` | 사이트 아키텍처 | skill | 현진우 | 2026-03-05 | 22 |
| `book-factory` | 논픽션 도서 제작 파이프라인 (Non-Fiction Book Factory) | skill | 현진우 | 2026-03-05 | 21 |
| `membership-extend` | membership-extend | skill | 현진우 | 2026-04-16 | 21 |
| `positioning-basics` | 포지셔닝 기본 | skill | 현진우 | 2026-03-05 | 20 |
| `marketing-psychology` | 마케팅 심리학 & 멘탈 모델 | skill | 현진우 | 2026-03-05 | 20 |
| `programmatic-seo` | 프로그래매틱 SEO | skill | 현진우 | 2026-03-05 | 19 |
| `dev-docs-reminder-hook` | Dev Docs Reminder Hook | hook | 현진우 | 2026-01-06 | 19 |
| `content-idea-generator` | 콘텐츠 아이디어 생성 | skill | 현진우 | 2026-03-05 | 19 |
| `codex-slides` | PowerPoint Slides Creator | skill | 현진우 | 2026-03-09 | 19 |
| `slo-implement` | SLO 구현 가이드 | command | 현진우 | 2026-03-05 | 19 |
| `churn-prevention` | 이탈 방지 (Churn Prevention) | skill | 현진우 | 2026-03-05 | 18 |
| `api-key-permission-guide` | API 키 권한 추천 | skill | 현진우 | 2026-02-05 | 18 |
| `codex-yeet` | Yeet (Git Quick Ship) | skill | 현진우 | 2026-03-09 | 18 |
| `ci-setup` | CI/CD 설정 커맨드 | command | 현진우 | 2026-03-05 | 17 |
| `homepage-audit` | 홈페이지 감사 | skill | 현진우 | 2026-03-05 | 17 |
| `prose-writing` | 산문 창작 | skill | 현진우 | 2026-02-24 | 17 |
| `agile-product-owner` | 애자일 프로덕트 오너 | skill | 현진우 | 2026-03-05 | 17 |
| `content-research-writer` | 리서치 기반 콘텐츠 라이터 | skill | 현진우 | 2026-02-24 | 17 |
| `sales-call-prep-anthropic` | 세일즈 콜 준비 (Anthropic) | skill | 현진우 | 2026-02-24 | 17 |
| `codex-doc` | Word Document Creator | skill | 현진우 | 2026-03-09 | 17 |
| `marketing-ideas` | 마케팅 아이디어 (SaaS 140+) | skill | 현진우 | 2026-03-05 | 16 |
| `firebase-apk-scanner` | Firebase APK 스캐너 | skill | 현진우 | 2026-03-05 | 16 |
| `slides` | slides | skill | 김태현 | 2026-03-31 | 16 |
| `prometheus-promql` | Prometheus PromQL 생성기 | skill | 현진우 | 2026-03-05 | 15 |
| `linkedin-profile-optimizer` | LinkedIn 프로필 최적화 | skill | 현진우 | 2026-03-05 | 15 |
| `product-marketing-context` | 프로덕트 마케팅 컨텍스트 | skill | 현진우 | 2026-03-05 | 15 |
| `jira-administrator` | Jira 관리자 | skill | 현진우 | 2026-03-05 | 15 |
| `vercel-react-best-practices` | Vercel React Best Practices | skill | 현진우 | 2026-01-28 | 15 |
| `gog` | gog | skill | 현진우 | 2026-04-16 | 15 |
| `revenue-operations` | 레버뉴 운영 (RevOps) | skill | 현진우 | 2026-03-05 | 15 |
| `openclaw-healthcheck` | OpenClaw 호스트 보안 점검 | skill | 현진우 | 2026-02-26 | 14 |
| `codex-sora` | Sora Video Generator | skill | 현진우 | 2026-03-09 | 14 |
| `prepare-release` | 릴리스 준비 커맨드 | command | 현진우 | 2026-03-05 | 14 |
| `launch-strategy` | 런치 전략 | skill | 현진우 | 2026-03-05 | 14 |
| `owasp-security` | 취약한 기본값 탐지 (Insecure Defaults Detection) | skill | 현진우 | 2026-03-05 | 14 |
| `insecure-defaults` | Insecure Defaults 탐지 | skill | 현진우 | 2026-02-26 | 13 |
| `kubernetes-debugger` | Kubernetes 디버거 | skill | 현진우 | 2026-03-05 | 13 |
| `qmd` | QMD | skill | 김태현 | 2026-03-26 | 13 |
| `story-critique` | 스토리 비평 | skill | 현진우 | 2026-02-24 | 13 |
| `finishing-a-development-branch` | Finishing a Development Branch | skill | 현진우 | 2026-02-09 | 13 |
| `social-media-analyzer` | 소셜 미디어 분석 | skill | 현진우 | 2026-02-24 | 12 |
| `marketing-principles` | 마케팅 원칙 | skill | 현진우 | 2026-03-05 | 12 |
| `openclaw-docker-essentials` | OpenClaw Docker 필수 명령어 | skill | 현진우 | 2026-02-26 | 12 |
| `customer-success-manager` | 고객 성공 매니저 | skill | 현진우 | 2026-03-05 | 12 |
| `k8s-manifest` | Kubernetes 매니페스트 생성기 | command | 현진우 | 2026-03-05 | 11 |
| `codex-security-threat-model` | Security Threat Model | skill | 현진우 | 2026-03-09 | 11 |
| `discovery-process` | 디스커버리 프로세스 | skill | 현진우 | 2026-02-24 | 11 |
| `docx-creator` | Word 문서 생성/편집/분석 | skill | 현진우 | 2026-02-26 | 11 |
| `brand-guidelines` | 브랜드 가이드라인 스타일링 | guide | 현진우 | 2026-02-24 | 11 |
| `pm-toolkit` | PM 종합 툴킷 | skill | 현진우 | 2026-02-24 | 11 |
| `linkedin-authority-builder` | LinkedIn 권위 구축 | skill | 현진우 | 2026-03-05 | 11 |
| `constant-time-analysis` | 상수 시간 분석 (Constant-Time Analysis) | skill | 현진우 | 2026-03-05 | 11 |
| `docker-optimize` | Docker 최적화 커맨드 | command | 현진우 | 2026-03-05 | 11 |
| `testimonial-collector` | 추천 사례 수집 | skill | 현진우 | 2026-03-05 | 11 |
| `codex-spreadsheet` | Spreadsheet Processor | skill | 현진우 | 2026-03-09 | 10 |
| `proto-persona` | 프로토 페르소나 | skill | 현진우 | 2026-02-24 | 10 |
| `gdpr-compliance` | GDPR/DSGVO 컴플라이언스 | skill | 현진우 | 2026-03-05 | 10 |
| `dockerfile-generator` | Dockerfile 생성기 | skill | 현진우 | 2026-03-05 | 10 |
| `prd-pm-skills` | PRD 작성 (PM-Skills) | skill | 현진우 | 2026-02-24 | 10 |
| `python-fastapi-best-practices` | Python FastAPI Best Practices | guide | 현진우 | 2026-02-24 | 10 |
| `playwright-browser-automation` | Playwright 브라우저 자동화 | skill | 현진우 | 2026-02-26 | 9 |
| `paywall-upgrade-cro` | 페이월 & 업그레이드 CRO | skill | 현진우 | 2026-03-05 | 9 |
| `feature-spec-anthropic` | 기능 스펙/PRD 작성 (Anthropic) | skill | 현진우 | 2026-02-24 | 9 |
| `helm-chart-generator` | Helm 차트 생성기 | skill | 현진우 | 2026-03-05 | 9 |
| `xlsx-processor` | Excel 스프레드시트 작업 | skill | 현진우 | 2026-02-26 | 9 |
| `ost-pm-skills` | 기회 솔루션 트리 (PM-Skills) | skill | 현진우 | 2026-02-24 | 9 |
| `create-xlsx` | Excel 스프레드시트 생성 | skill | 현진우 | 2026-02-24 | 9 |
| `go-mode` | Go 모드 (실행 모드) | skill | 현진우 | 2026-03-05 | 9 |
| `openclaw-cicd-pipeline` | OpenClaw CI/CD 파이프라인 (GitHub Actions) | skill | 현진우 | 2026-02-26 | 9 |
| `openclaw-conventional-commits` | OpenClaw Conventional Commits 가이드 | skill | 현진우 | 2026-02-26 | 8 |
| `codex-gh-fix-ci` | GitHub CI Fix | skill | 현진우 | 2026-03-09 | 8 |
| `meeting-insights-analyzer` | 회의 인사이트 분석기 | skill | 현진우 | 2026-02-24 | 8 |
| `executing-plans` | Executing Plans | skill | 현진우 | 2026-02-09 | 8 |
| `openclaw-git-essentials` | OpenClaw Git 필수 명령어 | skill | 현진우 | 2026-02-26 | 8 |
| `neon-postgres` | Neon Postgres | skill | 현진우 | 2026-02-09 | 8 |
| `email-marketing-expert` | 이메일 마케팅 전문가 | skill | 현진우 | 2026-02-24 | 8 |
| `pricing-strategy` | 가격 전략 | skill | 현진우 | 2026-02-24 | 8 |
| `user-research-anthropic` | 사용자 리서치 종합 (Anthropic) | skill | 현진우 | 2026-02-24 | 8 |
| `confluence-manager` | Confluence 매니저 | skill | 현진우 | 2026-03-05 | 8 |
| `makefile-generator` | Makefile 생성기 | skill | 현진우 | 2026-03-05 | 8 |
| `risk-management` | 리스크 관리 전문가 | skill | 현진우 | 2026-03-05 | 8 |
| `brainstorming-capture` | 브레인스토밍 캡처 | skill | 현진우 | 2026-02-24 | 7 |
| `semgrep-rule-creator` | Semgrep 규칙 생성기 | skill | 현진우 | 2026-03-05 | 7 |
| `gstack-plan-eng-review` | gstack / plan-eng-review | skill | 김태현 | 2026-03-19 | 7 |
| `create-docx` | Word 문서 생성 | skill | 현진우 | 2026-02-24 | 7 |
| `variant-analysis` | 변이 분석 | skill | 현진우 | 2026-02-24 | 7 |
| `tam-sam-som-analysis` | TAM/SAM/SOM 시장 규모 분석 | skill | 현진우 | 2026-02-24 | 7 |
| `ansible-generator` | Ansible 플레이북 생성기 | skill | 현진우 | 2026-03-05 | 7 |
| `prompt-guard` | prompt-guard | skill | 현진우 | 2026-04-16 | 6 |
| `diverse-content-gen` | 다양성 콘텐츠 생성기 | skill | 현진우 | 2026-02-24 | 6 |
| `product-strategist` | 제품 전략가 | skill | 현진우 | 2026-02-24 | 6 |
| `book-to-skill` | Book-to-Skill: 책/문서를 에이전트 스킬로 변환 | skill | 윤누리 | 2026-07-02 | 6 |
| `sharp-edges` | 위험한 API/설정 탐지 (Sharp Edges) | skill | 현진우 | 2026-02-26 | 6 |
| `gstack-codex` | gstack / codex | skill | 김태현 | 2026-03-19 | 6 |
| `senior-project-manager` | 시니어 프로젝트 매니저 | skill | 현진우 | 2026-02-24 | 6 |
| `feature-investment-analysis` | 기능 투자 분석 어드바이저 | skill | 현진우 | 2026-02-24 | 6 |
| `learn-faster-kit` | 빠른 학습 키트 (Learn FASTER) | skill | 현진우 | 2026-03-05 | 6 |
| `cold-email-master` | 콜드 이메일 마스터 | skill | 현진우 | 2026-02-24 | 6 |
| `subagent-driven-development` | Subagent-Driven Development | skill | 현진우 | 2026-02-09 | 6 |
| `positioning-statement` | 포지셔닝 스테이트먼트 | skill | 현진우 | 2026-02-24 | 6 |
| `property-based-testing` | 프로퍼티 기반 테스트 | guide | 현진우 | 2026-02-24 | 6 |
| `codex-notion-spec-to-implementation` | Notion Spec to Implementation | skill | 현진우 | 2026-03-09 | 5 |
| `openclaw-bastion` | openclaw-bastion | skill | 현진우 | 2026-04-16 | 5 |
| `gstack-careful` | gstack / careful | skill | 김태현 | 2026-03-19 | 5 |
| `social-card-generator` | 소셜 카드 생성 | skill | 현진우 | 2026-03-05 | 5 |
| `codex-netlify-deploy` | Netlify Deploy Guide | skill | 현진우 | 2026-03-09 | 5 |
| `tailwind-v4-shadcn` | Tailwind v4 + shadcn/ui | skill | 현진우 | 2026-02-09 | 5 |
| `clawdbot-security-check` | clawdbot-self-security-audit | skill | 현진우 | 2026-04-16 | 5 |
| `ceo-advisor` | CEO 어드바이저 | skill | 현진우 | 2026-02-24 | 4 |
| `codex-playwright` | Playwright Browser Automation | skill | 현진우 | 2026-03-09 | 4 |
| `shadcn-ui` | shadcn/ui | skill | 현진우 | 2026-02-09 | 4 |
| `gstack-qa-only` | gstack / qa-only | skill | 김태현 | 2026-03-19 | 4 |
| `competitive-battlecard-anthropic` | 경쟁 인텔리전스 배틀카드 (Anthropic) | skill | 현진우 | 2026-02-24 | 4 |
| `codex-figma-implement-design` | Figma Design Implementation | skill | 현진우 | 2026-03-09 | 4 |
| `product-strategy-session` | 제품 전략 세션 | skill | 현진우 | 2026-02-24 | 4 |
| `voice-extractor` | 브랜드 보이스 추출 | skill | 현진우 | 2026-03-05 | 3 |
| `gstack-browse` | gstack / browse | skill | 김태현 | 2026-03-19 | 3 |
| `codex-security-ownership-map` | Security Ownership Map | skill | 현진우 | 2026-03-09 | 3 |
| `jtbd-framework` | JTBD 프레임워크 | skill | 현진우 | 2026-02-24 | 3 |
| `gstack-plan-design-review` | gstack / plan-design-review | skill | 김태현 | 2026-03-19 | 3 |
| `gstack-freeze` | gstack / freeze | skill | 김태현 | 2026-03-19 | 3 |
| `static-analysis` | 정적 분석 (CodeQL/Semgrep/SARIF) | skill | 현진우 | 2026-02-26 | 2 |
| `codex-render-deploy` | Render Deploy Guide | skill | 현진우 | 2026-03-09 | 2 |
| `terraform-generator` | Terraform 모듈 생성기 | skill | 현진우 | 2026-03-05 | 2 |
| `codex-chatgpt-apps` | ChatGPT Apps Builder | skill | 현진우 | 2026-03-09 | 2 |
| `last-30-days-research` | 최근 30일 트렌드 리서치 | skill | 현진우 | 2026-03-05 | 2 |
| `scrum-master` | 스크럼 마스터 | skill | 현진우 | 2026-02-24 | 2 |
| `user-story-pm-skills` | 유저 스토리 생성 | skill | 현진우 | 2026-02-24 | 2 |
| `vercel-composition-patterns` | Vercel Composition Patterns | skill | 현진우 | 2026-02-09 | 2 |
| `gstack` | gstack | skill | 김태현 | 2026-03-19 | 2 |
| `gstack-design-review` | gstack / design-review | skill | 김태현 | 2026-03-19 | 2 |
| `gstack-plan-ceo-review` | gstack / plan-ceo-review | skill | 김태현 | 2026-03-19 | 2 |
| `ask-questions-if-underspecified` | 요구사항 불명확 시 질문 강제 | skill | 현진우 | 2026-02-26 | 2 |
| `gstack-setup-browser-cookies` | gstack / setup-browser-cookies | skill | 김태현 | 2026-03-19 | 2 |
| `gstack-ship` | gstack / ship | skill | 김태현 | 2026-03-19 | 2 |
| `gstack-unfreeze` | gstack / unfreeze | skill | 김태현 | 2026-03-19 | 2 |
| `hypothesis-definition` | 가설 정의 | skill | 현진우 | 2026-02-24 | 2 |
| `plan-my-day` | 하루 계획 설계 | skill | 현진우 | 2026-03-05 | 1 |
| `codex-openai-docs` | OpenAI Documentation Guide | skill | 현진우 | 2026-03-09 | 1 |
| `semgrep-security-scan` | Semgrep 보안 스캔 | skill | 현진우 | 2026-02-24 | 1 |
| `openclaw-gh-issues` | OpenClaw GitHub 이슈 자동 수정 | skill | 현진우 | 2026-02-26 | 1 |
| `vision-press-release` | 비전 프레스 릴리스 | skill | 현진우 | 2026-02-24 | 1 |
| `codex-aspnet-core` | ASP.NET Core Development | skill | 현진우 | 2026-03-09 | 1 |
| `gstack-document-release` | gstack / document-release | skill | 김태현 | 2026-03-19 | 1 |
| `gstack-guard` | gstack / guard | skill | 김태현 | 2026-03-19 | 1 |
| `gstack-office-hours` | gstack / office-hours | skill | 김태현 | 2026-03-19 | 1 |
| `codex-jupyter-notebook` | Jupyter Notebook Creator | skill | 현진우 | 2026-03-09 | 1 |
| `cto-advisor` | CTO 어드바이저 | skill | 현진우 | 2026-03-05 | 1 |
| `campaign-analytics` | 캠페인 애널리틱스 | skill | 현진우 | 2026-02-24 | 1 |
| `react-composition-patterns` | React Composition Patterns | skill | 현진우 | 2026-01-28 | 1 |
| `changelog-generator` | 체인지로그 생성기 | skill | 현진우 | 2026-02-24 | 1 |

</details>

## 180일 기준 (2026-04-26 ~ 10-22)

### A. 검색에도 안 나온 9개

모두 스킬입니다. 90일 기준 A 12개 중 9개가 그대로 남았습니다.

| id | 이름 | 작성자 | 등록일 | 비고 |
|----|------|--------|--------|------|
| `article-extractor` | 아티클 추출기 (Article Extractor) | 현진우 | 2026-03-05 | **살림** (임베딩 없음) |
| `user-story-writing` | 유저 스토리 작성 | 현진우 | 2026-02-24 | |
| `codex-sentry` | Sentry Error Tracking | 현진우 | 2026-03-09 | |
| `codex-playwright-interactive` | Playwright Interactive Browser | 현진우 | 2026-03-09 | |
| `codex-winui-app` | WinUI App Development | 현진우 | 2026-03-09 | |
| `indirect-prompt-injection` | indirect-prompt-injection | 현진우 | 2026-04-16 | |
| `detect-injection` | content-moderation | 현진우 | 2026-04-16 | |
| `gstack-retro` | gstack / retro | 김태현 | 2026-03-19 | |
| `html-slides` | html-slides | 김태현 | 2026-03-31 | |

`article-extractor`를 빼면 정리 후보는 8개입니다.

### B. 검색에는 나왔지만 안 쓰인 146개

작성자별 개수:

| 작성자 | 개수 |
|--------|-----|
| 현진우 | 127 |
| 김태현 | 17 |
| 최하영 | 2 |

<details>
<summary>전체 목록 (180일 검색 노출 많은 순)</summary>

| id | 이름 | 종류 | 작성자 | 등록일 | 검색 노출 180일 |
|----|------|------|--------|--------|----:|
| `best-presentation-export` | best-presentation-export | skill | 현진우 | 2026-04-16 | 145 |
| `expo-app-design` | Expo App Design | skill | 현진우 | 2026-02-24 | 135 |
| `openclaw-deploy-agent` | OpenClaw 배포 에이전트 (Deploy Agent) | skill | 현진우 | 2026-02-26 | 117 |
| `portone-payment-link` | 포트원 결제 링크 생성 | skill | 최하영 | 2026-01-27 | 101 |
| `marketing-content-anthropic` | 마케팅 콘텐츠 크리에이터 (Anthropic) | skill | 현진우 | 2026-02-24 | 95 |
| `zoom-survey-sync` | zoom-survey-sync | skill | 현진우 | 2026-04-16 | 89 |
| `scientific-poster` | 학술 포스터 생성 (Scientific Poster) | skill | 현진우 | 2026-03-05 | 88 |
| `free-tool-strategy` | 무료 도구 전략 (Engineering as Marketing) | skill | 현진우 | 2026-03-05 | 87 |
| `schema-markup` | 스키마 마크업 | skill | 현진우 | 2026-03-05 | 86 |
| `qa-answer` | qa-answer | skill | 현진우 | 2026-04-16 | 77 |
| `app-store-optimization` | 앱스토어 최적화 (ASO) | skill | 현진우 | 2026-03-05 | 76 |
| `mp4-to-gif` | mp4-to-gif | skill | 최하영 | 2026-03-11 | 72 |
| `kipris-mcp-installer` | KIPRIS MCP Installer | skill | 김태현 | 2026-04-04 | 72 |
| `build-check-hook` | Build Check Hook | hook | 현진우 | 2026-01-06 | 72 |
| `literature-review` | 문헌 리뷰 (Literature Review) | skill | 현진우 | 2026-03-05 | 68 |
| `codex-vercel-deploy` | Vercel Deploy | skill | 현진우 | 2026-03-09 | 65 |
| `dev-docs-reminder-hook` | Dev Docs Reminder Hook | hook | 현진우 | 2026-01-06 | 60 |
| `prose-writing` | 산문 창작 | skill | 현진우 | 2026-02-24 | 58 |
| `codex-security-best-practices` | Security Best Practices | skill | 현진우 | 2026-03-09 | 53 |
| `book-factory` | 논픽션 도서 제작 파이프라인 (Non-Fiction Book Factory) | skill | 현진우 | 2026-03-05 | 52 |
| `content-research-writer` | 리서치 기반 콘텐츠 라이터 | skill | 현진우 | 2026-02-24 | 52 |
| `membership-extend` | membership-extend | skill | 현진우 | 2026-04-16 | 51 |
| `sales-call-prep-anthropic` | 세일즈 콜 준비 (Anthropic) | skill | 현진우 | 2026-02-24 | 51 |
| `monitor-setup` | 모니터링 설정 커맨드 | command | 현진우 | 2026-03-05 | 48 |
| `content-idea-generator` | 콘텐츠 아이디어 생성 | skill | 현진우 | 2026-03-05 | 47 |
| `positioning-basics` | 포지셔닝 기본 | skill | 현진우 | 2026-03-05 | 46 |
| `slo-implement` | SLO 구현 가이드 | command | 현진우 | 2026-03-05 | 46 |
| `qmd` | QMD | skill | 김태현 | 2026-03-26 | 44 |
| `codex-slides` | PowerPoint Slides Creator | skill | 현진우 | 2026-03-09 | 44 |
| `codex-sora` | Sora Video Generator | skill | 현진우 | 2026-03-09 | 42 |
| `marketing-ideas` | 마케팅 아이디어 (SaaS 140+) | skill | 현진우 | 2026-03-05 | 41 |
| `codex-doc` | Word Document Creator | skill | 현진우 | 2026-03-09 | 41 |
| `churn-prevention` | 이탈 방지 (Churn Prevention) | skill | 현진우 | 2026-03-05 | 40 |
| `openclaw-healthcheck` | OpenClaw 호스트 보안 점검 | skill | 현진우 | 2026-02-26 | 38 |
| `jira-administrator` | Jira 관리자 | skill | 현진우 | 2026-03-05 | 38 |
| `agile-product-owner` | 애자일 프로덕트 오너 | skill | 현진우 | 2026-03-05 | 38 |
| `story-critique` | 스토리 비평 | skill | 현진우 | 2026-02-24 | 37 |
| `firebase-apk-scanner` | Firebase APK 스캐너 | skill | 현진우 | 2026-03-05 | 37 |
| `product-marketing-context` | 프로덕트 마케팅 컨텍스트 | skill | 현진우 | 2026-03-05 | 36 |
| `openclaw-docker-essentials` | OpenClaw Docker 필수 명령어 | skill | 현진우 | 2026-02-26 | 36 |
| `slides` | slides | skill | 김태현 | 2026-03-31 | 35 |
| `launch-strategy` | 런치 전략 | skill | 현진우 | 2026-03-05 | 34 |
| `docx-creator` | Word 문서 생성/편집/분석 | skill | 현진우 | 2026-02-26 | 34 |
| `social-media-analyzer` | 소셜 미디어 분석 | skill | 현진우 | 2026-02-24 | 34 |
| `constant-time-analysis` | 상수 시간 분석 (Constant-Time Analysis) | skill | 현진우 | 2026-03-05 | 33 |
| `marketing-principles` | 마케팅 원칙 | skill | 현진우 | 2026-03-05 | 32 |
| `prometheus-promql` | Prometheus PromQL 생성기 | skill | 현진우 | 2026-03-05 | 32 |
| `vercel-react-best-practices` | Vercel React Best Practices | skill | 현진우 | 2026-01-28 | 32 |
| `kubernetes-debugger` | Kubernetes 디버거 | skill | 현진우 | 2026-03-05 | 31 |
| `gdpr-compliance` | GDPR/DSGVO 컴플라이언스 | skill | 현진우 | 2026-03-05 | 31 |
| `go-mode` | Go 모드 (실행 모드) | skill | 현진우 | 2026-03-05 | 31 |
| `pm-toolkit` | PM 종합 툴킷 | skill | 현진우 | 2026-02-24 | 31 |
| `owasp-security` | 취약한 기본값 탐지 (Insecure Defaults Detection) | skill | 현진우 | 2026-03-05 | 30 |
| `meeting-insights-analyzer` | 회의 인사이트 분석기 | skill | 현진우 | 2026-02-24 | 30 |
| `prepare-release` | 릴리스 준비 커맨드 | command | 현진우 | 2026-03-05 | 30 |
| `docker-optimize` | Docker 최적화 커맨드 | command | 현진우 | 2026-03-05 | 29 |
| `neon-postgres` | Neon Postgres | skill | 현진우 | 2026-02-09 | 29 |
| `brand-guidelines` | 브랜드 가이드라인 스타일링 | guide | 현진우 | 2026-02-24 | 29 |
| `confluence-manager` | Confluence 매니저 | skill | 현진우 | 2026-03-05 | 28 |
| `discovery-process` | 디스커버리 프로세스 | skill | 현진우 | 2026-02-24 | 28 |
| `codex-security-threat-model` | Security Threat Model | skill | 현진우 | 2026-03-09 | 28 |
| `insecure-defaults` | Insecure Defaults 탐지 | skill | 현진우 | 2026-02-26 | 28 |
| `dockerfile-generator` | Dockerfile 생성기 | skill | 현진우 | 2026-03-05 | 28 |
| `proto-persona` | 프로토 페르소나 | skill | 현진우 | 2026-02-24 | 27 |
| `customer-success-manager` | 고객 성공 매니저 | skill | 현진우 | 2026-03-05 | 26 |
| `k8s-manifest` | Kubernetes 매니페스트 생성기 | command | 현진우 | 2026-03-05 | 25 |
| `codex-spreadsheet` | Spreadsheet Processor | skill | 현진우 | 2026-03-09 | 25 |
| `user-research-anthropic` | 사용자 리서치 종합 (Anthropic) | skill | 현진우 | 2026-02-24 | 24 |
| `makefile-generator` | Makefile 생성기 | skill | 현진우 | 2026-03-05 | 24 |
| `risk-management` | 리스크 관리 전문가 | skill | 현진우 | 2026-03-05 | 22 |
| `testimonial-collector` | 추천 사례 수집 | skill | 현진우 | 2026-03-05 | 22 |
| `prd-pm-skills` | PRD 작성 (PM-Skills) | skill | 현진우 | 2026-02-24 | 22 |
| `variant-analysis` | 변이 분석 | skill | 현진우 | 2026-02-24 | 21 |
| `email-marketing-expert` | 이메일 마케팅 전문가 | skill | 현진우 | 2026-02-24 | 21 |
| `create-docx` | Word 문서 생성 | skill | 현진우 | 2026-02-24 | 21 |
| `openclaw-cicd-pipeline` | OpenClaw CI/CD 파이프라인 (GitHub Actions) | skill | 현진우 | 2026-02-26 | 21 |
| `feature-spec-anthropic` | 기능 스펙/PRD 작성 (Anthropic) | skill | 현진우 | 2026-02-24 | 21 |
| `helm-chart-generator` | Helm 차트 생성기 | skill | 현진우 | 2026-03-05 | 20 |
| `python-fastapi-best-practices` | Python FastAPI Best Practices | guide | 현진우 | 2026-02-24 | 20 |
| `ansible-generator` | Ansible 플레이북 생성기 | skill | 현진우 | 2026-03-05 | 19 |
| `create-xlsx` | Excel 스프레드시트 생성 | skill | 현진우 | 2026-02-24 | 19 |
| `xlsx-processor` | Excel 스프레드시트 작업 | skill | 현진우 | 2026-02-26 | 19 |
| `subagent-driven-development` | Subagent-Driven Development | skill | 현진우 | 2026-02-09 | 19 |
| `codex-figma-implement-design` | Figma Design Implementation | skill | 현진우 | 2026-03-09 | 19 |
| `codex-gh-fix-ci` | GitHub CI Fix | skill | 현진우 | 2026-03-09 | 18 |
| `ost-pm-skills` | 기회 솔루션 트리 (PM-Skills) | skill | 현진우 | 2026-02-24 | 18 |
| `openclaw-conventional-commits` | OpenClaw Conventional Commits 가이드 | skill | 현진우 | 2026-02-26 | 18 |
| `diverse-content-gen` | 다양성 콘텐츠 생성기 | skill | 현진우 | 2026-02-24 | 17 |
| `sharp-edges` | 위험한 API/설정 탐지 (Sharp Edges) | skill | 현진우 | 2026-02-26 | 17 |
| `pricing-strategy` | 가격 전략 | skill | 현진우 | 2026-02-24 | 17 |
| `feature-investment-analysis` | 기능 투자 분석 어드바이저 | skill | 현진우 | 2026-02-24 | 17 |
| `senior-project-manager` | 시니어 프로젝트 매니저 | skill | 현진우 | 2026-02-24 | 17 |
| `product-strategy-session` | 제품 전략 세션 | skill | 현진우 | 2026-02-24 | 16 |
| `gstack-plan-eng-review` | gstack / plan-eng-review | skill | 김태현 | 2026-03-19 | 16 |
| `brainstorming-capture` | 브레인스토밍 캡처 | skill | 현진우 | 2026-02-24 | 15 |
| `property-based-testing` | 프로퍼티 기반 테스트 | guide | 현진우 | 2026-02-24 | 14 |
| `codex-notion-spec-to-implementation` | Notion Spec to Implementation | skill | 현진우 | 2026-03-09 | 14 |
| `semgrep-rule-creator` | Semgrep 규칙 생성기 | skill | 현진우 | 2026-03-05 | 14 |
| `positioning-statement` | 포지셔닝 스테이트먼트 | skill | 현진우 | 2026-02-24 | 13 |
| `cold-email-master` | 콜드 이메일 마스터 | skill | 현진우 | 2026-02-24 | 13 |
| `product-strategist` | 제품 전략가 | skill | 현진우 | 2026-02-24 | 13 |
| `gstack-codex` | gstack / codex | skill | 김태현 | 2026-03-19 | 13 |
| `tailwind-v4-shadcn` | Tailwind v4 + shadcn/ui | skill | 현진우 | 2026-02-09 | 12 |
| `prompt-guard` | prompt-guard | skill | 현진우 | 2026-04-16 | 12 |
| `competitive-battlecard-anthropic` | 경쟁 인텔리전스 배틀카드 (Anthropic) | skill | 현진우 | 2026-02-24 | 12 |
| `social-card-generator` | 소셜 카드 생성 | skill | 현진우 | 2026-03-05 | 12 |
| `openclaw-bastion` | openclaw-bastion | skill | 현진우 | 2026-04-16 | 11 |
| `clawdbot-security-check` | clawdbot-self-security-audit | skill | 현진우 | 2026-04-16 | 10 |
| `last-30-days-research` | 최근 30일 트렌드 리서치 | skill | 현진우 | 2026-03-05 | 10 |
| `codex-netlify-deploy` | Netlify Deploy Guide | skill | 현진우 | 2026-03-09 | 10 |
| `codex-openai-docs` | OpenAI Documentation Guide | skill | 현진우 | 2026-03-09 | 9 |
| `static-analysis` | 정적 분석 (CodeQL/Semgrep/SARIF) | skill | 현진우 | 2026-02-26 | 9 |
| `ceo-advisor` | CEO 어드바이저 | skill | 현진우 | 2026-02-24 | 9 |
| `gstack-qa-only` | gstack / qa-only | skill | 김태현 | 2026-03-19 | 8 |
| `shadcn-ui` | shadcn/ui | skill | 현진우 | 2026-02-09 | 8 |
| `cto-advisor` | CTO 어드바이저 | skill | 현진우 | 2026-03-05 | 8 |
| `gstack-browse` | gstack / browse | skill | 김태현 | 2026-03-19 | 7 |
| `gstack-plan-design-review` | gstack / plan-design-review | skill | 김태현 | 2026-03-19 | 7 |
| `codex-aspnet-core` | ASP.NET Core Development | skill | 현진우 | 2026-03-09 | 7 |
| `voice-extractor` | 브랜드 보이스 추출 | skill | 현진우 | 2026-03-05 | 7 |
| `gstack-freeze` | gstack / freeze | skill | 김태현 | 2026-03-19 | 7 |
| `gstack-design-review` | gstack / design-review | skill | 김태현 | 2026-03-19 | 6 |
| `codex-security-ownership-map` | Security Ownership Map | skill | 현진우 | 2026-03-09 | 6 |
| `codex-chatgpt-apps` | ChatGPT Apps Builder | skill | 현진우 | 2026-03-09 | 6 |
| `terraform-generator` | Terraform 모듈 생성기 | skill | 현진우 | 2026-03-05 | 6 |
| `gstack` | gstack | skill | 김태현 | 2026-03-19 | 6 |
| `gstack-unfreeze` | gstack / unfreeze | skill | 김태현 | 2026-03-19 | 6 |
| `changelog-generator` | 체인지로그 생성기 | skill | 현진우 | 2026-02-24 | 5 |
| `codex-render-deploy` | Render Deploy Guide | skill | 현진우 | 2026-03-09 | 4 |
| `hypothesis-definition` | 가설 정의 | skill | 현진우 | 2026-02-24 | 4 |
| `vercel-composition-patterns` | Vercel Composition Patterns | skill | 현진우 | 2026-02-09 | 4 |
| `gstack-ship` | gstack / ship | skill | 김태현 | 2026-03-19 | 4 |
| `scrum-master` | 스크럼 마스터 | skill | 현진우 | 2026-02-24 | 4 |
| `user-story-pm-skills` | 유저 스토리 생성 | skill | 현진우 | 2026-02-24 | 4 |
| `ask-questions-if-underspecified` | 요구사항 불명확 시 질문 강제 | skill | 현진우 | 2026-02-26 | 4 |
| `gstack-guard` | gstack / guard | skill | 김태현 | 2026-03-19 | 3 |
| `vision-press-release` | 비전 프레스 릴리스 | skill | 현진우 | 2026-02-24 | 3 |
| `codex-jupyter-notebook` | Jupyter Notebook Creator | skill | 현진우 | 2026-03-09 | 2 |
| `plan-my-day` | 하루 계획 설계 | skill | 현진우 | 2026-03-05 | 2 |
| `openclaw-gh-issues` | OpenClaw GitHub 이슈 자동 수정 | skill | 현진우 | 2026-02-26 | 2 |
| `semgrep-security-scan` | Semgrep 보안 스캔 | skill | 현진우 | 2026-02-24 | 2 |
| `gstack-document-release` | gstack / document-release | skill | 김태현 | 2026-03-19 | 2 |
| `react-composition-patterns` | React Composition Patterns | skill | 현진우 | 2026-01-28 | 2 |
| `campaign-analytics` | 캠페인 애널리틱스 | skill | 현진우 | 2026-02-24 | 2 |
| `gstack-design-consultation` | gstack / design-consultation | skill | 김태현 | 2026-03-19 | 1 |
| `defuddle-parse` | Defuddle Parse | skill | 김태현 | 2026-03-16 | 1 |

</details>

## 참고

- 사용 기록 1,837건 중 20건은 사용자 ID가 비어 있습니다. 8/3과 8/11에 `aitk` CLI로 들어온 호출입니다. 로그인은 된 상태였습니다. 횟수에는 들어가므로 후보 고르기에는 영향이 없습니다.
- 이 숫자는 aitk로 불러온 기록만 셉니다. Claude Code 플러그인으로 미리 설치했거나 로컬에 복사해 둔 스킬은 써도 기록이 남지 않습니다. B 목록은 작성자 확인을 받고 정리합니다.
- AX 대시보드 "정리 후보" 패널(`packages/lib/src/features/ax/unused-skills.ts`)도 비슷한 기준으로 셉니다. 다른 점은 여섯 가지입니다. 기간 없이 전체 기록을 봅니다. 등록 후 30일이 안 된 것만 뺍니다. 중복 묶음에 걸린 스킬은 뺍니다. 화면에는 25개까지만 보여 줍니다. 스킬만 봅니다(이 문서는 커맨드·가이드·훅·에이전트도 셈). 스킬 사용 기록(`skill_events`)만 셉니다.
- 조회는 운영 DB 읽기 전용 세션에서 SELECT로만 했습니다.
