---
name: skill-suggest
description: 작업 시작 시 관련 팀 스킬을 자동으로 검색하고 적용합니다. GPTers AI Toolkit MCP 서버를 통해 팀이 공유한 스킬, 에이전트, 커맨드를 찾아 활용합니다.
---

# Skill Suggest

새로운 작업을 시작할 때, GPTers AI Toolkit에서 관련 팀 스킬을 자동으로 검색하고 적용합니다.

## 사용 조건

- GPTers AI Toolkit MCP 서버가 연결되어 있어야 합니다
- MCP 서버 이름: `gpters-ai-toolkit`

## 워크플로우

### 1단계: 사용자 요청 분석

사용자의 요청에서 핵심 키워드를 추출합니다.

**키워드 추출 기준:**
- 작업 유형: 코드 리뷰, 리팩토링, 데이터 소스, 문서 작성 등
- 기술 스택: DB, API, UI, 인증 등
- 도메인: 특정 기능이나 모듈명

### 2단계: 스킬 검색

MCP `semantic_search` 도구를 사용하여 관련 스킬을 검색합니다:

```
mcp__gpters-ai-toolkit__semantic_search(query="추출된 키워드", category="skill", limit=5)
```

### 3단계: 관련 스킬 로드

검색 결과에서 관련도가 높은 스킬이 발견되면, 전체 내용을 로드합니다:

```
mcp__gpters-ai-toolkit__get_plugin_content(pluginId="스킬ID")
```

### 4단계: 스킬 적용

로드된 스킬의 지침을 현재 작업에 적용합니다:

- 스킬에 정의된 패턴과 규칙을 따릅니다
- 스킬의 체크리스트가 있으면 확인합니다
- 사용자 요청과 스킬 지침을 결합하여 최적의 결과를 도출합니다

## 추천 검색어 매핑

| 작업 유형 | 검색 키워드 |
|----------|------------|
| DB 스키마/쿼리 | data-source, database, schema |
| 코드 리팩토링 | refactor, clean-code |
| 코드 리뷰 | review, code-review |
| API 개발 | api, endpoint, route |
| 문서 작성 | docs, writing, documentation |
| 인프라/배포 | deploy, infrastructure, ci-cd |

## 주의사항

- 스킬 검색은 작업 시작 시 1회만 수행합니다 (중복 검색 방지)
- 검색 결과가 없으면 스킬 없이 일반적으로 진행합니다
- 스킬 내용이 사용자 요청과 충돌하면, 사용자 요청을 우선합니다
