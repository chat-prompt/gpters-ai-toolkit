---
name: webinar-digest
description: 유튜브 웨비나/강의 영상을 단일 HTML "따라하기 가이드"로 요약하고 Vercel에 배포하는 스킬. yt-dlp로 자막+영상 다운 → ffmpeg로 1분 단위 프레임 추출 + Chrome 주소창 크롭 → 사용자와 챕터/프레임 선정 대화 → openclaw-webinar-summary 템플릿 기반 index.html 생성 → Vercel 배포. 코난쌤/지아코모님 웨비나 스타일. Triggers "웨비나 요약", "영상 따라하기 가이드", "유튜브 요약 HTML", "/webinar-digest", "webinar summary"
---

# 🎬 webinar-digest

유튜브 웨비나 1개를 단일 HTML 가이드로 변환 → Vercel 배포까지 자동화.

## 언제 쓰는가

- 지피터스/HOC 웨비나 요약본을 만들 때
- 교육/튜토리얼 영상을 "따라하기 가이드"로 재구성할 때
- 세션당 1개 HTML 페이지 + 12장 프레임이 필요할 때

**이 스킬 아닌 것**:
- 다수 영상 → 3종 문서 + 비번 게이트가 필요하면 → `video-to-handover`
- 단순 자막 발췌만 필요하면 → yt-dlp 직접 사용

## 산출물

- **`public/index.html`** — 단일 HTML 페이지 (Step 1~N 따라하기 가이드)
- **`public/frames/01_xxx.jpg ~ 12_xxx.jpg`** — 1080p 크롭된 키 프레임
- **Vercel URL** — 배포 완료 후 즉시 공유 가능

## 실행 워크플로우 (7 Phases)

### Phase 1. 입력 받기 (G1 게이트)
사용자에게 확인:
- **YouTube URL** (필수)
- **프로젝트 이름** (영문 kebab-case. 예: `hermes-webinar-summary`)
- **주요 인물 이름 정규화**: 자막에 오타로 나올 수 있는 고유명사 (발표자, 제품명). 없어도 됨
- **배포**: Vercel 배포할지 (yes/no)

### Phase 2. 자막 + 비디오 다운로드 (자동)
```bash
bash ~/.claude/skills/webinar-digest/scripts/setup.sh <YOUTUBE_URL> <WORKDIR>
```
- `WORKDIR=~/Desktop/yt-<video_id>` 형태로 작업 폴더 생성
- yt-dlp cookies-from-browser chrome으로 자막 + 1080p 영상 다운로드
- 최신 yt-dlp 경로 사용 (Homebrew Cellar 버전 우선)
- 실패 시 사용자에게 수동 다운로드 요청

### Phase 3. 자막 정규화 (자동 + 선택적 수동)
```bash
python3 ~/.claude/skills/webinar-digest/scripts/clean-srt.py <SRT>
```
- 프로그레시브 프레임 중복 제거 (YouTube 자동자막 특성)
- 사용자가 제공한 고유명사 사전으로 오타 교정 (optional)
- 결과: `<video_id>.ko.clean.normalized.txt`

### Phase 4. 프레임 추출 + 크롭 (자동)
```bash
bash ~/.claude/skills/webinar-digest/scripts/extract-frames.sh <WORKDIR>
```
- 1080p 영상에서 1분 단위로 프레임 추출
- **Chrome 탭+주소창 제거 위해 상단 150px 크롭** (1728×1080 → 1728×930)
- 결과: `screenshots/t_NNN.jpg` (NNN = 분)

### Phase 5. 사용자와 챕터/프레임 선정 (G2 게이트)
Claude가:
1. 정규화된 전사본 전체 읽기
2. **10~13개 Step 챕터 초안** 제시
3. 각 Step마다 **대표 프레임 1장 추천** (총 12장)
4. 사용자 OK 받기 전 HTML 작성 금지

**Step 구조 가이드**:
- **Step 1은 반드시 실질적 내용부터 시작** (설치 환경, 첫 개념, 첫 단계 등)
- 발표자 소개는 **헤더 바로 아래 `.star` 박스 1개**로. 별도 Step으로 빼지 말 것
  - ✅ 추천 포맷: "누구? + 직업/전공 + 입문 시점 + 현재 운영 상태 + 실제 적용 분야 + 본인 스타일" 5~6개 불릿
  - ❌ 금지: "발표자는 일반인이다" 식의 메타 서술/가르치는 톤 (사용자가 "개우식" 소리함)
- **Step 제목도 존댓말/명사형 통일**: "이거부터 확인" ❌ → "여기부터 확인하세요" ✅ / "얘들이 왜 똑똑해지나" ❌ → "에이전트가 똑똑해지는 원리" ✅
- Step 2~N-1: 주요 내용 (각각 슬라이드 프레임 + 설명)
- Step N: 결론 (언제 뭘 쓸지 / 추천)

