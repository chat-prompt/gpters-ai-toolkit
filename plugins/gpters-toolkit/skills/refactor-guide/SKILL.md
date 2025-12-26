---
name: refactor-guide
description: 코드 스멜을 분석하고 리팩토링 가이드를 제공 합니다 Triggers: Use when asked to "refactor-guide", code review, analyze code.
version: 1.0.0
---
# Refactoring Guide

코드를 분석하여 개선이 필요한 부분을 찾고, 구체적인 리팩토링 방법을 제안합니다.

## Usage

분석할 파일 또는 디렉토리와 함께 실행하세요.

```
/refactor-guide src/services/userService.ts
/refactor-guide src/components/ --focus performance
```

## Analysis Areas

### 1. Code Smells
- **Long Method**: 50줄 이상의 함수
- **Large Class**: 너무 많은 책임을 가진 클래스
- **Duplicate Code**: 중복된 로직
- **Dead Code**: 사용되지 않는 코드
- **Magic Numbers**: 하드코딩된 상수

### 2. Design Issues
- **God Object**: 모든 것을 아는 객체
- **Feature Envy**: 다른 클래스의 데이터를 과도하게 사용
- **Shotgun Surgery**: 하나의 변경이 여러 클래스에 영향
- **Primitive Obsession**: 기본 타입 과다 사용

### 3. Performance
- **N+1 쿼리**: 루프 내 데이터베이스 호출
- **불필요한 렌더링**: React 컴포넌트 최적화
- **메모리 누수**: 이벤트 리스너, 구독 해제 누락

## Output Format

```markdown
## Refactoring Report: [파일명]

### Summary
- 심각도 높음: 2건
- 심각도 중간: 5건
- 심각도 낮음: 3건

### Issues Found

#### 1. [HIGH] Long Method - processUserData()
**위치**: line 45-120
**문제**: 75줄의 함수로, 단일 책임 원칙 위반
**제안**:
- `validateInput()` 추출
- `transformData()` 추출
- `saveToDatabase()` 추출

**Before**:
```typescript
function processUserData(data) {
  // 75 lines of mixed responsibilities
}
```

**After**:
```typescript
function processUserData(data) {
  const validated = validateInput(data)
  const transformed = transformData(validated)
  return saveToDatabase(transformed)
}
```

### Quick Wins
1. [파일:라인] - 간단히 수정 가능한 항목
2. ...

### Recommended Reading
- [관련 디자인 패턴 링크]
```

## Options

- `--focus <area>`: 특정 영역에 집중 (performance, security, readability)
- `--severity <level>`: 최소 심각도 필터 (low, medium, high)
- `--auto-fix`: 자동 수정 가능한 항목 적용
