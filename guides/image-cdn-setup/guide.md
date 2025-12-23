---
name: GPTers 이미지 CDN 사용하기
description: GPTers 이미지 CDN에 이미지를 업로드하고 사용하는 방법 (바이브코더용)
author: gpters-team
tags: [image, cdn, upload, beginner]
difficulty: easy
estimatedTime: 5분
---

# GPTers 이미지 CDN 사용하기

이미지를 업로드하고 CDN URL로 사용하는 방법입니다. 복잡한 설정 없이 바로 사용할 수 있습니다.

## 한눈에 보기

| 항목 | 값 |
|------|-----|
| API 엔드포인트 | `https://images.gpters.org` |
| 이미지 URL | `https://images.gpters.org/images/{key}` |
| 인증 | `X-API-Key` 헤더 (업로드 시 필요) |
| 지원 포맷 | JPEG, PNG, GIF, WebP, SVG, HEIC |
| 캐싱 | 1년 (immutable) |

---

## 사용 방법

### 1단계: 업로드 URL 받기

```javascript
const response = await fetch('https://images.gpters.org/upload-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'YOUR_API_KEY'  // 필수
  },
  body: JSON.stringify({
    filename: 'my-image.png',
    contentType: 'image/png',
    folder: 'my-project'  // 선택사항
  })
})

const { uploadUrl, imageUrl, key } = await response.json()
```

**응답 예시:**
```json
{
  "uploadUrl": "https://images.gpters.org/upload?key=my-project/m1abc123-xyz789-my-image.png",
  "imageUrl": "https://images.gpters.org/images/my-project/m1abc123-xyz789-my-image.png",
  "key": "my-project/m1abc123-xyz789-my-image.png"
}
```

### 2단계: 이미지 업로드

```javascript
await fetch(uploadUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'image/png',
    'X-API-Key': 'YOUR_API_KEY'  // 필수
  },
  body: file  // File 객체
})
```

### 3단계: 이미지 사용

```html
<!-- 이미지 조회는 인증 불필요 -->
<img src="https://images.gpters.org/images/my-project/m1abc123-xyz789-my-image.png" />
```

---

## 이미지 리사이징

업로드한 이미지를 URL 파라미터로 리사이징할 수 있습니다.

> **참고**: 리사이징 시 포맷을 지정하지 않으면 자동으로 WebP로 변환됩니다.

### 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| `w` | 너비 (1-4096px) | `w=300` |
| `h` | 높이 (1-4096px) | `h=200` |
| `fit` | 맞춤 모드 | `contain`, `cover`, `crop`, `scale-down` |
| `q` | 품질 (1-100) | `q=80` |
| `f` | 포맷 변환 | `webp`, `avif`, `jpeg`, `png` |

### 예시

```html
<!-- 원본 이미지 -->
<img src="https://images.gpters.org/images/photo.jpg" />

<!-- 300px 너비로 리사이징 (자동 WebP 변환) -->
<img src="https://images.gpters.org/images/photo.jpg?w=300" />

<!-- 200x200 썸네일 (cover) -->
<img src="https://images.gpters.org/images/photo.jpg?w=200&h=200&fit=cover" />

<!-- JPEG 포맷 유지 + 품질 80% -->
<img src="https://images.gpters.org/images/photo.jpg?w=400&f=jpeg&q=80" />
```

### 실제 이미지 비교

| 버전 | URL | 크기 |
|------|-----|------|
| 원본 (800x533) | [원본 보기](https://images.gpters.org/images/test/mjhze0fw-jpvh9q-mountain.jpg) | 72KB |
| w=200 | [리사이징](https://images.gpters.org/images/test/mjhze0fw-jpvh9q-mountain.jpg?w=200) | 5KB |
| 200x200 썸네일 | [썸네일](https://images.gpters.org/images/test/mjhze0fw-jpvh9q-mountain.jpg?w=200&h=200&fit=cover) | 6KB |
| w=400, q=50 | [품질 조정](https://images.gpters.org/images/test/mjhze0fw-jpvh9q-mountain.jpg?w=400&q=50) | 6KB |

---

## 복사해서 쓰는 코드

### React 컴포넌트

```jsx
const API_KEY = process.env.NEXT_PUBLIC_GPTERS_CDN_API_KEY

function ImageUploader() {
  const [imageUrl, setImageUrl] = useState(null)
  const [uploading, setUploading] = useState(false)

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setUploading(true)

    try {
      // 1. 업로드 URL 받기
      const urlResponse = await fetch(
        'https://images.gpters.org/upload-url',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY
          },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type
          })
        }
      )
      const { uploadUrl, imageUrl } = await urlResponse.json()

      // 2. 이미지 업로드
      await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-API-Key': API_KEY
        },
        body: file
      })

      // 3. 완료
      setImageUrl(imageUrl)
    } catch (error) {
      console.error('업로드 실패:', error)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={uploading}
      />
      {uploading && <p>업로드 중...</p>}
      {imageUrl && <img src={imageUrl} alt="Uploaded" />}
    </div>
  )
}
```

### 유틸리티 함수

```javascript
const CDN_URL = 'https://images.gpters.org'
const API_KEY = process.env.GPTERS_CDN_API_KEY

/**
 * 이미지를 GPTers CDN에 업로드합니다.
 * @param {File} file - 업로드할 이미지 파일
 * @param {string} folder - 폴더 경로 (선택)
 * @returns {Promise<string>} 업로드된 이미지 URL
 */
async function uploadImage(file, folder) {
  // 1. 업로드 URL 받기
  const urlResponse = await fetch(`${CDN_URL}/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      folder
    })
  })

  if (!urlResponse.ok) {
    throw new Error('업로드 URL 발급 실패')
  }

  const { uploadUrl, imageUrl } = await urlResponse.json()

  // 2. 이미지 업로드
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-API-Key': API_KEY
    },
    body: file
  })

  if (!uploadResponse.ok) {
    throw new Error('이미지 업로드 실패')
  }

  return imageUrl
}

