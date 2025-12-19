# 기여 가이드

## 기여 방법

### 1. 새 스킬 추가

```bash
# 템플릿 복사
cp -r skills/_template skills/내스킬이름

# 파일 수정
# - skill.md: 스킬 정의
# - README.md: 사용법 문서
```

### 2. 새 에이전트 추가

```bash
# 템플릿 복사
cp -r agents/_template agents/내에이전트이름

# 파일 수정
# - agent.md: 에이전트 정의
# - README.md: 사용법 문서
```

### 3. 프롬프트 추가

```bash
# 템플릿 복사
cp prompts/_template.md prompts/내프롬프트.md

# 내용 수정
```

## 네이밍 규칙

| 항목 | 규칙 | 예시 |
|------|------|------|
| 스킬 폴더 | kebab-case | `case-study-writer` |
| 에이전트 폴더 | kebab-case | `code-reviewer` |
| 프롬프트 파일 | kebab-case.md | `meeting-summary.md` |

## 필수 포함 내용

### 스킬

- [ ] `skill.md` - 스킬 정의 (name, description 필수)
- [ ] `README.md` - 사용법, 예시, 주의사항
- [ ] 카탈로그 업데이트

### 에이전트

- [ ] `agent.md` - 에이전트 정의
- [ ] `README.md` - 사용법, 예시
- [ ] 카탈로그 업데이트

## PR 체크리스트

PR 생성 시 아래 항목을 확인해주세요:

- [ ] 템플릿 구조를 따랐는가?
- [ ] README에 사용 예시가 있는가?
- [ ] 실제로 테스트해봤는가?
- [ ] `docs/catalog.md`에 추가했는가?

## 커밋 메시지 규칙

```
feat(skills): case-study-writer 스킬 추가
fix(agents): code-reviewer 에이전트 버그 수정
docs: 시작 가이드 업데이트
```

## 리뷰 프로세스

1. PR 생성
2. 최소 1명의 리뷰어 승인
3. CI 통과 (있는 경우)
4. 머지

## 질문이 있으신가요?

Slack `#ai-toolkit` 채널에서 질문해주세요.
