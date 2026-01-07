# GPTers Toolkit

GPTers 팀을 위한 Claude Code MCP 플러그인입니다.

## 빠른 설치 (30초)

**터미널에서 한 줄 실행**:

```bash
claude mcp add gpters-marketplace https://company-ai-toolkit.vercel.app/api/mcp -t http
```

브라우저가 열리면 **Google 계정으로 로그인**하세요. 완료!

> OAuth 2.1 인증을 사용합니다. `@gpters.org` 도메인 계정만 사용 가능합니다.

## 포함된 기능

### 스킬 (Skills)

| 스킬 | 설명 | 사용 방법 |
|------|------|----------|
| `data-source-reference` | GPTers 데이터 소스 레퍼런스 | "DB 스키마 알려줘" |
| `refactor-guide` | 코드 리팩토링 가이드 | "리팩토링 가이드 참고해줘" |

### 에이전트 (Agents)

| 에이전트 | 설명 | 사용 방법 |
|----------|------|----------|
| `code-reviewer` | 코드 리뷰 서브에이전트 | "코드 리뷰해줘" |

## 사용 예시

### 자연어 사용

```
"이 코드 리뷰해줘"
"User 테이블 구조가 어떻게 되어 있어?"
"리팩토링 가이드 참고해서 이 코드 개선해줘"
```

### 명시적 호출

```
/mcp__gpters-marketplace__data-source-reference
/mcp__gpters-marketplace__refactor-guide
/mcp__gpters-marketplace__code-reviewer
```

## 문의

문제가 있거나 새로운 플러그인 요청은 [GPTers AI Toolkit](https://company-ai-toolkit.vercel.app)에서 제출해주세요.