/**
 * 이미지 URL에 리사이징 파라미터를 추가합니다.
 * @param {string} imageUrl - 원본 이미지 URL
 * @param {object} options - 리사이징 옵션
 * @returns {string} 리사이징된 이미지 URL
 */
function getResizedImageUrl(imageUrl, options = {}) {
  const params = new URLSearchParams()

  if (options.width) params.set('w', options.width)
  if (options.height) params.set('h', options.height)
  if (options.fit) params.set('fit', options.fit)
  if (options.quality) params.set('q', options.quality)
  if (options.format) params.set('f', options.format)

  const queryString = params.toString()
  return queryString ? `${imageUrl}?${queryString}` : imageUrl
}

// 사용 예시
const imageUrl = await uploadImage(file, 'avatars')
const thumbnail = getResizedImageUrl(imageUrl, { width: 200, height: 200, fit: 'cover' })
```

---

## 자주 묻는 질문

### Q: API Key는 어디서 받나요?

GPTers 팀에 문의하세요. 프로젝트별로 API Key가 발급됩니다.

### Q: 어떤 이미지 포맷을 지원하나요?

JPEG, PNG, GIF, WebP, SVG, HEIC를 지원합니다.

### Q: 업로드한 이미지는 얼마나 보관되나요?

영구 보관됩니다. 캐시는 1년간 유지됩니다.

### Q: 이미지 조회도 API Key가 필요한가요?

아니요. 이미지 조회(`GET /images/{key}`)는 인증 없이 가능합니다.

### Q: 리사이징은 원본에 영향을 주나요?

아니요. 원본은 그대로 유지되고, URL 파라미터에 따라 실시간으로 리사이징됩니다.

### Q: 리사이징하면 왜 WebP로 바뀌나요?

포맷을 지정하지 않으면 자동으로 WebP로 변환됩니다. 원본 포맷을 유지하려면 `f=jpeg` 또는 `f=png`를 명시하세요.

---

## API 레퍼런스

### POST /upload-url

업로드 URL을 발급받습니다. **인증 필요**

**헤더:**
- `Content-Type`: `application/json`
- `X-API-Key`: API 키 (필수)

**요청:**
```json
{
  "filename": "image.jpg",
  "contentType": "image/jpeg",
  "folder": "avatars"
}
```

| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `filename` | X | 파일명 (기본값: image) |
| `contentType` | X | MIME 타입 |
| `folder` | X | 폴더 경로 (예: `avatars`, `users/photos`) |

**응답:**
```json
{
  "uploadUrl": "https://images.gpters.org/upload?key=avatars/m1abc123-xyz789-image.jpg",
  "imageUrl": "https://images.gpters.org/images/avatars/m1abc123-xyz789-image.jpg",
  "key": "avatars/m1abc123-xyz789-image.jpg"
}
```

### POST /upload?key={key}

이미지를 업로드합니다. **인증 필요**

**헤더:**
- `Content-Type`: 이미지 MIME 타입 (image/png, image/jpeg 등)
- `X-API-Key`: API 키 (필수)

**바디:**
- 이미지 파일 바이너리

**응답:**
```json
{
  "success": true,
  "imageUrl": "https://images.gpters.org/images/avatars/m1abc123-xyz789-image.jpg",
  "key": "avatars/m1abc123-xyz789-image.jpg"
}
```

### GET /images/{key}

이미지를 반환합니다. **인증 불필요**

쿼리 파라미터로 리사이징을 지원합니다.

**리사이징 파라미터:**

| 파라미터 | 설명 | 값 |
|---------|------|-----|
| `w` | 너비 | 1-4096 |
| `h` | 높이 | 1-4096 |
| `fit` | 맞춤 모드 | `contain`, `cover`, `crop`, `scale-down` |
| `q` | 품질 | 1-100 |
| `f` | 포맷 | `webp`, `avif`, `jpeg`, `png` |

> 포맷 미지정 시 자동으로 WebP 변환

---

## 지원 이미지 포맷

| Content-Type | 확장자 |
|-------------|-------|
| `image/jpeg` | jpg, jpeg |
| `image/png` | png |
| `image/gif` | gif |
| `image/webp` | webp |
| `image/svg+xml` | svg |
| `image/heic` | heic |

---

## 다음 단계

- [Vercel 배포 가이드](/guides/vercel-deploy)
- [환경 변수 설정](/guides/env-variables)
