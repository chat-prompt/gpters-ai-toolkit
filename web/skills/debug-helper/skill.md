---
name: debug-helper
description: 에러 메시지와 스택 트레이스를 분석하여 해결책 제시
author: gpters-team
tags: [debugging, productivity]
difficulty: easy
---

# Debug Helper

에러 메시지, 스택 트레이스, 로그를 분석하여 원인을 파악하고 해결책을 제시합니다.

## Usage

에러 메시지를 복사한 후 `/debug-helper`를 실행하세요.

```
/debug-helper
[에러 메시지 또는 스택 트레이스 붙여넣기]
```

## Process

1. 에러 타입 및 메시지 파싱
2. 스택 트레이스 분석
3. 관련 코드 파일 확인
4. 원인 분석 및 해결책 제시

## Supported Error Types

### JavaScript/TypeScript
- TypeError, ReferenceError, SyntaxError
- Promise rejection, async/await 에러
- Module import 에러
- React/Vue/Angular 에러

### Python
- ImportError, AttributeError, KeyError
- IndentationError, SyntaxError
- Django/Flask 에러

### Database
- Connection errors
- Query syntax errors
- Constraint violations

### Network
- CORS 에러
- Timeout 에러
- SSL/TLS 에러

## Output Format

```markdown
## Error Analysis

### Error Type
`TypeError: Cannot read property 'map' of undefined`

### Root Cause
`users` 변수가 API 응답을 받기 전에 `undefined` 상태에서 `.map()` 호출

### Location
`src/components/UserList.tsx:25`

### Solution

**즉시 수정**:
```typescript
// Before
{users.map(user => <User key={user.id} {...user} />)}

// After
{users?.map(user => <User key={user.id} {...user} />) ?? <Loading />}
```

**권장 수정** (더 나은 접근):
```typescript
if (isLoading) return <Loading />
if (error) return <Error message={error} />
if (!users?.length) return <Empty />

return users.map(user => <User key={user.id} {...user} />)
```

### Prevention
- TypeScript strict mode 활성화
- Optional chaining 사용
- 초기 상태에 빈 배열 설정
```

## Tips

- 전체 스택 트레이스를 포함하면 더 정확한 분석 가능
- 관련 코드 컨텍스트를 함께 제공하면 도움됨
- 에러 발생 시점의 변수 상태 정보 포함 권장
