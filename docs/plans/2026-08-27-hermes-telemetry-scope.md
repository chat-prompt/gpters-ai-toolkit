# Hermes 텔레메트리 프로필 범위

## 배경

Hermes의 프로필 홈과 `state.db` 파일이 분리돼 있어도, 실제 SQLite 안에는 서로 다른
`sessions.profile_name` 값이 함께 저장될 수 있다. 따라서 DB 경로만 지정하고 모든
`sessions`·`messages` 행을 읽으면 개인 세션을 에이전트 사용량으로 잘못 귀속할 수 있다.

실제 검증 환경에서는 최근 7일 세션에 `profile_name` 두 종류가 공존했고, 채널·스레드
값으로는 에이전트 범위를 구분할 수 없었다. 이 상태의 무범위 수집과 전송은 금지한다.

## 안전 규칙

- Hermes 수집에는 `--hermes-profile <name>`을 반드시 명시한다.
- 세션은 `WHERE profile_name = ?`로 제한한다.
- 메시지는 제한된 세션과 `messages.session_id = sessions.id`로 조인해 읽는다.
- 지정한 프로필과 일치하는 세션이 한 건도 없으면 오타 또는 잘못된 범위로 보고 실패한다.
- 프로필 이름은 전송 payload에 넣지 않으며 체크포인트 파일명에는 SHA-256 축약 해시만 쓴다.
- 프로필별 체크포인트를 분리해 다른 범위의 누적 usage와 dedup 상태가 섞이지 않게 한다.
- 원문, 세션·메시지 ID, 경로, 프로필 이름은 검증 보고에 출력하지 않는다.

## 실행 형태

```sh
aitk agent-telemetry collect \
  --agent <agent-id> \
  --source hermes \
  --sessions-dir <state.db> \
  --hermes-profile <sessions.profile_name> \
  --days 7 \
  --category qa-verify \
  --dry-run
```

실제 전송은 dry-run 집계와 SQLite 읽기 전용 독립 집계가 일치하고, checkpoint가 dry-run
전후 생성·변경되지 않았으며, collection health가 `healthy`인 것을 확인한 뒤 별도로 승인한다.
