# GPTers Toolkit

GPTers 팀을 위한 올인원 Claude Code 플러그인입니다. 스킬, 에이전트, MCP 서버를 한 번에 설치할 수 있습니다.

## 설치 방법

```bash
# 1. 마켓플레이스 추가 (최초 1회)
/plugin marketplace add gpters/company-ai-toolkit

# 2. 올인원 플러그인 설치
/plugin install gpters-toolkit@company-ai-toolkit
```

## 포함된 기능

### 스킬 (Skills)

| 스킬 | 설명 | 사용 방법 |
|------|------|----------|
| `data-source-reference` | GPTers 데이터 소스 레퍼런스 | "DB 스키마 알려줘" |
| `refactor-guide` | 코드 리팩토링 가이드 | `/refactor-guide src/` |

### 에이전트 (Agents)

| 에이전트 | 설명 | 사용 방법 |
|----------|------|----------|
| `code-reviewer` | 코드 리뷰 서브에이전트 | "코드 리뷰해줘" |

### MCP 서버 (번들)

설치 시 다음 MCP 서버들이 자동으로 활성화됩니다:

| MCP 서버 | 설명 |
|----------|------|
| `gpters-marketplace` | GPTers 플러그인 마켓플레이스 |
| `linear-server` | Linear 이슈 관리 |
| `context7` | 라이브러리 문서 조회 |
| `chrome-devtools` | Chrome DevTools 연동 |

## 사용 예시

### 자연어 사용

```
"이 코드 리뷰해줘"
"User 테이블 구조가 어떻게 되어 있어?"
"리팩토링 가이드 참고해서 이 코드 개선해줘"
```

### 명시적 호출

```
/data-source-reference
/refactor-guide src/services/
/code-review
```

## 업데이트

플러그인 업데이트를 받으려면:

```bash
/plugin marketplace update
```

## 개별 설치

특정 기능만 필요하다면 개별 플러그인을 설치할 수 있습니다:

```bash
/plugin install data-source-reference@company-ai-toolkit
/plugin install refactor-guide@company-ai-toolkit
/plugin install code-reviewer@company-ai-toolkit
```

## 문의

문제가 있거나 새로운 플러그인 요청은 [GPTers AI Toolkit](https://toolkit.gpters.org/admin)에서 제출해주세요.
