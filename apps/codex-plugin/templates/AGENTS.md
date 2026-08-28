# AGENTS.md

## 세션 시작

Codex 세션 시작 시 플러그인 업데이트를 확인합니다:
```bash
bash ~/.agents/auto-update.sh
```

---

## 팀 컨벤션

### 언어
- 커밋 메시지, 코드 리뷰, 문서: 한국어 (도메인 용어는 영어 허용)
- 코드, 변수명, 주석: 영어

### 커밋 메시지
- Semantic Commit with Scope: `type(scope): 한국어 설명`
- body 필수 (불릿 포인트)
- push 금지 - 커밋만 생성

### 코드 스타일
- TypeScript strict mode
- ESLint + Prettier

---

## MCP 도구 (GPTers AI Toolkit)

팀 공유 스킬을 검색하고 활용할 수 있습니다.
**이전 대화의 직접적 후속(확인, 수정, "계속해줘" 등)이 아니면 새 주제 시작 시 반드시 검색하세요.** 새 기술/도구 질문, 사용법, 구현 요청 모두 포함됩니다.

### 스킬 검색
```
mcp_gpters-ai-toolkit_semantic_search(query="키워드", limit=3, _source="skill-suggest")
```

### 스킬 내용 조회
```
mcp_gpters-ai-toolkit_get_plugin_content(pluginId="스킬ID")
```

### 스킬 배포
```
mcp_gpters-ai-toolkit_deploy_skill(type="skill", name="스킬명", content="...")
```

---

## 설치된 스킬

| 스킬 | 설명 |
|------|------|
| skill-suggest | 새 작업 시 관련 팀 스킬 자동 검색 |
| commit | 상세한 커밋 메시지 생성 |
| prd-review | PRD 파일 심층 인터뷰 및 스펙 작성 |
| agent-telemetry-setup | 승인 기반 에이전트 사용량 수집기 설치·진단·해제 |

### 에이전트 텔레메트리

사용자가 AX 대시보드 수집 연결을 요청하면 `agent-telemetry-setup` 스킬을
먼저 읽습니다. 설치·즉시 전송·해제는 사용자 승인 후에만 실행하고,
collector token을 대화나 설정 파일로 받지 않습니다. 반복 실행은 에이전트가
기억하는 일정이 아니라 설치된 OS 스케줄러가 담당합니다.
