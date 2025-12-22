---
name: pr-description
description: 브랜치 변경사항을 분석하여 PR 설명 자동 생성
author: gpters-team
tags: [git, productivity, documentation]
difficulty: easy
---

# PR Description Generator

현재 브랜치의 모든 커밋과 변경사항을 분석하여 상세한 Pull Request 설명을 자동 생성합니다.

## Usage

PR을 생성하기 전 `/pr-description`을 실행하세요.

## Process

1. `git log main..HEAD` 실행하여 커밋 히스토리 확인
2. `git diff main...HEAD` 실행하여 전체 변경사항 분석
3. 변경 파일 목록 및 영향 범위 파악
4. PR 템플릿에 맞춰 설명 생성

## Output Format

```markdown
## Summary
[변경사항 요약 - 1~3문장]

## Changes
- [주요 변경사항 목록]

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
[테스트 방법 설명]

## Screenshots (if applicable)
[UI 변경 시 스크린샷]

## Checklist
- [ ] 코드가 스타일 가이드를 따름
- [ ] 셀프 리뷰 완료
- [ ] 필요한 문서 업데이트 완료
- [ ] 테스트 추가/수정 완료
```

## Example

```bash
# feature 브랜치에서 실행
/pr-description

# base 브랜치 지정
/pr-description --base develop
```
