# 시작 가이드

## 사전 요구사항

- Claude Code CLI 설치
- Git

## 설치

### 1. 저장소 클론

```bash
git clone https://github.com/company/company-ai-toolkit.git
cd company-ai-toolkit
```

### 2. 스킬 설치

원하는 스킬을 Claude Code 스킬 디렉토리에 복사합니다.

```bash
# 단일 스킬 설치
cp -r skills/case-study-writer ~/.claude/skills/

# 모든 스킬 설치
cp -r skills/* ~/.claude/skills/
```

### 3. 에이전트 설치

에이전트는 프로젝트별로 설정하거나 전역으로 설정할 수 있습니다.

```bash
# 프로젝트별 설정
cp agents/원하는에이전트/agent.md .claude/agents/

# 전역 설정
cp agents/원하는에이전트/agent.md ~/.claude/agents/
```

## 사용 방법

### 스킬 사용

Claude Code에서 슬래시 명령어로 실행:

```
/case-study-writer
```

### 에이전트 사용

Task 도구로 서브에이전트 호출:

```
Task 도구에서 subagent_type="에이전트이름" 사용
```

### 프롬프트 사용

프롬프트 파일 내용을 복사하여 사용하거나, 스킬/에이전트에 포함시켜 사용합니다.

## 문제 해결

### 스킬이 인식되지 않는 경우

1. 스킬 파일 위치 확인: `~/.claude/skills/스킬이름/`
2. 스킬 파일명 확인: `skill.md` 또는 `스킬이름.md`
3. Claude Code 재시작

### 권한 문제

```bash
chmod -R 755 ~/.claude/skills/
```

## 다음 단계

- [카탈로그](catalog.md)에서 사용 가능한 스킬/에이전트 확인
- [기여 가이드](contribution-guide.md)를 읽고 직접 만들어보기
