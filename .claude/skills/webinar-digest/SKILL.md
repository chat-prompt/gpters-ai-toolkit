---
name: webinar-digest
description: 유튜브 웨비나/강의 영상을 단일 HTML "따라하기 가이드"로 요약하고 Vercel에 배포하는 스킬. yt-dlp로 자막+영상 다운, ffmpeg로 1분 단위 프레임 추출 + Chrome 주소창 크롭, 사용자와 챕터/프레임 선정 대화, 템플릿 기반 index.html 생성, Vercel 배포. Triggers "웨비나 요약", "영상 따라하기 가이드", "유튜브 요약 HTML", "/webinar-digest", "webinar summary"
license: MIT
version: "1.0.0"
---

# webinar-digest

유튜브 웨비나 1개를 단일 HTML 가이드로 변환, Vercel 배포까지 자동화.

## 언제 쓰는가

- 지피터스/HOC 웨비나 요약본을 만들 때
- 교육/튜토리얼 영상을 "따라하기 가이드"로 재구성할 때
- 세션당 1개 HTML 페이지 + 12장 프레임이 필요할 때

**이 스킬 아닌 것**:
- 단순 자막 발췌만 필요하면, yt-dlp 직접 사용
- 영상 자체를 자르고 자막 박는 편집은, 별도 영상 편집 스킬 사용

## 산출물

- **`public/index.html`** — 단일 HTML 페이지 (Step 1~N 따라하기 가이드)
- **`public/frames/01_xxx.jpg ~ 12_xxx.jpg`** — 1080p 크롭된 키 프레임
- **Vercel URL** — 배포 완료 후 즉시 공유 가능

## 선결 조건

- `yt-dlp` (Homebrew 최신 버전 권장)
- `ffmpeg` 6.0+
- `vercel` CLI (로그인 완료)
- Chrome 브라우저 (쿠키 추출용)
- macOS 권장 (다른 OS도 동작하지만 setup.sh의 yt-dlp 경로 조정 필요)

```bash
brew install yt-dlp ffmpeg
npm i -g vercel
```

## 실행 워크플로우 (7 Phases)

### Phase 1. 입력 받기 (G1 게이트)

사용자에게 확인:
- **YouTube URL** (필수)
- **프로젝트 이름** (영문 kebab-case. 예: `konan-multi-agent-summary`)
- **주요 인물 이름 정규화**: 자막에 오타로 나올 수 있는 고유명사 (발표자, 제품명). 없어도 됨
- **배포**: Vercel 배포할지 (yes/no)

### Phase 2. 자막 + 비디오 다운로드 (자동)

```bash
bash .claude/skills/webinar-digest/scripts/setup.sh <YOUTUBE_URL> <WORKDIR>
```

- `WORKDIR=~/Desktop/yt-<video_id>` 형태로 작업 폴더 생성
- yt-dlp cookies-from-browser chrome으로 자막 + 1080p 영상 다운로드
- 실패 시 사용자에게 수동 다운로드 요청

### Phase 3. 자막 정규화 (자동)

```bash
python3 .claude/skills/webinar-digest/scripts/clean-srt.py <SRT>
```

- 프로그레시브 프레임 중복 제거 (YouTube 자동자막 특성)
- 고유명사 사전(`DEFAULT_GLOSSARY`)으로 오타 교정. 추가 사전은 `--glossary <JSON>` 옵션으로
- 결과: `<video_id>.ko.clean.normalized.txt`

### Phase 4. 프레임 추출 + 크롭 (자동)

