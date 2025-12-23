# GPTers 가이드 웹사이트

바이브코더를 위한 실용 가이드를 제공하는 웹사이트입니다.

## 기술 스택

- **Next.js 15** - React 프레임워크
- **TypeScript** - 타입 안전성
- **Tailwind CSS** - 스타일링

## 시작하기

```bash
# 의존성 설치
pnpm install

# 개발 서버 실행
pnpm dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.

## 가이드 목록

| 가이드 | 설명 | 난이도 | 소요 시간 |
|--------|------|--------|-----------|
| [Vercel 배포 기초](/guides/vercel-deploy) | GitHub 연동부터 자동 배포까지 | 쉬움 | 10분 |
| [GPTers 이미지 CDN 사용하기](/guides/image-cdn-setup) | 이미지 업로드 및 CDN URL 사용법 | 쉬움 | 5분 |
| [GitHub 기초 사용법](/guides/github-basics) | 저장소 생성, 커밋, 푸시 기본 워크플로우 | 쉬움 | 20분 |
| [커스텀 도메인 연결하기](/guides/domain-setup) | Vercel, Netlify 등에 도메인 연결 | 쉬움 | 20분 |
| [환경 변수 관리 기초](/guides/env-variables) | API 키, 시크릿 등 안전하게 관리 | 보통 | 15분 |
| [Supabase 빠른 시작](/guides/supabase-quickstart) | 데이터베이스와 인증 10분 만에 설정 | 보통 | 15분 |

## 가이드 추가하기

1. `../guides/` 폴더에 새 가이드 폴더 생성
2. `guide.md` 파일 작성 (frontmatter 포함)
3. PR 생성

## 배포

Vercel에 자동 배포됩니다. `main` 브랜치에 push하면 자동으로 배포됩니다.
