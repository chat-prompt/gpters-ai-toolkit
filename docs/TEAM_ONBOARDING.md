# GPTers AI Toolkit 팀원 온보딩 가이드

GPTers 사내 플러그인(스킬, 에이전트, 커맨드, 가이드)을 Claude Code에서 사용하는 방법입니다.

---

## 빠른 시작 (30초)

### 웹 설정 마법사 사용 (권장)

1. https://company-ai-toolkit.vercel.app/getting-started 방문
2. Google 로그인 (@gpters.org)
3. 표시된 명령어를 터미널에 복사/붙여넣기
4. Claude Code에서 플러그인 설치 명령어 실행
5. Claude Code 재시작
6. 완료!

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

### 3단계: 플러그인 설치

Claude Code에서:
```bash
# 마켓플레이스 추가 (1회)
/plugin marketplace add gpters/company-ai-toolkit

# 올인원 플러그인 설치
/plugin install gpters-toolkit@gpters-marketplace
```

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

### 방법 3: 개별 플러그인 설치

특정 플러그인만 필요하다면:

```bash
/plugin install code-reviewer@gpters-marketplace
/plugin install data-source-reference@gpters-marketplace
```

---

## 어떤 방법을 선택해야 할까?

| 상황 | 권장 방법 |
|------|----------|
| 처음 사용하거나 뭘 찾아야 할지 모를 때 | **자연어** |
| 특정 플러그인을 정확히 알고 있을 때 | **MCP 프롬프트** |
| 모든 기능 + MCP 서버를 한 번에 원할 때 | **올인원 플러그인** |
| 특정 플러그인만 필요할 때 | **개별 플러그인 설치** |

---

## 자동 업데이트

| 방식 | 업데이트 |
|------|---------|
| **자연어 / MCP 프롬프트** | 자동 (서버 업데이트 시 즉시 반영) |
| **플러그인 설치** | 수동 (`/plugin marketplace update` 실행) |

> **권장**: 기본적으로 자연어 또는 MCP 방식을 사용하면 항상 최신 버전을 사용합니다.

---

## 사용 가능한 플러그인

### 올인원 플러그인
- `gpters-toolkit` - 모든 스킬, 에이전트, MCP 서버 통합 패키지

### 스킬 (Skills)
- `data-source-reference` - GPTers 데이터 소스 레퍼런스
- `refactor-guide` - 코드 리팩토링 가이드

### 에이전트 (Agents)
- `code-reviewer` - 코드 리뷰 서브에이전트

### MCP 서버 (올인원 플러그인에 포함)
- `gpters-marketplace` - 플러그인 동적 검색 및 설치
- `linear` - Linear 이슈 관리
- `context7` - 라이브러리 문서 조회
- `chrome-devtools` - Chrome DevTools 연동

> **최신 목록 확인**: Claude에게 "사용 가능한 플러그인 목록 보여줘"라고 요청하세요.

---

## 문제 해결

### "토큰이 만료되었거나 유효하지 않습니다"

1. https://company-ai-toolkit.vercel.app/profile/tokens 에서 새 토큰 발급
2. 환경변수 업데이트 후 터미널/Claude Code 재시작

### "MCP 서버에 연결할 수 없습니다"

1. `GPTERS_MCP_TOKEN` 환경변수가 설정되어 있는지 확인:
   ```bash
   echo $GPTERS_MCP_TOKEN
   ```
2. Claude Code 완전히 재시작

### "플러그인을 찾을 수 없습니다"

1. 플러그인 ID가 정확한지 확인
2. "사용 가능한 플러그인 목록 보여줘"로 확인

### 환경변수가 적용되지 않음

- **macOS/Linux**: 새 터미널 탭을 열거나 `source ~/.zshrc` (또는 `~/.bashrc`) 실행
- **Windows**: PowerShell을 완전히 닫았다가 다시 열기

---

## 인증 관련

- **@gpters.org 계정만 사용 가능**: 사내 인원 전용입니다
- **토큰 관리**: https://company-ai-toolkit.vercel.app/profile/tokens 에서 토큰 발급/취소/갱신
- **토큰 유효기간**: 기본 무제한 (필요 시 만료일 설정 가능)

---

## 피드백 및 요청

새 플러그인 요청이나 버그 리포트는 [GPTers AI Toolkit](https://company-ai-toolkit.vercel.app)에서 제출해주세요.
