# GPTers Toolkit

GPTers 팀을 위한 Claude Code MCP 플러그인입니다.

## 빠른 설치 (30초)

**가장 쉬운 방법**: https://company-ai-toolkit.vercel.app/getting-started 에서 안내를 따르세요.

### 수동 설치

1. **토큰 발급**: https://company-ai-toolkit.vercel.app/getting-started 에서 발급

2. **환경변수 설정** (터미널):
```bash
echo 'export GPTERS_MCP_TOKEN="YOUR_TOKEN_HERE"' >> ~/.zshrc && source ~/.zshrc
```

3. **프록시 스크립트 다운로드**:
```bash
curl -fsSL https://company-ai-toolkit.vercel.app/api/mcp-proxy -o ~/.claude/gpters-mcp-proxy.mjs
```

4. **MCP 서버 추가** (터미널):
```bash
claude mcp add gpters-marketplace \
  -e MCP_URL=https://company-ai-toolkit.vercel.app/api/mcp \
  -e MCP_TOKEN=$GPTERS_MCP_TOKEN \
  -- node ~/.claude/gpters-mcp-proxy.mjs
```

5. **Claude Code 재시작**

> ⚠️ HTTP transport의 headers 버그로 인해 stdio proxy 방식을 사용합니다.

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

## 선택사항: 자동 제안 Hook

입력에 따라 관련 플러그인을 자동으로 제안받고 싶다면:

```bash
# Hook 설치
curl -fsSL https://company-ai-toolkit.vercel.app/api/hooks/gpters-plugin-suggest.sh \
  -o ~/.claude/hooks/gpters-plugin-suggest.sh && \
  chmod +x ~/.claude/hooks/gpters-plugin-suggest.sh
```

`~/.claude/settings.json`에 추가:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "~/.claude/hooks/gpters-plugin-suggest.sh",
        "timeout": 5000
      }
    ]
  }
}
```

## 문의

문제가 있거나 새로운 플러그인 요청은 [GPTers AI Toolkit](https://company-ai-toolkit.vercel.app)에서 제출해주세요.
