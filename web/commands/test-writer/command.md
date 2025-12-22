---
name: test-writer
description: 함수/컴포넌트에 대한 단위 테스트 코드 자동 생성
author: gpters-team
tags: [testing, code, productivity]
difficulty: medium
---

# Test Writer

함수, 클래스, 컴포넌트의 코드를 분석하여 포괄적인 단위 테스트를 자동 생성합니다.

## Usage

테스트할 파일 경로와 함께 `/test-writer`를 실행하세요.

```
/test-writer src/utils/calculator.ts
```

## Process

1. 대상 파일 읽기 및 구조 분석
2. 함수/메서드 시그니처 파악
3. Edge cases 및 경계 조건 식별
4. 테스트 프레임워크 감지 (Jest, Vitest, pytest 등)
5. 테스트 코드 생성

## Test Coverage

- **Happy path**: 정상 동작 케이스
- **Edge cases**: 빈 값, null, undefined
- **Boundary conditions**: 최소/최대 값
- **Error cases**: 예외 상황 처리
- **Type checking**: 잘못된 타입 입력

## Supported Frameworks

### JavaScript/TypeScript
- Jest
- Vitest
- Mocha + Chai

### Python
- pytest
- unittest

### React Components
- React Testing Library
- Enzyme

## Example

Input: `src/utils/math.ts`
```typescript
export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}
```

Output: `src/utils/math.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { divide } from './math'

describe('divide', () => {
  it('should divide two positive numbers', () => {
    expect(divide(10, 2)).toBe(5)
  })

  it('should handle negative numbers', () => {
    expect(divide(-10, 2)).toBe(-5)
  })

  it('should throw error when dividing by zero', () => {
    expect(() => divide(10, 0)).toThrow('Division by zero')
  })

  it('should return decimal results', () => {
    expect(divide(7, 2)).toBe(3.5)
  })
})
```

## Options

- `--coverage`: 커버리지 목표 달성을 위한 추가 테스트 생성
- `--mock`: 의존성 모킹 코드 포함
- `--integration`: 통합 테스트 스타일로 생성
