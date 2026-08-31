# 세션 없는 AITK CLI 스킬 이벤트 계약

관련 이슈: [DEV-4259](https://linear.app/geniefy/issue/DEV-4259/ax-%EC%84%B8%EC%85%98-%EC%97%86%EB%8A%94-aitk-cli-%EC%8A%A4%ED%82%AC-%EC%9D%B4%EB%B2%A4%ED%8A%B8-%EB%88%84%EB%9D%BD-%EB%B0%8F-%EC%82%AC%EC%9A%A9-%EC%A7%80%ED%91%9C-%EC%9D%98%EB%AF%B8-%EC%A0%95%EB%A6%AC)

## 결론

대시보드가 최근에 데이터를 누락시킨 것이 아니다. 대시보드는 정규화된
`skill_events`를 읽으면서 기존 수집 공백을 드러냈다.

AITK CLI의 `search`, `get`, `report-outcome`은 명령 하나를 실행하고 끝나는 호출이라
정식 MCP 대화 세션을 만들지 않는다. 서버는 감사 로그는 남겼지만 `session_id`가 있을
때만 `skill_events`를 기록했고, 결과적으로 세션 없는 성공 호출이 대시보드 집계에서
빠졌다.

명령 하나마다 인위적인 대화 세션을 만드는 것도 올바른 해결이 아니다. 그렇게 하면
세션 수와 퍼널이 부풀고, 서로 독립적인 검색·로드·결과 보고가 하나의 대화처럼 보인다.

## 측정 의미

| 사건 | 의미 | 실제 실행 증거인가 |
|---|---|---|
| `deploy` | 스킬 생성·발행 | 아니오 |
| `search` | 검색 결과 노출 | 아니오 |
| `load` | 콘텐츠 조회·획득 | 아니오 |
| `apply` | 사용자·에이전트가 적용 결과를 보고 | 자기보고 증거 |
| 검증 실행 완료 | 상태·검증 방법을 포함한 실행 결과 | 가장 강한 증거 |

사용자가 스킬을 로컬에 저장한 뒤 서버 호출 없이 반복 사용하면 서버는 그 사실을 알 수
없다. 이를 0회 사용으로 단정하거나 `load`를 실행으로 추정하지 않는다. 대시보드에서는
`미사용` 대신 `기간 내 로드·적용 보고 없음`, `실제 사용` 대신
`콘텐츠 로드·적용 보고`라고 표현한다.

로컬 반복 실행까지 집계하려면 Claude Code·Codex 등의 명시적 opt-in 훅이
`report_skill_execution_started`와 `report_skill_execution`을 보내야 한다. 프롬프트,
응답 본문, 파일 내용은 전송 대상이 아니다.

## 서버 저장 계약

- `skill_events.session_id`는 nullable이다.
- 정식 MCP 세션이 있으면 기존처럼 세션 ID를 연결한다.
- 세션이 없으면 `session_id = NULL`로 사건과 사용자를 보존한다.
- 모든 새 사건은 원천 `mcp_audit_logs.id`를 `source_audit_log_id`로 연결한다.
- `(source_audit_log_id, skill_id, action)` 부분 유니크 인덱스로 재시도와 중복 처리를
  멱등하게 만든다.
- 세션 없는 사건은 이벤트·사용자 집계에는 포함하지만 대화 세션 수와 세션 퍼널에는
  포함하지 않는다.
- REST 검색의 내부 결과 메타데이터는 감사/정규화에만 사용하고 API 응답에는 노출하지
  않는다.

## CLI 계약

- `search`, `get`, `report-outcome`, `report-skip`: 단발성 호출을 유지한다. 서버가 감사
  로그 원천 키로 저장한다.
- `search`가 무작위 `journeyId`를 만들고, CLI가 이를 `get`과 결과·실행 보고에 자동으로
  전달한다. 검색 없이 바로 `get`하면 새 여정을 만든다.
- 로컬 연결 상태는 24시간 후 폐기한다. 검색어·프롬프트·응답·파일 경로는 저장하지 않고,
  UUID·attemptId·스킬 ID의 SHA-256 해시만 `~/.cache/gpters-aitk/skill-journeys`에 보관한다.
- 상태 파일을 읽거나 쓸 수 없어도 본 명령은 실패하지 않는다. 이 경우 여정 연결만
  빠지고 개별 사건은 그대로 기록된다.
- `report-execution-start`, `report-execution`도 세션 없는 단일 JSON-RPC 호출을 사용한다.
  실행 시도 테이블의 `session_id`는 선택값이고, 시작·완료는 `attemptId`, 탐색 흐름은
  `journeyId`로 연결한다.
- 구형 CLI도 서버 호환 계층에서 같은 방식으로 기록되어야 한다.

## 0033 여정 마이그레이션

- `skill_events.journey_id`와 `ax_skill_execution_attempts.journey_id`를 추가한다.
- `ax_skill_execution_attempts.session_id`의 NOT NULL 제약만 해제한다.
- 기존 행은 수정·삭제·백필하지 않는다. 기존 행의 `journey_id`는 NULL로 남는다.
- `journeyId`는 인증 토큰이나 사용자 ID가 아닌 무작위 UUID이며, 서버는 전달값이 UUID인지
  검증한다.
- 구형 클라이언트가 식별자를 생략하면 서버는 검색·로드에 새 UUID를 발급하고, 결과·실행
  보고는 연결 정보 없이도 받아들인다.

배포 순서는 반드시 **0033 DB → 웹/API → repo 설치형 AITK CLI**다. 새 서버는 구형 CLI를
계속 받지만, 새 CLI의 세션 없는 실행 보고는 구형 서버에서 저장되지 않기 때문이다. DB 적용은
`db:migrate:skill-journey-child`로 자식 브랜치를 먼저 검증하고, 운영에서는 별도 복구 브랜치와
`apply-ax-0033` 확인 문구를 요구한다. 마이그레이션 전후 `skill_events`와 실행 시도 행 수가
달라지면 가드가 적용을 실패로 판정한다.

## 마이그레이션과 백필 순서

1. Neon 자식 브랜치에서 0032 preflight와 apply를 실행한다.
2. 기존 `skill_events` 행 수 불변, nullable 컬럼·FK·인덱스를 검증한다.
3. 0032를 운영에 먼저 적용한다. 이 변경은 기존 행을 수정하거나 삭제하지 않는다.
4. 웹/API 코드를 배포해 새 사건 기록을 시작한다.
5. 영향 기간을 지정해 백필 dry-run을 실행한다. 출력은 도구별 총건수가 아니라
   대상·후보·매칭·미해결·기존·삽입 예정 건수만 포함하며 요청 본문과 ID를 출력하지 않는다.
6. 미매칭·미해결 건수를 정확히 확인하고 같은 수를 명시적으로 acknowledge한 뒤에만
   백필을 적용한다.
7. 적용 후 삽입 예정 0건, 원천 연결 수 일치, 두 번째 실행 0건 삽입을 확인한다.

운영 쓰기는 복구 브랜치 ID와 별도 확인 문구 없이는 실행되지 않는다. 0032 스키마 적용과
과거 데이터 백필은 서로 다른 승인 단계다.
