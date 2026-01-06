# GPTers AI Toolkit 팀원 온보딩 가이드

GPTers 사내 플러그인(스킬, 에이전트, 커맨드, 가이드)을 Claude Code에서 사용하는 방법입니다.

---

## 빠른 시작 (2분)

### 웹 설정 마법사 사용 (권장)

1. https://company-ai-toolkit.vercel.app/getting-started 방문
2. Google 로그인 (@gpters.org)
3. 표시된 명령어를 터미널에 순서대로 복사/붙여넣기
4. Claude Code 재시작
5. 완료!

---

## 수동 설치

### 1단계: 토큰 발급

1. https://company-ai-toolkit.vercel.app/profile/tokens 방문
2. Google 로그인 후 "새 토큰 생성" 클릭
3. 토큰 복사

### 2단계: 환경변수 설정

**macOS (zsh)**:
```bash
echo 'export GPTERS_MCP_TOKEN="mcp_your_token_here"' >> ~/.zshrc && source ~/.zshrc
```

**Linux (bash)**:
```bash
echo 'export GPTERS_MCP_TOKEN="mcp_your_token_here"' >> ~/.bashrc && source ~/.bashrc
```

**Windows (PowerShell)**:
```powershell
setx GPTERS_MCP_TOKEN "mcp_your_token_here"
# 터미널 재시작 필요
```

### 3단계: MCP 서버 설정

`~/.claude/.mcp.json` 파일에 아래 내용을 추가하세요:

```json
{
  "mcpServers": {
    "gpters-marketplace": {
      "type": "http",
      "url": "https://company-ai-toolkit.vercel.app/api/mcp?token=YOUR_TOKEN_HERE"
    }
  }
}
```

> **참고**: 이미 `.mcp.json` 파일이 있다면, `mcpServers` 객체에 `gpters-marketplace` 항목만 추가하세요.

### 4단계: Claude Code 재시작

설정을 적용하려면 Claude Code를 완전히 종료 후 재시작하세요.

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

### "토큰이 만료되었거나 유효하지 않습니다"

1. https://company-ai-toolkit.vercel.app/profile/tokens 에서 새 토큰 발급
2. `.mcp.json` 파일의 URL에서 토큰 업데이트
3. Claude Code 재시작

### "MCP 서버에 연결할 수 없습니다"

1. `.mcp.json` 파일이 올바른 위치에 있는지 확인 (`~/.claude/.mcp.json`)
2. 토큰이 URL에 포함되어 있는지 확인
3. Claude Code 완전히 재시작

### Hook이 실행되지 않음

1. Hook 스크립트 실행 권한 확인 (`chmod +x`)
2. `jq` 설치 확인 (`brew install jq` 또는 `apt install jq`)
3. settings.json 경로 확인

---

## 인증 관련

- **@gpters.org 계정만 사용 가능**: 사내 인원 전용입니다
- **토큰 관리**: https://company-ai-toolkit.vercel.app/profile/tokens 에서 토큰 발급/취소/갱신
- **토큰 유효기간**: 기본 무제한 (필요 시 만료일 설정 가능)

---

## 피드백 및 요청

새 플러그인 요청이나 버그 리포트는 [GPTers AI Toolkit](https://company-ai-toolkit.vercel.app)에서 제출해주세요.
