---
name: Supabase 빠른 시작
description: Supabase로 데이터베이스와 인증을 10분 만에 설정하기
author: gpters-team
tags: [database, auth, setup, infrastructure]
difficulty: medium
estimatedTime: 15분
---

# Supabase 빠른 시작

Firebase의 오픈소스 대안인 Supabase로 백엔드를 빠르게 구축하는 방법입니다.

## Supabase란?

- **PostgreSQL 데이터베이스**: 강력한 관계형 DB
- **인증**: 이메일, 소셜 로그인 내장
- **실시간**: 실시간 구독 지원
- **Storage**: 파일 저장소
- **Edge Functions**: 서버리스 함수

---

## 1단계: 프로젝트 생성

1. [Supabase](https://supabase.com) 접속
2. **Start your project** 클릭
3. GitHub로 로그인
4. **New Project** 클릭
5. 프로젝트 이름, 비밀번호 설정
6. 리전 선택 (Northeast Asia - Tokyo 권장)

---

## 2단계: 테이블 생성

### SQL Editor 사용

**SQL Editor** 메뉴에서:

```sql
-- 사용자 프로필 테이블
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  username TEXT UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 정책: 자신의 프로필만 조회/수정 가능
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

### Table Editor 사용

또는 **Table Editor**에서 GUI로 테이블을 만들 수 있습니다.

---

## 3단계: Next.js 연동

### 패키지 설치

```bash
npm install @supabase/supabase-js
```

### 환경 변수 설정

`.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

값은 Supabase 대시보드 → Settings → API에서 확인

### 클라이언트 생성

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

---

## 4단계: 데이터 CRUD

### 조회 (Read)

```typescript
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId)
  .single()
```

### 생성 (Create)

```typescript
const { data, error } = await supabase
  .from('profiles')
  .insert({ username: 'johndoe', avatar_url: '...' })
```

### 수정 (Update)

```typescript
const { data, error } = await supabase
  .from('profiles')
  .update({ username: 'newname' })
  .eq('id', userId)
```

### 삭제 (Delete)

```typescript
const { error } = await supabase
  .from('profiles')
  .delete()
  .eq('id', userId)
```

---

## 5단계: 인증 설정

### 이메일 로그인

```typescript
// 회원가입
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123'
})

// 로그인
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})

// 로그아웃
await supabase.auth.signOut()
```

### 소셜 로그인 (Google)

1. Supabase 대시보드 → Authentication → Providers
2. Google 활성화
3. Google Cloud Console에서 OAuth 설정

```typescript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google'
})
```

---

## 6단계: 현재 사용자 확인

```typescript
// 현재 로그인한 사용자
const { data: { user } } = await supabase.auth.getUser()

// 세션 변경 감지
supabase.auth.onAuthStateChange((event, session) => {
  console.log(event, session)
})
```

---

## Row Level Security (RLS)

Supabase의 핵심 보안 기능입니다.

```sql
-- 예: 게시글은 작성자만 수정 가능
CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = user_id);

-- 예: 게시글은 누구나 조회 가능
CREATE POLICY "Anyone can view posts"
  ON posts FOR SELECT
  USING (true);
```

**중요**: RLS를 활성화하지 않으면 누구나 모든 데이터에 접근할 수 있습니다!

---

## 무료 플랜 한도

- 500MB 데이터베이스
- 1GB 파일 스토리지
- 50,000 월간 활성 사용자
- 500,000 Edge Function 호출

---

## 다음 단계

- [환경 변수 관리](/guides/env-variables)
- [Vercel 배포 가이드](/guides/vercel-deploy)
