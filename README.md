# Company AI Toolkit

사내 Claude 스킬, 에이전트, 프롬프트를 공유하는 저장소입니다.

## 구조

```
company-ai-toolkit/
├── skills/          # Claude Code 스킬
├── agents/          # 서브에이전트 정의
├── prompts/         # 재사용 프롬프트
├── docs/            # 문서
└── examples/        # 사용 예시
```

## 빠른 시작

1. 저장소 클론
```bash
git clone https://github.com/company/company-ai-toolkit.git
```

2. 스킬 설치
```bash
cp -r skills/원하는스킬 ~/.claude/skills/
```

3. 사용
```
Claude Code에서 /스킬이름 으로 실행
```

## 문서

- [시작 가이드](docs/getting-started.md)
- [기여 가이드](docs/contribution-guide.md)
- [스킬/에이전트 카탈로그](docs/catalog.md)

## 가이드

바이브코더를 위한 실용 가이드입니다.

| 가이드 | 설명 | 난이도 | 소요 시간 |
|--------|------|--------|-----------|
| [Vercel 배포 기초](guides/vercel-deploy/) | GitHub 연동부터 자동 배포까지 | 쉬움 | 10분 |
| [GPTers 이미지 CDN 사용하기](guides/image-cdn-setup/) | 이미지 업로드 및 CDN URL 사용법 | 쉬움 | 5분 |
| [GitHub 기초 사용법](guides/github-basics/) | 저장소 생성, 커밋, 푸시 기본 워크플로우 | 쉬움 | 20분 |
| [커스텀 도메인 연결하기](guides/domain-setup/) | Vercel, Netlify 등에 도메인 연결 | 쉬움 | 20분 |
| [환경 변수 관리 기초](guides/env-variables/) | API 키, 시크릿 등 안전하게 관리 | 보통 | 15분 |
| [Supabase 빠른 시작](guides/supabase-quickstart/) | 데이터베이스와 인증 10분 만에 설정 | 보통 | 15분 |

## 기여하기

새로운 스킬이나 에이전트를 만드셨나요? PR을 보내주세요!

1. `skills/_template` 또는 `agents/_template`을 복사
2. 내용 작성
3. PR 생성

자세한 내용은 [기여 가이드](docs/contribution-guide.md)를 참고하세요.
