# GPTers AI Toolkit 팀원 온보딩 가이드

GPTers 사내 플러그인(스킬, 에이전트, 커맨드, 가이드)을 Claude Code에서 사용하는 방법입니다.

---

## 빠른 시작 (1분)

### Step 1: MCP 서버 추가

터미널에서 아래 명령어를 실행하세요:

```bash
claude mcp add gpters-marketplace https://company-ai-toolkit.vercel.app/api/mcp -t http
```

> **참고**: 프로젝트별로 설정하려면 프로젝트 루트에서 실행하세요. 글로벌 설정은 `-s user` 옵션을 추가하세요.

### Step 2: 브라우저 로그인

Claude Code가 자동으로 브라우저를 열어 Google 로그인을 요청합니다:

1. 브라우저가 자동으로 열립니다
2. Google 계정 (@gpters.org)으로 로그인
3. 완료!

### 연결 확인

```bash
claude mcp list
# gpters-marketplace: ... ✓ Connected
```

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

---

## 선택사항: 자동 플러그인 제안 Hook

입력에 따라 관련 플러그인을 자동으로 제안받고 싶다면 Hook을 설치하세요.

### Hook 설치

```bash
curl -fsSL https://company-ai-toolkit.vercel.app/api/hooks/gpters-plugin-suggest.sh \
  -o ~/.claude/hooks/gpters-plugin-suggest.sh && \
  chmod +x ~/.claude/hooks/gpters-plugin-suggest.sh
```

### settings.json 설정

`~/.claude/settings.json` 파일에 아래 내용을 추가하세요:

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

---

## 사용 가능한 플러그인

### 스킬 (Skills)
- `data-source-reference` - GPTers 데이터 소스 레퍼런스
- `refactor-guide` - 코드 리팩토링 가이드

### 에이전트 (Agents)
- `code-reviewer` - 코드 리뷰 서브에이전트

> **최신 목록 확인**: Claude에게 "사용 가능한 플러그인 목록 보여줘"라고 요청하세요.

---

## 문제 해결

### "MCP 서버에 연결할 수 없습니다"

1. MCP 서버가 추가되었는지 확인: `claude mcp list`
2. 서버 제거 후 다시 추가:
   ```bash
   claude mcp remove gpters-marketplace
   claude mcp add gpters-marketplace https://company-ai-toolkit.vercel.app/api/mcp -t http
   ```
3. 브라우저에서 다시 로그인

### "인증 실패" 또는 "401 Unauthorized"

1. @gpters.org 계정으로 로그인했는지 확인
2. 브라우저 쿠키 삭제 후 다시 로그인

### Hook이 실행되지 않음

1. Hook 스크립트 실행 권한 확인 (`chmod +x`)
2. `jq` 설치 확인 (`brew install jq` 또는 `apt install jq`)
3. settings.json 경로 확인

---

## 인증 관련

- **@gpters.org 계정만 사용 가능**: 사내 인원 전용입니다
- **OAuth 2.1 인증**: 브라우저 로그인만으로 자동 연결됩니다
- **토큰 복사 불필요**: 환경변수 설정이나 토큰 관리가 필요 없습니다

---

## 피드백 및 요청

새 플러그인 요청이나 버그 리포트는 [GPTers AI Toolkit](https://company-ai-toolkit.vercel.app)에서 제출해주세요.
