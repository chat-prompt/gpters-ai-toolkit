---
name: api-docs
description: API 엔드포인트 코드를 분석하여 문서 자동 생성
author: gpters-team
tags: [documentation, api, productivity]
difficulty: medium
---

# API Documentation Generator

API 엔드포인트 코드를 분석하여 OpenAPI/Swagger 스펙 또는 마크다운 문서를 자동 생성합니다.

## Usage

API 파일 또는 디렉토리 경로와 함께 실행하세요.

```
/api-docs src/routes/users.ts
/api-docs src/api/ --format openapi
```

## Process

1. API 라우트 파일 스캔
2. 엔드포인트, 메서드, 파라미터 추출
3. 요청/응답 타입 분석
4. 인증 요구사항 파악
5. 문서 생성

## Output Formats

### Markdown (기본)
```markdown
## GET /api/users

사용자 목록을 조회합니다.

### Parameters
| Name | Type | Required | Description |
|------|------|----------|-------------|
| page | number | No | 페이지 번호 (기본: 1) |
| limit | number | No | 페이지당 항목 수 (기본: 20) |

### Response
```json
{
  "users": [...],
  "total": 100,
  "page": 1
}
```
```

### OpenAPI 3.0
```yaml
paths:
  /api/users:
    get:
      summary: 사용자 목록 조회
      parameters:
        - name: page
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: 성공
```

## Supported Frameworks

- **Node.js**: Express, Fastify, NestJS, Hono
- **Python**: FastAPI, Flask, Django REST
- **Go**: Gin, Echo, Chi

## Features

- 자동 타입 추론
- JSDoc/docstring 파싱
- 에러 응답 문서화
- 인증 미들웨어 감지
- 예제 요청/응답 생성

## Example

```bash
# 단일 파일
/api-docs src/routes/auth.ts

# 전체 API 디렉토리
/api-docs src/api/ --output docs/api.md

# OpenAPI 스펙 생성
/api-docs src/routes/ --format openapi --output openapi.yaml
```
