# Company AI Toolkit

사내 Claude 스킬, 에이전트, 프롬프트를 공유하는 저장소입니다.

## 구조

```
company-ai-toolkit/
├── skills/          # Claude Code 스킬
├── agents/          # 서브에이전트 정의
├── prompts/         # 재사용 프롬프트
├── docs/            # 문서
└── examples/        # 사용 예시
```

## 빠른 시작

1. 저장소 클론
```bash
git clone https://github.com/company/company-ai-toolkit.git
```

2. 스킬 설치
```bash
cp -r skills/원하는스킬 ~/.claude/skills/
```

3. 사용
```
Claude Code에서 /스킬이름 으로 실행
```

## 문서

- [시작 가이드](docs/getting-started.md)
- [기여 가이드](docs/contribution-guide.md)
- [스킬/에이전트 카탈로그](docs/catalog.md)

## 기여하기

새로운 스킬이나 에이전트를 만드셨나요? PR을 보내주세요!

1. `skills/_template` 또는 `agents/_template`을 복사
2. 내용 작성
3. PR 생성

자세한 내용은 [기여 가이드](docs/contribution-guide.md)를 참고하세요.
