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
| API 엔드포인트 | `https://gpters-image-cdn.kangjun-f0f.workers.dev` |
| 이미지 URL | `https://images.gpters.org/{key}` |
| 지원 포맷 | PNG, JPG, GIF, WebP, SVG, HEIC |
| 최대 크기 | 10MB |

---

## 사용 방법

### 1단계: 업로드 URL 받기

```javascript
const response = await fetch('https://gpters-image-cdn.kangjun-f0f.workers.dev/upload-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filename: 'my-image.png',
    contentType: 'image/png'
  })
})

const { uploadUrl, imageUrl, key } = await response.json()
```

**응답 예시:**
```json
{
  "uploadUrl": "https://gpters-image-cdn.kangjun-f0f.workers.dev/upload?key=abc123-my-image.png",
  "imageUrl": "https://images.gpters.org/abc123-my-image.png",
  "key": "abc123-my-image.png"
}
```

### 2단계: 이미지 업로드

```javascript
await fetch(uploadUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'image/png' },
  body: file  // File 객체
})
```

### 3단계: 이미지 사용

```html
<img src="https://images.gpters.org/abc123-my-image.png" />
```

---

## 복사해서 쓰는 코드

### React 컴포넌트

```jsx
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
        'https://gpters-image-cdn.kangjun-f0f.workers.dev/upload-url',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': file.type },
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
/**
 * 이미지를 GPTers CDN에 업로드합니다.
 * @param {File} file - 업로드할 이미지 파일
 * @returns {Promise<string>} 업로드된 이미지 URL
 */
async function uploadImage(file) {
  const API_URL = 'https://gpters-image-cdn.kangjun-f0f.workers.dev'

  // 1. 업로드 URL 받기
  const urlResponse = await fetch(`${API_URL}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type
    })
  })

  if (!urlResponse.ok) {
    throw new Error('업로드 URL 발급 실패')
  }

  const { uploadUrl, imageUrl } = await urlResponse.json()

  // 2. 이미지 업로드
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file
  })

  if (!uploadResponse.ok) {
    throw new Error('이미지 업로드 실패')
  }

  return imageUrl
}

// 사용 예시
const file = document.querySelector('input[type="file"]').files[0]
const imageUrl = await uploadImage(file)
console.log('업로드 완료:', imageUrl)
```

---

## 자주 묻는 질문

### Q: 어떤 이미지 포맷을 지원하나요?

PNG, JPG, GIF, WebP, SVG, HEIC를 지원합니다.

### Q: 최대 파일 크기는?

10MB까지 업로드 가능합니다.

### Q: 업로드한 이미지는 얼마나 보관되나요?

영구 보관됩니다.

### Q: CORS 에러가 나요

모든 도메인에서 사용 가능합니다. CORS 에러가 발생하면 요청 형식을 확인해주세요.

---

## API 레퍼런스

### POST /upload-url

업로드 URL을 발급받습니다.

**요청:**
```json
{
  "filename": "image.png",
  "contentType": "image/png",
  "folder": "my-project"
}
```

| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `filename` | X | 파일명 (기본값: image) |
| `contentType` | X | MIME 타입 |
| `folder` | X | 폴더 경로 (예: `user123`, `project/images`) |

**응답:**
```json
{
  "uploadUrl": "https://gpters-image-cdn.kangjun-f0f.workers.dev/upload?key=...",
  "imageUrl": "https://images.gpters.org/my-project/abc123-image.png",
  "key": "my-project/abc123-image.png"
}
```

### POST /upload?key={key}

이미지를 업로드합니다.

**헤더:**
- `Content-Type`: 이미지 MIME 타입 (image/png, image/jpeg 등)

**바디:**
- 이미지 파일 바이너리

**응답:**
```json
{
  "success": true,
  "imageUrl": "https://images.gpters.org/...",
  "key": "..."
}
```

---

## 다음 단계

- [Vercel 배포 가이드](/guides/vercel-deploy)
- [환경 변수 설정](/guides/env-variables)
