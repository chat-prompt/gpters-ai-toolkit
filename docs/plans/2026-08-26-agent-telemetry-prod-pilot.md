# Agent telemetry 운영 파일럿 실행 가이드

## 범위

이 브랜치는 검증된 에이전트 수집기 위에 다음 서버 변경만 추가한다.

- `ax_agent_telemetry_batches` 테이블 하나
- 개인정보 비포함 batch 계약과 저장 함수
- Bearer 인증 수집 API
- 합성 fixture와 계약/API 테스트

사용자 생명주기, 기존 AX 사용량 사용자 연결, 스킬 실행 결과 테이블을 위한 기존
`0025–0029` 초안은 이 파일럿에 포함하지 않는다.

## 2026-08-26 운영 읽기 전용 감사 결과

- `drizzle.__drizzle_migrations`에는 14행이 있으며 timestamp 기준 `0000–0013`이다.
- 현재 저장소 SQL의 hash는 저장된 14개 hash와 일치하지 않는다. 기존 migration 파일이
  적용 후 변경됐으므로 hash를 기준선 정합화에 사용하면 안 된다.
- `0015–0024`가 만드는 핵심 객체는 운영에 존재하지만 Drizzle migration 행은 없다.
- `ax_agent_telemetry_batches`는 아직 존재하지 않는다.
- 운영 DB에는 이 감사 과정에서 조회만 실행했다.

따라서 기존 journal에 `0015–0024`를 소급 등록하지 않는다. 파일럿 journal은 기존
`0000–0014` 항목을 유지하고, 운영 최신 timestamp보다 큰
`0025_ax_agent_telemetry_batches` 한 항목만 추가한다. Drizzle은 마지막으로 기록된
`created_at`보다 큰 항목만 실행하므로 현재 운영 기준에서는 이 migration 하나만 대상이다.

## 안전 게이트

대상 DB를 변경하기 전에 반드시 전용 프리플라이트를 실행한다.

```bash
pnpm --filter @gpters/db db:preflight:agent-telemetry -- \
  --env-file ../../path/to/target.env
```

결과는 다음 셋 중 하나다.

- `ready`: 감사한 14행 기준선이며 텔레메트리 테이블이 없다.
- `applied`: 전용 migration 행과 테이블 구조가 모두 일치한다.
- `blocked`: 행 수, timestamp, hash 또는 테이블 구조가 예상과 다르다. 적용을 중단한다.

프리플라이트는 스키마와 데이터를 변경하지 않으며 연결 문자열의 비밀번호를 출력하지 않는다.

## Neon child branch 검증

1. 운영 branch의 현재 시점에서 Neon child branch를 생성한다.
2. child branch 전용 연결 문자열을 별도 env 파일에 저장한다.
3. 전용 프리플라이트가 `ready`인지 확인한다.
4. 이 브랜치에서만 `pnpm --filter @gpters/db db:migrate`를 한 번 실행한다.
5. 프리플라이트를 다시 실행해 `applied`, 15행, 23열, 인덱스 4개,
   제약조건 5개인지 확인한다.
6. child branch를 사용하는 preview 서버에 임시 `AX_AGENT_TELEMETRY_TOKEN`을 설정한다.
7. 합성 batch를 두 번 보내 첫 요청 `inserted: true`, 두 번째 요청 `inserted: false`를 확인한다.
8. 뽀둥이 실제 집계는 preview 전용 collector ID와 checkpoint 경로를 사용한다.

운영 checkpoint를 preview에서 재사용하지 않는다. Preview 검증용 토큰과 checkpoint도 운영에
재사용하지 않는다.

### 2026-08-26 실제 검증 결과

- production의 현재 데이터와 스키마를 포함한 `agent-telemetry-pilot-20260826` child branch를
  만들었고 1일 뒤 자동 삭제되도록 설정했다.
- 적용 전 기준선은 migration 14행, 최신 timestamp `1768964811913`, 텔레메트리 테이블 없음이었다.
- 기준선 검사를 포함한 트랜잭션으로 텔레메트리 migration과 Drizzle 이력 한 행을 적용했다.
- 적용 후 migration 15행, 최신 timestamp `1787722904000`, migration hash 일치를 확인했다.
- 테이블은 23열, 인덱스 4개, 제약조건 5개로 migration 정의와 일치했다.
- 같은 합성 batch를 두 번 저장했을 때 첫 INSERT는 1행, 두 번째 INSERT는 0행이었고 최종 행 수는
  1행이었다. 저장된 thinking 관계도 `included-in-output`으로 유지됐다.
- production은 변경하지 않았다.

## 운영 반영 순서

1. 이전 로컬 도구 출력에 노출된 운영 DB 비밀번호를 회전한다.
2. 운영 branch의 복구 지점 또는 즉시 복구용 child branch를 만든다.
3. 운영 프리플라이트가 여전히 `ready`인지 다시 확인한다.
4. 검증된 commit에서 DB migration을 먼저 적용한다.
5. 프리플라이트가 `applied`인지 확인한다.
6. 서버를 배포하고 운영 `AX_AGENT_TELEMETRY_TOKEN`을 secret으로 설정한다.
7. 합성 batch의 최초/중복 응답을 확인한다.
8. 뽀둥이 Claude Code 소스의 한 번짜리 실제 batch를 전송한다.
9. DB 행과 대시보드 합계가 dry-run 및 원본 대조 결과와 일치하는지 확인한다.

Hermes와 Codex의 상세 agent telemetry adapter는 아직 검증되지 않았다. 이번 파일럿은 실제
원본 대조가 끝난 뽀둥이 Claude Code 소스만 전송한다.

## 장애 대응

수집 장애가 생기면 먼저 운영 토큰을 비활성화하고 API 배포를 되돌린다. 이 migration은 새
테이블만 추가하므로 장애 중 테이블을 삭제하지 않는다. 데이터 복구가 필요한 경우 운영 변경
직전에 만든 Neon 복구 지점을 사용한다.
