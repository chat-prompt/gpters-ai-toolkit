---
name: 환경 변수 관리 기초
description: API 키, 시크릿 등 민감한 정보를 안전하게 관리하는 방법
author: gpters-team
tags: [setup, infrastructure, beginner]
difficulty: medium
estimatedTime: 15분
---

# 환경 변수 관리 기초

API 키, 데이터베이스 비밀번호 등 민감한 정보를 코드에 노출하지 않고 안전하게 관리하는 방법입니다.

## 환경 변수란?

환경 변수는 애플리케이션 외부에서 설정값을 주입하는 방법입니다.

**하지 말아야 할 것:**

```javascript
// ❌ 절대 이렇게 하지 마세요!
const apiKey = "sk-1234567890abcdef"
```

**올바른 방법:**

```javascript
// ✅ 환경 변수 사용
const apiKey = process.env.API_KEY
```

---

## 로컬 개발 환경 설정

### 1단계: .env 파일 생성

프로젝트 루트에 `.env.local` 파일 생성:

```bash
# .env.local
DATABASE_URL=postgresql://localhost:5432/mydb
API_KEY=your-api-key-here
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 2단계: .gitignore에 추가

```bash
# .gitignore
.env
.env.local
.env*.local
```

**중요**: `.env` 파일은 절대 Git에 커밋하면 안 됩니다!

### 3단계: 예제 파일 생성

팀원들을 위해 `.env.example` 파일을 만들어 커밋하세요:

```bash
# .env.example
DATABASE_URL=postgresql://localhost:5432/mydb
API_KEY=your-api-key-here
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## Next.js 환경 변수

### 클라이언트 vs 서버

```bash
# 서버에서만 접근 가능 (API 키 등 민감 정보)
API_SECRET=secret-value

# 클라이언트에서도 접근 가능 (NEXT_PUBLIC_ 접두사)
NEXT_PUBLIC_API_URL=https://api.example.com
```

### 사용 방법

```javascript
// 서버 컴포넌트 / API Route
const secret = process.env.API_SECRET

// 클라이언트 컴포넌트
const apiUrl = process.env.NEXT_PUBLIC_API_URL
```

---

## Vercel 환경 변수 설정

### 대시보드에서 설정

1. 프로젝트 → **Settings** → **Environment Variables**
2. Key/Value 입력
3. 환경 선택:
   - **Production**: 실제 운영
   - **Preview**: PR/브랜치 미리보기
   - **Development**: 로컬 개발

### CLI로 설정

```bash
# Vercel CLI 설치
npm i -g vercel

# 환경 변수 추가
vercel env add API_KEY

# 로컬로 환경 변수 가져오기
vercel env pull .env.local
```

---

## 환경별 다른 값 사용

```bash
# .env.development
NEXT_PUBLIC_API_URL=http://localhost:8080

# .env.production
NEXT_PUBLIC_API_URL=https://api.example.com
```

Next.js 우선순위:
1. `.env.local` (최우선)
2. `.env.development` 또는 `.env.production`
3. `.env`

---

## 보안 체크리스트

- [ ] `.env` 파일이 `.gitignore`에 있는지 확인
- [ ] API 키가 `NEXT_PUBLIC_` 없이 설정되어 있는지 확인
- [ ] 프로덕션 환경 변수와 개발 환경 변수가 분리되어 있는지 확인
- [ ] 팀원용 `.env.example` 파일이 있는지 확인

---

## 실수로 커밋했을 때

1. **즉시 키 재발급**: 노출된 API 키는 무효화하고 새로 발급
2. **Git 히스토리에서 제거**:

```bash
# BFG Repo-Cleaner 사용
bfg --delete-files .env
git push --force
```

3. **GitHub Secret Scanning**: GitHub에서 자동으로 감지하면 알림이 옴

---

## 다음 단계

- [Vercel 배포 가이드](/guides/vercel-deploy)
- [Supabase 시작하기](/guides/supabase-quickstart)
