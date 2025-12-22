---
name: Vercel 배포 기초
description: GitHub 연동부터 자동 배포까지, Vercel로 웹사이트 배포하는 완전 가이드
author: gpters-team
tags: [deployment, vercel, beginner, setup]
difficulty: easy
estimatedTime: 10분
---

# Vercel 배포 기초

GitHub 저장소를 Vercel에 연결하여 자동 배포를 설정하는 방법을 알아봅니다.

## 준비물

- GitHub 계정
- 배포할 프로젝트 (Next.js, React, Vue 등)

---

## 1단계: Vercel 가입

1. [Vercel](https://vercel.com) 접속
2. **Sign Up** 클릭
3. **Continue with GitHub** 선택
4. GitHub 계정 연동 승인

---

## 2단계: 프로젝트 가져오기

1. Vercel 대시보드에서 **Add New...** → **Project** 클릭
2. **Import Git Repository** 섹션에서 저장소 선택
3. 저장소가 안 보이면 **Adjust GitHub App Permissions** 클릭

---

## 3단계: 프로젝트 설정

### 기본 설정

- **Project Name**: 프로젝트 이름 (URL에 사용됨)
- **Framework Preset**: 자동 감지됨 (Next.js, Create React App 등)
- **Root Directory**: 모노레포인 경우 하위 폴더 지정

### 환경 변수

```
NEXT_PUBLIC_API_URL=https://api.example.com
DATABASE_URL=postgresql://...
```

중요: `NEXT_PUBLIC_` 접두사가 있어야 클라이언트에서 접근 가능

---

## 4단계: 배포

1. **Deploy** 버튼 클릭
2. 빌드 로그 확인 (보통 1-3분 소요)
3. 배포 완료 시 URL 제공: `https://your-project.vercel.app`

---

## 자동 배포 이해하기

### Production 배포
- `main` 또는 `master` 브랜치에 푸시하면 자동 배포

### Preview 배포
- 다른 브랜치에 푸시하면 Preview URL 생성
- PR을 열면 자동으로 Preview 링크가 코멘트됨

```
✅ Preview: https://your-project-git-feature-branch.vercel.app
```

---

## 유용한 설정

### 빌드 명령어 커스터마이징

```json
// vercel.json
{
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install"
}
```

### 리다이렉트 설정

```json
// vercel.json
{
  "redirects": [
    { "source": "/old-page", "destination": "/new-page", "permanent": true }
  ]
}
```

### 환경별 변수

- **Production**: 실제 운영 환경
- **Preview**: PR/브랜치 미리보기
- **Development**: 로컬 개발 (`vercel env pull`)

---

## 문제 해결

### 빌드 실패

1. 로컬에서 `npm run build` 성공하는지 확인
2. Node.js 버전 확인 (Settings → General)
3. 환경 변수 누락 확인

### 404 에러

Next.js의 경우 `next.config.js` 확인:

```javascript
module.exports = {
  trailingSlash: true, // 필요시
}
```

---

## 다음 단계

- [도메인 연결하기](/guides/domain-setup)
- [환경 변수 관리](/guides/env-variables)
