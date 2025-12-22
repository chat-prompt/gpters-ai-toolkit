---
name: 이미지 CDN 설정하기
description: Cloudflare Images, Imgix, Vercel 이미지 최적화 중 선택하여 설정하는 방법
author: gpters-team
tags: [image, cdn, setup, beginner]
difficulty: easy
estimatedTime: 15분
---

# 이미지 CDN 설정하기

웹사이트에서 이미지를 빠르고 효율적으로 제공하기 위한 CDN 설정 가이드입니다.

## 왜 이미지 CDN이 필요한가요?

- **빠른 로딩**: 전 세계 엣지 서버에서 이미지 제공
- **자동 최적화**: WebP, AVIF 등 최신 포맷으로 자동 변환
- **리사이징**: 다양한 디바이스에 맞는 크기로 자동 조절
- **비용 절감**: 대역폭 비용 절감

---

## 옵션 1: Cloudflare Images (추천)

가장 간단하고 저렴한 옵션입니다.

### 1단계: Cloudflare 계정 생성

1. [Cloudflare](https://dash.cloudflare.com/sign-up) 가입
2. 대시보드에서 **Images** 메뉴 클릭
3. **Get started** 클릭

### 2단계: 이미지 업로드

```bash
# API로 업로드
curl -X POST "https://api.cloudflare.com/client/v4/accounts/{account_id}/images/v1" \
  -H "Authorization: Bearer {api_token}" \
  -F file=@/path/to/image.jpg
```

또는 대시보드에서 직접 드래그 앤 드롭으로 업로드할 수 있습니다.

### 3단계: 이미지 사용

```html
<img src="https://imagedelivery.net/{account_hash}/{image_id}/public" />
```

### 가격

- 저장: $5/100,000 이미지
- 전송: $1/100,000 요청

---

## 옵션 2: Imgix

더 많은 기능이 필요할 때 사용합니다.

### 1단계: Imgix 가입

1. [Imgix](https://imgix.com) 가입
2. Source 생성 (이미지 저장소 연결)

### 2단계: 이미지 URL 사용

```html
<img src="https://your-source.imgix.net/image.jpg?w=800&auto=format" />
```

### 주요 파라미터

- `w`: 너비
- `h`: 높이
- `auto=format`: 자동 포맷 최적화
- `q`: 품질 (1-100)

---

## 옵션 3: Vercel 이미지 최적화

Next.js를 사용한다면 가장 간단한 옵션입니다.

### 사용 방법

```jsx
import Image from 'next/image'

export default function Page() {
  return (
    <Image
      src="/my-image.jpg"
      width={800}
      height={600}
      alt="My Image"
    />
  )
}
```

### 외부 이미지 사용

`next.config.js`에 도메인 추가:

```javascript
module.exports = {
  images: {
    domains: ['example.com', 'cdn.example.com'],
  },
}
```

### 가격

- Hobby: 무료 (월 1,000회 최적화)
- Pro: $20/월부터

---

## 어떤 것을 선택해야 하나요?

| 상황 | 추천 |
|------|------|
| Next.js 프로젝트 | Vercel 이미지 최적화 |
| 정적 사이트, 저예산 | Cloudflare Images |
| 고급 이미지 처리 필요 | Imgix |

---

## 다음 단계

- [Vercel 배포 가이드](/guides/vercel-deploy)
- [도메인 설정 가이드](/guides/domain-setup)