### Phase 6. HTML 생성 (자동)
이 스킬에 **번들된 템플릿**(`template/index.html`)을 복제 후 내용 교체:
```bash
# 이 스킬 폴더의 template/ 을 새 프로젝트로 복사
#   (로컬 설치 시 스킬 경로: ~/.claude/skills/webinar-digest)
SKILL_DIR="$(dirname "$0")/.."   # 또는 스킬이 설치된 경로
PROJECT=~/webinar-projects/<PROJECT_NAME>
mkdir -p "$PROJECT/public/frames"
cp "$SKILL_DIR/template/index.html" "$PROJECT/public/index.html"
cd "$PROJECT"
# 선정된 12장을 01_, 02_, ... 라벨링해서 public/frames/ 에 복사
# public/index.html의 {{PLACEHOLDER}}를 실제 내용으로 교체 (Step 1~N 구조)
```
> 템플릿은 CSS 디자인 시스템 + 컴포넌트 샘플(.what/.frame/.terminal/.chat/table/.flow/.tip/.warn/.ref/.quote/.star)이 들어있는 골격이다. `{{ }}` 플레이스홀더만 채우면 된다.

**HTML 필수 요소**:
- 헤더: 제목 + 발표자 + 원본 YouTube 링크 + 시간
- Step 1~N: 각각 `what` 박스 + 프레임 + 설명 + `tip`/`warn`/`ref`
- `.star` 한 줄 요약
- 풋터: 자동 생성 날짜

**작성 원칙**:
- **존댓말 통일** — narrator 문장 끝은 "~습니다/~합니다"로
- **지아코모님 방식 인용**은 `.quote` 태그 안에 원문 그대로 (반말 허용)
- Chrome 주소창 체크: 프레임에 `file://` 경로 노출 없는지 확인
- 발표자 실명 노출 금지, 공개 무대명만 사용

### Phase 7. Vercel 배포 (G5 게이트, 선택)
```bash
cd ~/webinar-projects/<PROJECT_NAME>
vercel --prod --yes
vercel alias set <deployment-url> <project-name>.vercel.app
```
- 본인 Vercel 계정/팀으로 배포 (`vercel login` 선행)
- 배포 후 짧은 alias 설정 (`<project-name>.vercel.app`)
- 최종 URL 사용자에게 전달
- 배포 없이 로컬 `public/index.html`만 열어 확인해도 됨

## 중요 원칙

1. **G1 게이트 없이 Phase 2 실행 금지** — URL + 프로젝트 이름 확인 필수
2. **G2 게이트 없이 Phase 6 실행 금지** — 챕터 구조 + 프레임 선정 사용자 승인
3. **존댓말 일관성** — narrator 문장은 모두 존댓말. 직접 인용만 반말 허용
4. **Chrome 주소창 크롭 필수** — 상단 150px 크롭으로 `file://` 경로 숨기기
5. **발표자 실명 보호** — 공개 무대명/닉네임만 사용
6. **원문 MECE 검증** — 배포 전 주요 챕터 빠진 거 없는지 사용자와 점검
7. **반복 가능한 패턴** — openclaw-webinar-summary CSS/구조 그대로 재활용
8. **메타 서술 금지** — "발표자는 일반인입니다" 같은 가르치는 톤/서두 절대 X. 발표자 배경은 헤더 서브타이틀에 1줄로

## 파일 구조

```
webinar-digest/
├── SKILL.md              ← 이 파일
├── template/
│   └── index.html        ← 번들 템플릿 (CSS 디자인 시스템 + 컴포넌트 샘플 + {{플레이스홀더}})
└── scripts/
    ├── setup.sh          ← yt-dlp 자막+영상 다운
    ├── clean-srt.py      ← 프로그레시브 자막 중복 제거
    ├── extract-frames.sh ← ffmpeg 1분 프레임 + 크롭
    └── deploy.sh         ← Vercel 배포 헬퍼
```

## 템플릿 참고

- **CSS/레이아웃 원본**: 이 스킬의 `template/index.html` (번들됨, 외부 의존 없음)
- **출력 스타일**: GitHub 다크/라이트 톤 + 단계별 Step 카드 + 터미널/메신저 시뮬레이션 + 프레임 캡처

## 트리거 프롬프트 패턴

### 🅐 간결
```
/webinar-digest https://youtube.com/watch?v=XXXX
```

### 🅑 구조화
```
/webinar-digest
URL: https://youtube.com/watch?v=XXXX
프로젝트 이름: my-webinar-summary
발표자 실명 → 공개명: (실명) → (공개 무대명/닉네임)
배포: yes
```

### 🅒 자연어
> "이 웨비나 요약 HTML 만들어서 Vercel 올려줘 — https://youtube.com/watch?v=XXXX"

## 선결 조건

- `yt-dlp` (Homebrew 최신 Cellar 버전 추천)
- `ffmpeg` 6.0+
- `vercel` CLI (로그인 완료)
- Chrome 브라우저 (쿠키 추출용)
- macOS Apple Silicon

## 방법론

### MECE 체크리스트 (배포 전 필수)
원문과 비교해 누락 없는지 확인:
1. 발표자 배경
2. 설치/사용 환경
3. 비용/구독 구조
4. 함정/주의사항
5. 주요 기능별 상세
6. 대안 비교
7. 실전 사례
8. 결론/추천

### 프레임 크롭 규칙
- 원본 1728×1080 → 크롭 1728×930 (상단 150px 제거)
- Chrome 탭 + 주소창 + 북마크 바까지 제거
- 슬라이드/터미널/메신저 모두 동일하게 적용

### 자막 정규화 사전 (공통)
YouTube 자동자막 흔한 오타:
- Claude 관련: 클러드/클로드/오스트 → Claude
- OAuth: 오어스/오스/오스터큰 → OAuth
- Anthropic: 엔트로픽 → Anthropic
- Tailscale: 테일스케일/테일스케일 → Tailscale
- 기타 발표마다 고유명사 사전 추가
