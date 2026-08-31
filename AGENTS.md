# AGENTS.md

## Slack 에이전트 업무방

이 저장소의 작업을 Slack 에이전트 업무방에서 요청하거나 조율하기 전에
`docs/AGENT_SLACK_CHANNEL_RULES.md`를 반드시 읽고 따른다.

- 채널 원문은 대상 에이전트 멘션과 짧은 한 줄 제목만 사용한다.
- 배경·지시·검증·후속 대화·결과는 모두 해당 원문의 스레드에 쓴다.
- 처음 사용하는 방이거나 규칙이 불명확하면 최하영님(`<@U0BP4R0CUSD>`)을 먼저 호출한다.

## 테스트 데이터 안전

- `@gpters/web test`는 기본적으로 `tests/unit`만 실행한다.
- `tests/api`와 `tests/e2e`에는 카탈로그·태그·MCP 서버를 생성·수정·삭제하는 테스트가 있다.
- 현재 개발 서버나 운영·공유 DB를 바라보는 서버에는 API/E2E 전체 테스트를 실행하지 않는다.
- API 테스트는 격리된 일회용 DB와 그 DB를 바라보는 전용 서버를 준비하고,
  `TEST_API_URL`, `TEST_DATABASE_URL`, `CONFIRM_ISOLATED_API_TESTS=run-mutating-api-tests`를
  모두 명시한 경우에만 실행한다.
- 실행 전후 DB 브랜치 ID와 `test-*` 잔여 레코드 수를 확인한다.