```bash
bash .claude/skills/webinar-digest/scripts/extract-frames.sh <WORKDIR>
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
- **Step 제목은 존댓말/명사형 통일**
- Step 2~N-1: 주요 내용 (각각 슬라이드 프레임 + 설명)
- Step N: 결론 (언제 뭘 쓸지 / 추천)

### Phase 6. HTML 생성 (자동)

본인 템플릿 프로젝트(또는 처음이라면 새 디렉토리)에 콘텐츠 작성:

```bash
mkdir -p <PROJECT_NAME>/public/frames
cd <PROJECT_NAME>
# 선정된 12장을 01_, 02_, ... 라벨링해서 public/frames/에 복사
# public/index.html을 Step 1~N 구조로 작성
```

**HTML 필수 요소**:
- 헤더: 제목 + 발표자 + 원본 YouTube 링크 + 시간
- Step 1~N: 각각 `what` 박스 + 프레임 + 설명 + `tip`/`warn`/`ref`
- `.star` 한 줄 요약
- 풋터: 자동 생성 날짜

**작성 원칙**:
- **존댓말 통일** — narrator 문장 끝은 "~습니다/~합니다"
- **직접 인용**은 `.quote` 태그 안에 원문 그대로
- Chrome 주소창 체크: 프레임에 `file://` 경로 노출 없는지 확인
- 발표자 실명 노출 금지, 공개 무대명만 사용

### Phase 7. Vercel 배포 (G5 게이트)

```bash
bash .claude/skills/webinar-digest/scripts/deploy.sh <PROJECT_DIR> [ALIAS_NAME]
```

- 본인 Vercel 계정으로 배포
- 배포 후 짧은 alias 설정 (`<project-name>.vercel.app`)
- 최종 URL 사용자에게 전달

## 중요 원칙

1. **G1 게이트 없이 Phase 2 실행 금지** — URL + 프로젝트 이름 확인 필수
2. **G2 게이트 없이 Phase 6 실행 금지** — 챕터 구조 + 프레임 선정 사용자 승인
3. **존댓말 일관성** — narrator 문장은 모두 존댓말. 직접 인용만 반말 허용
4. **Chrome 주소창 크롭 필수** — 상단 150px 크롭으로 `file://` 경로 숨기기
5. **발표자 실명 보호** — 공개 무대명/닉네임만 사용
6. **원문 MECE 검증** — 배포 전 주요 챕터 빠진 거 없는지 사용자와 점검
7. **메타 서술 금지** — "발표자는 일반인입니다" 같은 가르치는 톤 X. 발표자 배경은 헤더 서브타이틀에 1줄로

## 트리거 프롬프트 패턴

### 🅐 간결

```
/webinar-digest https://youtube.com/watch?v=XXXX
```

### 🅑 구조화

```
/webinar-digest
URL: https://youtube.com/watch?v=XXXX
프로젝트 이름: konan-multi-agent-summary
발표자 실명, 공개명: 한준구, 코난쌤
배포: yes
```

### 🅒 자연어

> "이 웨비나 요약 HTML 만들어서 Vercel 올려줘 — https://youtube.com/watch?v=XXXX"

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

- 원본 1728×1080, 크롭 1728×930 (상단 150px 제거)
- Chrome 탭 + 주소창 + 북마크 바까지 제거
- 슬라이드/터미널/메신저 모두 동일하게 적용

### 자막 정규화 사전 (기본)

YouTube 자동자막 흔한 오타 (`clean-srt.py` DEFAULT_GLOSSARY에 포함):
- Claude 관련: 클러드/클로드 → Claude
- OAuth: 오어스/오스/오스터큰 → OAuth
- Anthropic: 엔트로픽 → Anthropic
- Tailscale: 테일스케일 → Tailscale
- 발표마다 고유명사 사전 추가는 `--glossary <JSON>` 옵션으로

## 완성 사례 참고

- 호트만님 OpenClaw 슬랙 풀세팅: https://bots-raising-bots.vercel.app
- 코난쌤 멀티 에이전트: https://openclaw-webinar-summary.vercel.app
- 지아코모님 Hermes: https://hermes-webinar-summary.vercel.app

## 파일 구조

```
webinar-digest/
├── SKILL.md              ← 이 파일
└── scripts/
    ├── setup.sh          ← yt-dlp 자막+영상 다운
    ├── clean-srt.py      ← 프로그레시브 자막 중복 제거 + 고유명사 교정
    ├── extract-frames.sh ← ffmpeg 1분 프레임 + Chrome 크롭
    └── deploy.sh         ← Vercel --prod 배포 + alias 설정
```
