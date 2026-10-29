# 스킬 설명에 빠진 제약 채우기 (2026-10-26)

Linear [DEV-4733](https://linear.app/geniefy/issue/DEV-4733). 로컬 복사본 aitk2 DB(127.0.0.1:5433 `aitk2`)에서만 바꿨습니다. 운영 DB는 건드리지 않았습니다.

## 왜 했나

AI는 검색 결과에서 id, 이름, 설명, 태그만 보고 스킬을 불러올지 정합니다. 본문은 불러온 뒤에야 읽습니다. [DEV-4727](https://linear.app/geniefy/issue/DEV-4727) 테스트에서 불러온 75건 중 36건이 본문을 읽고 나서 "안 쓴다"로 바뀌었습니다. 그중 상당수는 본문에만 적힌 제약 때문이었습니다. 예를 들어 영어 글 기준 규칙이거나, 특정 API 키와 다른 스킬이 있어야 돌아가는 경우입니다. 이런 제약이 설명에 있으면 불러오기 전에 걸러집니다.

## 한 일

1. 게시 항목 361개를 AI 8개가 나눠 읽고 설명과 본문을 대조했습니다. 본문은 12,000자까지 봤습니다. 불러올지 말지가 바뀔 만한 것만 표시하게 했습니다. 110개가 표시됐습니다.
2. 110개를 Codex가 본문과 다시 대조했습니다. 39개는 맞다, 52개는 일부만 맞다, 19개는 틀리다고 봤습니다. 덧붙일 문구가 남은 91개를 고쳤습니다.
3. Codex가 반대한 19개 중 언어 제약 4개(`humanizer`, `humanize-docs`, `stop-slop`, `creative-copywriting`)는 직접 써 봤습니다. AI 티를 일부러 12개 심은 한국어 글 한 편에 각 스킬만 적용했습니다. 이모지, 과장, 나열 같은 공통 패턴은 잡았지만 접속어 뒤 쉼표, "~에 있어서" 같은 한국어 말투는 규칙에 없어 놓쳤습니다. 스킬 없이 고친 쪽은 12개를 다 잡았습니다. 그래서 "영어 글 기준이라 한국어에는 일부만 적용"으로 고쳤습니다.
4. 나머지 15개는 그대로 뒀습니다. 이미 설명에 있거나 본문에 그런 제한이 없다는 Codex 의견에 근거가 있었습니다.

고친 설명은 원래 설명 뒤에 "제약·준비물: …"을 붙인 모양입니다. 고친 95개는 이름+설명+태그로 임베딩을 다시 만들었습니다(`text-embedding-3-large`, 3072차원). 고치기 전 설명과 임베딩은 같은 DB의 `description_backup_4733` 테이블에 있습니다.

| 빠졌던 것 | 개수 |
|---|---:|
| 필요한 키·연결·다른 스킬 | 63 |
| 특정 대상 전용 | 22 |
| 실행 환경 | 20 |
| 하는 일이 설명과 다름 | 12 |
| 언어 | 7 |

한 스킬에 여러 개가 걸릴 수 있어 합이 95보다 큽니다.

## 효과

DEV-4727과 같은 검색 결과 목록(재민 실제 검색 115개)에서 설명만 바꿔 다시 고르게 했습니다.

| | 고치기 전 | 고친 뒤 |
|---|---:|---:|
| 불러옴 | 51 | 40 |
| 본문 읽고 버림 | 22 | 12 |
| 맞는 스킬을 실제로 씀 | 28 | 28 |
| 맞는 게 없을 때 건너뜀 (97개 중) | 90 | 94 |

맞는 스킬을 안 부르게 된 4건은 모두 고치기 전에도 본문을 읽고 버린 스킬이었습니다.

한계:

- "맞는 스킬"은 AI가 본문 앞 800자까지 보고 매긴 점수입니다.
- 고르는 쪽도 AI(서브에이전트)입니다.
- 한 사람의 검색 기록입니다.
- 이번 비교에는 DEV-4724 설명 채우기도 섞여 있습니다.

## 운영 반영

아직 하지 않았습니다. 스킬마다 작성자가 있으니 반영 방법은 따로 정합니다.

## 바꾼 목록

설명 끝에 붙인 문구만 적었습니다. 원래 설명은 그대로 두고 뒤에 이어 붙였습니다.

| id | 빠졌던 것 | 붙인 문구 |
|---|---|---|
| `account-merge` | 특정 대상 전용 | 지피터스 포털·Bettermode 계정 통합용. |
| `add-schedule` | 필요한 것 | Airtable·GPTers API 설정과 번들 스크립트·기수 운영정보 필요, 로컬 경로 조정 필요. |
| `ai-edu-proposal` | 특정 대상 전용 | GPTers 회사명·주황색·푸터를 고정한 제안 페이지. |
| `ai-study-free-invite` | 필요한 것 | airtable-sdk·gpters-sender 및 Airtable·GPTers 관리자 토큰 필요, 무료참여는 관리자 요청·발송 승인 필요. |
| `ai-talk-manager` | 필요한 것 | bettermode-sdk 및 Zoom·Bitly·Airtable 접근 필요, 배경 이미지는 URL 또는 생성 스킬 사용. |
| `aitalk-notify` | 실행 환경, 필요한 것 | dahtmad 로컬 경로·.env, Airtable 키·GPTers 토큰·gpters-sender 필요. |
| `ax-frontier-survey-analysis` | 특정 대상 전용 | 사번·지정 열 구조·지식/기술/적용 태그를 갖춘 설문 CSV 기준. |
| `b2b-proposal` | 특정 대상 전용, 필요한 것 | GPTers 오픈클로 교육용, GoClaw 작업공간의 커리큘럼 자료 필요. |
| `bbojjak-column-to-thread` | 특정 대상 전용 | Threads는 뽀짝이 1인칭·냥체 필수. |
| `bbojjak-column-writer` | 실행 환경, 필요한 것 | 커버 생성은 codex CLI 로그인 필요(없으면 생략), 자동 발행은 지정 Astro 구조 기준. |
| `bbopters-instatoon-onboarding` | 필요한 것 | ChatGPT 로그인된 Codex CLI·Python3 필요. |
| `bettermode-field-sync` | 실행 환경, 필요한 것 | 별도 vibe-study-application 스크립트·Airtable/Bettermode 인증 필요, 로컬 경로 조정 필요. |
| `bettermode-sdk` | 특정 대상 전용, 하는 일이 다름 | GPTers 프록시 연동용; 포스트·커스텀 필드 값 조작 중심이며 테이블 스키마 변경 절차는 없음. |
| `billing-invoice-download` | 특정 대상 전용, 필요한 것, 하는 일이 다름 | 현재 Airtable만 지원, 지정 팀 Drive 폴더·사용자 경로 사용; Chrome 브라우저 도구 연결·로그인 필요. |
| `buddy-register` | 필요한 것 | airtable-sdk·gpters-sender와 Airtable·GPTers API 키 필요, 로컬 .env 경로 조정 필요. |
| `build-agents` | 특정 대상 전용 | 기존 .claude/agents/analyze-context.md·distribute.md 참조 전제. |
| `builderio-visual-plan` | 필요한 것 | 기본은 Plan MCP 연결 필요·미연결 시 중단, 로컬 요청 시 MDX 모드 지원. |
| `ccpm` | 필요한 것 | CCPM /pm 명령과 .claude/commands/pm·agents 환경 전제. |
| `channeltalk-cs` | 필요한 것, 하는 일이 다름 | 현재 Slack 알림 감지 방식(웹훅 미구현), 팀 로컬 .env·정책 문서·지정 Slack 채널 전제. |
| `codex-notion-meeting-intelligence` | 하는 일이 다름 | 실제 용도는 회의 전 안건·사전 읽기 자료 준비. |
| `content-keyword-pipeline` | 실행 환경, 특정 대상 전용 | 소연 로컬 work 프로젝트·venv 및 GPTers GSC·Mixpanel 3354240 설정 기준. |
| `coupon-issue` | 특정 대상 전용, 필요한 것 | GPTers 포털 쿠폰용, airtable-sdk·gpters-sender와 Airtable·GPTers 토큰 필요. |
| `create-issue` | 특정 대상 전용 | 지정 Education 팀·Todo 상태 ID로 강제 생성. |
| `creative-copywriting` | 언어 | 예시·파워워드·참고 데이터가 영어 SNS 기준이라 한국어 카피에는 구조만 참고. |
| `crm-cohort` | 특정 대상 전용 | 내장 Mixpanel 인증·지정 이벤트 체계 기준, 사용자 정보 조회는 선택. |
| `de-ai-ify` | 언어 | 영어 표현·가독성 점수 기준 중심, 한국어 적용 시 조정 필요. |
| `deep-research-workflow` | 언어, 필요한 것 | 주제별 fields.yaml·전용 validate_json.py 필요, JSON 필드 값은 영어. |
| `employee-offboarding` | 실행 환경 | Aside 브라우저와 해당 조직 관리자 로그인 필요. |
| `enrollment-open-notice` | 특정 대상 전용, 필요한 것 | GPTers AI스터디용, dahtmad 로컬 airtable-sdk·gpters-sender·.env 및 Slack 승인 필요. |
| `g-init` | 필요한 것 | g-10x 필수; 반복 개선형은 shared 가이드, 기존 항목 수정은 보존 스크립트 필요. |
| `g-proj` | 필요한 것 | g-10x 필수, 수정 시 저장소 보존 스크립트·반복 개선형은 shared 지침 필요. |
| `geo-weekly` | 필요한 것, 하는 일이 다름 | 자동 답변 측정은 Gemini·Claude API 중심; API 키·비공개 crawl-checker 권한 필요, Claude 격주 측정 약 7달러. |
| `gpters-daily-content` | 필요한 것 | 글쓰기는 gpters-post 사용, GSC 등 성과 설정 없으면 discover/measure 생략·Mixpanel MCP 폴백 지원. |
| `gpters-daily-content-v2` | 특정 대상 전용, 필요한 것 | gpters 로컬 자원·검색 API 연동 필요, 자동 발행은 SDK·발행 명의 필요; 강지인 작성자 소개·지인 승인 적용. |
| `gpters-landing-dropoff` | 필요한 것 | 실제 섹션 매핑 시 gstack browse 바이너리 필요. |
| `gpters-namecard` | 실행 환경 | macOS Google Chrome·ghostscript·Python qrcode/opencv/Playwright 필요. |
| `gpters-newsletter` | 필요한 것 | 작업 레포의 v2 빌더·템플릿 필요, CDN 업로드는 키 필요; 스티비는 HTML 수동 붙여넣기 경로 안내. |
| `gpters-newsletter-v2` | 필요한 것 | 외부 newsletter-builder·공용 지침 필요, API 업로드는 별도 키 필요(수동 업로드 가능). |
| `gpters-revenue-query` | 필요한 것, 하는 일이 다름 | 포트원 직접 호출 금지, GPTers Internal API 관리자 키(PAYMENT_READ·ORDER_READ)로 조회. |
| `gstack-qa` | 필요한 것 | gstack browse로 QA하며 버그 수정별 커밋 생성. |
| `gstack-setup-browser-cookies` | 필요한 것, 하는 일이 다름 | 실브라우저 쿠키를 gstack 헤드리스 세션으로 가져오기; browse 바이너리 필요, 첫 실행 시 키체인 허용 가능. |
| `handoff-verify` | 필요한 것 | Claude Agent 툴과 Codex CLI(gpt-5.6-terra) 동시 실행 환경 필요. |
| `humanize-docs` | 언어 | 영어 글 기준 규칙이라 한국어 글에는 이모지·과장·나열 같은 공통 패턴만 적용되고, 한국어 특유의 말투는 다루지 않음. |
| `humanizer` | 언어 | 영어 글 기준 규칙이라 한국어 글에는 이모지·과장·나열 같은 공통 패턴만 적용되고, 한국어 특유의 말투는 다루지 않음. |
| `hwp-form-autofill` | 실행 환경 | 로컬 한컴 한글 설치 필요. |
| `image-cdn-setup` | 필요한 것 | 업로드는 GPTers 팀 발급 프로젝트 API 키 필요, 조회는 무인증. |
| `inbound-factory` | 특정 대상 전용, 필요한 것 | B2B AI 교육 인바운드용, aitk 로그인 필요. |
| `leader-selection-notice` | 필요한 것 | dahtmad 로컬 airtable-sdk·gpters-sender·.env와 지정 Airtable·Slack 승인 환경 필요. |
| `leader-self-enroll` | 필요한 것 | airtable-sdk·gpters-sender와 Airtable 키·GPTers 관리자 토큰 필요. |
| `learn-faster-kit` | 필요한 것 | uv/uvx로 외부 learn-faster 도구 실행·Claude 명령 설치. |
| `linear-mcp-check` | 하는 일이 다름 | 도구 미검출 시 기존 Linear MCP 제거 후 linear-mcp-plus로 교체. |
| `linear-mcp-fast` | 실행 환경 | macOS·Linear 데스크톱 앱 필요. |
| `linear-update-init` | 필요한 것 | LINEAR_API_TOKEN·scripts/linear_api.py로 Linear 직접 등록. |
| `lms-plaza-banner` | 필요한 것 | dahtmad 로컬 .env·airtable-sdk 절대경로 기반 실행. |
| `meeting-archive` | 실행 환경, 특정 대상 전용 | message의 Slack 스레드 읽기 호출 전제, chat-prompt/shared-team-docs에 원문·요약 push. |
| `meeting-prep` | 필요한 것 | bambf/ 구조의 Obsidian 볼트 기반, 참가자 웹 리서치 절차 없음. |
| `memory-tiering` | 실행 환경 | MEMORY.md·memory/hot·memory/warm·날짜별 일일 로그 구조 기준. |
| `modusign-auto-send` | 특정 대상 전용 | GPTers 스터디장 감사료·강의료 템플릿 및 지정 CSV 형식 대상. |
| `modusign-contract-sender` | 필요한 것 | /tmp/modusign-full.js 실행 파일·모두싸인 로그인 설정 필요, 템플릿 변경 가능. |
| `modusign-study-contract` | 실행 환경, 필요한 것 | OpenClaw 공용 레포·Node/Playwright·Airtable 키·모두싸인 계정 필요, 이체시트는 gog 인증 필요. |
| `newsletter-web-publish` | 필요한 것 | bun·bbopters-shared의 bettermode-sdk/config.json·별도 전달받은 Bettermode 크레덴셜 필요. |
| `openchat-violation-audit` | 실행 환경 | macOS 카카오톡 DB·kakaocli와 bbopters-shared 레포 필요. |
| `openclaw-lesson` | 실행 환경, 특정 대상 전용 | 뽀짝이 연재 백로그·GPTers AX LAB 대상, OpenClaw sessions_send 필요. |
| `openclaw-pr-reviewer` | 필요한 것, 하는 일이 다름 | Go·Python·JS/TS 정규식·린트 검사, 인증된 gh CLI·python3 필요. |
| `openclaw-sec` | 필요한 것 | openclaw-sec CLI 또는 패키지 필요, 자동 보호에는 훅 설치. |
| `ot-slide-generator` | 필요한 것 | support@gpters.org로 인증된 gws·Slides API 활성화·지정 Airtable/공유 드라이브 접근 필요. |
| `prioritization-advisor` | 하는 일이 다름 | 백로그 직접 순위 산출보다 프레임워크 선택·도입 가이드에 사용. |
| `proposal-factory` | 필요한 것 | aitk 인증 실패 시 중단, ERP·메일 연결 없으면 확인필요 표시·자료 직접 입력으로 대체. |
| `qna-publish` | 특정 대상 전용, 필요한 것 | bbojjak-viewer·닿/타타 승인 및 로컬 경로·Slack 전제, 이메일 알림 시 Airtable·gpters-sender 필요. |
| `quote-generator` | 실행 환경 | 로컬 /Users/yeonkwon/견적서/template.xlsx 확보 필요. |
| `reddit-insights` | 언어, 필요한 것 | reddit-insights.com API 키·MCP 서버 필요, 비영어 질의는 검색 품질이 낮음. |
| `refund-processor` | 필요한 것 | Airtable MCP·gpters-sender 설치와 환불·문자 권한 토큰 필요. |
| `requesting-code-review` | 실행 환경 | delegate_task(category, load_skills) 호출 기준, 다른 하네스는 조정 필요. |
| `shorts-maker` | 필요한 것, 하는 일이 다름 | 자막 번인된 16:9 원본용, 자막·TTS·BGM 생성 없음; remotion-best-practices 함께 참조. |
| `skill-health-check` | 특정 대상 전용 | bbopters-shared 스킬 대상, 환경변수 확인용 워크스페이스는 지정 가능. |
| `slack-local` | 필요한 것 | slack-local CLI 필요, 미설치 시 비공개 저장소 접근 필요. |
| `stibee-report` | 필요한 것 | 오픈·클릭 통계는 대시보드 로그인·브라우저 자동화 필요, 주소록·경로는 사용자 설정으로 변경. |
| `stop-slop` | 언어 | 영어 글 기준 규칙이라 한국어 글에는 이모지·과장·나열 같은 공통 패턴만 적용되고, 한국어 특유의 말투는 다루지 않음. |
| `study-close` | 필요한 것 | 관련 SDK·발송 스킬과 Airtable·GPTers·Bettermode·Zoom 인증, 로컬 실행 환경 필요. |
| `study-day-swap` | 필요한 것 | dahtmad 로컬 airtable-sdk·bettermode-sdk와 지정 Airtable base 접근 전제. |
| `study-detail-page` | 필요한 것, 하는 일이 다름 | vibe-ai-study 레포·Bun 필요, 기본 21기 구성으로 Airtable 업로드·포털 캐시 갱신까지 수행. |
| `thumbnail-generator` | 실행 환경, 필요한 것 | dahtmad 로컬 썸네일 프로젝트·bettermode-sdk·airtable-sdk 의존, 이식 시 경로 조정 필요. |
| `timetable-making` | 필요한 것 | Node와 플러그인 루트의 generate.js·Chromium 설치 필요. |
| `update-proj` | 필요한 것 | 활성 Cycle 조회·프로젝트 업데이트 생성 기능을 갖춘 Linear MCP 필요. |
| `update-proj-v2` | 필요한 것 | 조회용 Linear MCP와 직접 등록용 LINEAR_API_TOKEN 사용. |
| `vercel-deploy-claimable` | 실행 환경 | 무인증 claim 배포는 claude.ai용 스크립트 기준, 다른 환경은 표준 Vercel CLI 안내. |
| `vibe-study-application` | 실행 환경 | bun과 /Users/yeonkwon/vibe-study-application의 Airtable 스크립트 전제. |
| `vtt-parser` | 필요한 것 | Drive 다운로드는 gog CLI·지정 GPTers 계정 기준, 로컬 VTT는 직접 파싱 가능. |
| `youtube-insight-short` | 필요한 것 | yt-dlp 다운로드·단어 단위 원문 타임스탬프 필요, Scribe 헬퍼는 선택. |
| `youtube-summarizer` | 실행 환경, 필요한 것 | /root/clawd 경로의 MCP 자막 서버·저장 경로 필요, Telegram 전송은 해당 채널에서만. |
| `zoom-attendance-sync` | 실행 환경, 필요한 것 | OpenClaw 로컬 래퍼·macOS LaunchAgent 구성, Zoom·Airtable 인증 필요. |
| `zoom-gateway` | 특정 대상 전용 | 지피터스 포털 StudyCalendar 게이트웨이 관리용. |
| `zoom-gateway-meeting` | 필요한 것 | dahtmad 로컬 .env·add-schedule 스크립트 필요, 캘린더 등록 시 gws 사용. |
| `zoom-meeting` | 특정 대상 전용, 필요한 것 | Airtable 확정 스터디 리스트의 기수 전체 대상, Zoom OAuth·스터디장 Pro 이상 계정 필요. |
| `zoom-survey-pipeline` | 필요한 것 | bbopters-shared의 두 .env와 gpters-sender 로컬 발송 스크립트 사용. |

## 고치지 않은 15개

두 번째 대조에서 Codex가 반대해 그대로 둔 것입니다. 언어 제약 4개는 따로 시험해 고쳤으므로 여기서 뺐습니다.

| id | 그대로 둔 이유 |
|---|---|
| `api-key-permission-guide` | Internal API 권한 추천이라는 범위는 description과 internal-api 태그에 이미 명시되어 있다. 제공된 본문에는 GPTers라는 식별자가 없고 일반적인 개발팀 발급 요청만 있어 GPTers 전용이라는 추가 단정을 입증하지 못한다. |
| `ax-post` | 직원의 사내 AX 사례글이라는 대상과 gpters 태그가 이미 있다. 고정 묶음 링크·태그는 해당 지피터스 사례글 작성의 세부 규칙으로 추가 로딩 제약이라고 보기 어렵다. 또한 본문은 초안 전달까지 진행하며 업무 적용이 없는 글에는 고정 태그를 붙이지 않는 예외도 둔다. |
| `bbojjak-voice` | 외부 문체 가이드를 매번 읽는 것은 사실이지만 기존 설명에 이미 룰=plain-writing-style-guide.md라고 명시되어 있다. 파일의 홈 디렉터리 경로를 덧붙이는 것은 위치 안내이며 새로운 스킬 선택 조건이 아니다. |
| `codex-imagegen` | OPENAI_API_KEY는 실제 API 호출에 필요하지만 이름·설명·태그가 이미 OpenAI Image API 사용을 명시한다. 환경변수 이름은 인증 구현 정보로 선택 범위를 새롭게 바꾸지 않는다. 본문은 저렴한 모델 선택을 언급할 뿐 유료 과금 조건을 별도로 설명하지 않아 주장 전체를 새로운 누락으로 인정할 수 없다. |
| `codex-transcribe` | OPENAI_API_KEY 확인은 본문에 있지만 OpenAI 음성 인식 API를 쓴다는 점이 description에 이미 명시되어 있어 통상적인 API 인증 요건은 별도 선택 조건이 아니다. 본문은 유료 여부·요금 조건을 명시하지 않으므로 유료 API라는 추가 주장도 제공 자료만으로 확인할 수 없다. |
| `coding-agent` | PTY 지원 bash가 필요하다는 조건이 description에 이미 명시되어 있다. 본문의 bash·process 호출 형식은 그 실행 방법을 풀어쓴 것이며, Claude Code·Codex에서 도구를 대응시킬 수 없다는 절대적 불가 주장도 본문으로 입증되지 않는다. |
| `initiative-project-update` | tacticlaunch/mcp-linear 도구를 사용한 조회·수정 예시는 사실이다. 다만 본문은 그 구현에서만 템플릿 작성이 가능하다고 제한하지 않는다. Linear 기획서 작성·수정이라는 범위는 이미 설명에 있으며, 특정 MCP 공급자와 도구 이름은 실행 방법으로서 선택을 바꿀 독립적인 제한 근거가 부족하다. |
| `install-collector` | 본문에 npx @gpters-internal/layout-collector-mcp init 명령은 있지만 비공개 패키지·사내 인증·접근 권한 요구는 없다. npm 스코프 이름만으로 사내 패키지 접근 권한이 필요하다고 단정할 수 없다. |
| `memory-save` | workspace-bboya와 workspace-bbojjak은 메모리 위치 예시이고, 본문은 기타 에이전트도 각자 워크스페이스의 memory/를 사용하도록 한다. OpenClaw 필수 또는 두 봇 전용이라는 제한은 없으며, memory/와 MEMORY.md 기록 방식은 이미 설명에 있다. |
| `openclaw-coding-agent` | OpenClaw용이라는 환경은 id의 openclaw와 openclaw·moltbot 태그에 이미 드러난다. PTY·process·완료 알림 명령은 그 환경의 실행 방식이며, description만 따로 보고 환경이 숨겨졌다고 판정할 수 없다. |
| `openclaw-notion` | 통합 키를 로컬 파일에서 읽어 curl로 호출하는 방식은 본문에 있다. 그러나 기존 설명·API 태그가 이미 Notion API용 스킬임을 밝히며 MCP 사용을 약속하지 않는다. 키 저장 경로와 호출 도구는 이 API 사용법을 로드할지 바꾸는 별도 대상·범위 제한이 아니다. |
| `openclaw-summarize` | summarize CLI 설치 안내와 모델별 키 설정은 본문에 있지만, 기존 설명·태그에서 이미 CLI 도구와 AI 모델 연동을 밝힌다. 설치·인증은 통상적인 실행 준비이며 brew만 허용하는 환경 제한도 명시되지 않았다. --extract-only 추출에도 모델 API 키가 항상 필요하다는 근거는 없어 전체 작업의 필수 조건으로 추가할 수 없다. |
| `study-application-bettermode-publish` | GPTers용 Base·테이블·Space ID는 존재하지만 본문에서 변경 가능한 기본값으로 명시한다. 따라서 GPTers 전용이라는 제한은 성립하지 않으며, Airtable 지원서의 Bettermode 일괄 게시와 SDK 필수 조건은 기존 설명에 이미 있다. |
| `ui-ux-pro-max` | search.py와 CSV를 사용하는 것은 사실이지만 번들 검색 엔진의 구현·자산 구성이다. 기존 설명이 이미 BM25 검색 엔진임을 밝히며, 별도 외부 데이터나 특정 저장소만 요구한다고 하지 않는다. 모든 단계가 검색한다는 표현도 요구 분석·구현 단계까지 포함하면 부정확하다. 이 주장만으로 UI/UX 요청에서 로드 여부가 달라지지 않는다. |
| `update-init` | Linear MCP 호출 예시는 있지만 특정 구현만 사용 가능하다는 제한은 없다. Linear 하위 프로젝트 업데이트를 종합하는 업무는 기존 설명에 명확하며, 조회·등록 도구 이름은 실행 방법이다. 도구 이름이 다르다는 이유만으로 이 작성 가이드를 로드하지 않아야 할 근거는 부족하다. |
