# GPTers AI Toolkit 팀원 온보딩 가이드

GPTers 사내 플러그인(스킬, 에이전트, 커맨드, 가이드)을 Claude Code에서 사용하는 방법입니다.

---

## 빠른 시작 (5분)

### 1단계: MCP 서버 등록 (필수, 1회)

`~/.claude/settings.json` 파일에 다음을 추가하세요:

```json
{
  "mcpServers": {
    "gpters-marketplace": {
      "type": "http",
      "url": "https://toolkit.gpters.org/api/mcp"
    }
  }
}
```

> **팁**: 파일이 없으면 새로 생성하세요.

### 2단계: 사용하기

설정 완료! 이제 세 가지 방법으로 플러그인을 사용할 수 있습니다:

---

## 사용 방법

### 방법 1: 자연어 (가장 쉬움)

그냥 원하는 것을 말하면 됩니다:

```
"코드 리뷰해줘"
"DB 스키마 알려줘"
"리팩토링 가이드 참고해서 이 코드 개선해줘"
```

Claude가 자동으로 관련 플러그인을 검색하고 적용합니다.

### 방법 2: MCP 프롬프트 (명시적 호출)

특정 플러그인을 직접 호출하고 싶을 때:

```
/mcp__gpters-marketplace__code-reviewer
/mcp__gpters-marketplace__data-source-reference
/mcp__gpters-marketplace__refactor-guide
```

### 방법 3: 플러그인 설치 (짧은 명령어)

자주 쓰는 플러그인은 설치해서 짧은 명령어로 사용할 수 있습니다:

```bash
# 마켓플레이스 추가 (1회)
/plugin marketplace add gpters/company-ai-toolkit

# 플러그인 설치
/plugin install code-reviewer@company-ai-toolkit

# 사용
/code-review
```

---

## 어떤 방법을 선택해야 할까?

| 상황 | 권장 방법 |
|------|----------|
| 처음 사용하거나 뭘 찾아야 할지 모를 때 | **자연어** |
| 특정 플러그인을 정확히 알고 있을 때 | **MCP 프롬프트** |
| 매일 같은 플러그인을 사용할 때 | **플러그인 설치** |

---

## 자동 업데이트

| 방식 | 업데이트 |
|------|---------|
| **자연어 / MCP 프롬프트** | 자동 (서버 업데이트 시 즉시 반영) |
| **플러그인 설치** | 수동 (`/plugin marketplace update` 실행) |

> **권장**: 기본적으로 자연어 또는 MCP 방식을 사용하면 항상 최신 버전을 사용합니다.

---

## 사용 가능한 플러그인

### 스킬 (Skills)
- `data-source-reference` - GPTers 데이터 소스 레퍼런스
- `refactor-guide` - 코드 리팩토링 가이드

### 에이전트 (Agents)
- `code-reviewer` - 코드 리뷰 서브에이전트

### 커맨드 (Commands)
- (추가 예정)

### 가이드 (Guides)
- (추가 예정)

> **최신 목록 확인**: Claude에게 "사용 가능한 플러그인 목록 보여줘"라고 요청하세요.

---

## 문제 해결

### "MCP 서버에 연결할 수 없습니다"

1. `~/.claude/settings.json` 파일 확인
2. URL이 정확한지 확인: `https://toolkit.gpters.org/api/mcp`
3. Claude Code 재시작

### "플러그인을 찾을 수 없습니다"

1. 플러그인 ID가 정확한지 확인
2. "사용 가능한 플러그인 목록 보여줘"로 확인

### 플러그인 업데이트가 반영되지 않음

- MCP 방식: 자동 반영 (문제 시 Claude Code 재시작)
- 설치 방식: `/plugin marketplace update` 실행

---

## 피드백 및 요청

새 플러그인 요청이나 버그 리포트는 [GPTers AI Toolkit](https://toolkit.gpters.org/admin)에서 제출해주세요.
