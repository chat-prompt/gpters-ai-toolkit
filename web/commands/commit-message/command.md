---
name: commit-message
description: Git 변경사항을 분석하여 컨벤셔널 커밋 메시지 생성
author: gpters-team
tags: [git, productivity]
difficulty: easy
---

# Commit Message Generator

Git 스테이징된 변경사항을 분석하여 Conventional Commits 형식의 커밋 메시지를 자동 생성합니다.

## Usage

변경사항을 스테이징한 후 `/commit-message`를 실행하세요.

## Process

1. `git diff --staged` 실행하여 변경사항 확인
2. 변경된 파일과 내용 분석
3. 적절한 커밋 타입 결정 (feat, fix, docs, style, refactor, test, chore)
4. 간결하고 명확한 커밋 메시지 생성

## Commit Types

- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 코드 포맷팅, 세미콜론 누락 등
- `refactor`: 리팩토링 (기능 변경 없음)
- `test`: 테스트 추가/수정
- `chore`: 빌드, 설정 파일 변경

## Output Format

```
<type>(<scope>): <subject>

<body>
```

## Example

```bash
# 스테이징 후 실행
git add .
# Claude Code에서
/commit-message
```

Output:
```
feat(auth): 소셜 로그인 기능 추가

- Google OAuth 연동 구현
- 로그인 상태 관리 로직 추가
- 사용자 프로필 정보 저장
```
