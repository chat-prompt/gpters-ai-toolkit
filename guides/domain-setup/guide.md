---
name: 커스텀 도메인 연결하기
description: 구매한 도메인을 Vercel, Netlify 등에 연결하는 방법
author: gpters-team
tags: [domain, setup, infrastructure]
difficulty: easy
estimatedTime: 20분
---

# 커스텀 도메인 연결하기

`your-project.vercel.app` 대신 `yourdomain.com`으로 접속할 수 있도록 설정합니다.

## 준비물

- 구매한 도메인 (가비아, Namecheap, Cloudflare 등)
- 배포된 프로젝트 (Vercel, Netlify 등)

---

## 도메인 구매처 추천

| 서비스 | 특징 | 가격대 |
|--------|------|--------|
| **Cloudflare** | 원가 판매, DNS 무료 | .com $10/년 |
| **Namecheap** | 저렴, 무료 WhoisGuard | .com $12/년 |
| **가비아** | 한국 서비스, 한글 지원 | .com 15,000원/년 |

---

## Vercel에 도메인 연결하기

### 1단계: 도메인 추가

1. Vercel 프로젝트 → **Settings** → **Domains**
2. 도메인 입력 (예: `yourdomain.com`)
3. **Add** 클릭

### 2단계: DNS 설정

Vercel이 두 가지 옵션을 제시합니다:

**옵션 A: A 레코드 (권장)**

```
Type: A
Name: @
Value: 76.76.21.21
```

**옵션 B: CNAME 레코드**

```
Type: CNAME
Name: @
Value: cname.vercel-dns.com
```

### 3단계: www 서브도메인

```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

---

## Cloudflare DNS 설정 예시

1. Cloudflare 대시보드 → 도메인 선택 → **DNS**
2. **Add record** 클릭

```
Type: A
Name: @
IPv4: 76.76.21.21
Proxy status: DNS only (회색 구름)
```

**중요**: Vercel 사용 시 Proxy를 끄세요 (회색 구름)

---

## SSL 인증서

### Vercel
- 자동으로 Let's Encrypt SSL 발급
- 별도 설정 불필요

### Cloudflare 사용 시
- **SSL/TLS** → **Full (strict)** 선택
- Vercel의 SSL과 Cloudflare SSL 모두 활성화

---

## DNS 전파 확인

DNS 변경 후 전파에 최대 48시간 소요될 수 있습니다.

### 확인 방법

```bash
# 터미널에서
dig yourdomain.com

# 또는 온라인 도구
# https://dnschecker.org
```

---

## 서브도메인 설정

여러 프로젝트를 서브도메인으로 연결할 수 있습니다:

```
app.yourdomain.com → 메인 앱
api.yourdomain.com → API 서버
docs.yourdomain.com → 문서 사이트
```

각 서브도메인에 대해 CNAME 레코드 추가:

```
Type: CNAME
Name: app
Value: cname.vercel-dns.com
```

---

## 문제 해결

### "Invalid Configuration" 에러

1. DNS 레코드가 올바른지 확인
2. Cloudflare Proxy 비활성화 확인
3. 24시간 대기 후 재시도

### SSL 인증서 에러

1. DNS가 완전히 전파되었는지 확인
2. Vercel에서 도메인 삭제 후 재추가
3. Cloudflare 사용 시 SSL 모드 확인

---

## 다음 단계

- [환경 변수 관리](/guides/env-variables)
- [Vercel 배포 가이드](/guides/vercel-deploy)
