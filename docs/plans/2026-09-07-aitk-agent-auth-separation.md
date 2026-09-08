# AITK 에이전트 인증 분리

## 문제와 변경

맥미니의 AITK를 개인 계정으로 로그인하면 에이전트의 검색·사용량 보고가 사람 활동으로
기록된다. 관리 소유자와 활동 주체를 분리한다. 수집기와 일반 AITK 인증도 용도가 다르므로
서로 다른 토큰을 사용한다.

- 수집기 등록은 소유자 머신에서 `agent-telemetry authorize`로 수행한다. 에이전트에는
  `agt_` 수집기 자격증명만 SSH 표준입력으로 전달하고 `install --enrollment-stdin`으로 설치한다.
- 일반 스킬 작업은 `aia_` 에이전트 자격증명과 `/api/agents/mcp`를 사용한다.
  등록·해지 소유자는 사람이지만 요청 기록의 주체는 서버에 저장된 agent ID다.
- 개인 토큰은 에이전트 머신으로 전송하지 않는다. 에이전트 모드가 설정돼 있으면 Keychain
  실패 시에도 환경변수·개인 설정·Claude OAuth로 대체하지 않는다.
- 에이전트의 `usage report`는 로컬 집계 전에 중지된다. 서버도 개인 사용량·개인 세션 보고,
  관리자 도구·삭제·계정 관리 작업을 거부한다.
- 일반 검색·로드·결과 보고·실행 보고를 지원한다. 배포는 소유자가 `--allow-deploy`로 명시한
  경우에만 허용하며, 소유자의 관리자 우회 권한은 상속하지 않는다. 스킬 자산 소유자는
  사람/조직으로 유지되지만 활동 영수증은 `aitk_agent_events`에 에이전트 명의로 기록된다.
- 실행 증거는 기존 에이전트 실행 테이블에 `userId=NULL`로 기록한다. 시작/완료의 기존 행
  수정에는 주체·에이전트·스킬 일치 조건을 적용해 다른 사람의 시도를 덮어쓰지 않는다.
- 사람 `skill_events`, 사람 세션 및 사용량 테이블에는 에이전트 API 요청을 기록하지 않는다.
  새 요청 기록은 수집기 토큰/도구 집계와 합산하지 않아 이중 계상하지 않는다.

## 소유자 머신

현재 계정을 `aitk whoami`로 먼저 확인한다. 발급 파일은 전용 비공개 디렉터리에 두고
Slack·메일·명령행 인수로 토큰을 공유하지 않는다. 출력 파일은 0600, 배타적 생성이다.

```sh
aitk agent authorize --agent example-agent --org <organization-id> --output /private/path/agent.json
aitk agent list
aitk agent revoke --agent example-agent
aitk agent revoke --all
```

인증은 90일 후 만료한다. 동일 소유자만 회전/해지할 수 있으며, 다른 소유자의 agent ID는
동시 등록을 포함해 거부한다. 이미 텔레메트리 소유자가 있는 ID도 다른 사람이 가져갈 수 없다.
소유자 계정 정지 또는 조직 멤버십 비활성화 시 에이전트 인증은 실패한다.
외부 계정 접근 승인 취소도 다음 인증 요청부터 적용한다. 다중 조직 소유자는 `--org`로
조직을 선택해야 한다. 목록에는 조직·권한·만료·활성 상태만 반환하며 토큰과 해시는 반환하지 않는다.

개인 OAuth 인증에는 전용 장기 자격증명을 발급할 권한이 있다. 개인 토큰이 노출되면 해당
개인 토큰을 폐기하고 `aitk agent list`로 확인한 뒤 `aitk agent revoke --all`로 파생 인증도 폐기한다.
동일 ID로 `authorize`를 다시 실행하면 토큰이 즉시 회전하므로 기존 에이전트에 새 토큰을 다시 등록해야 한다.
기본은 검색·읽기·보고만 허용한다. `--allow-deploy`를 선택해도 등록된 조직에서 소유자 본인 명의의
자산 생성·수정만 허용하며, 같은 조직의 다른 사람 자산 수정은 거부한다.

## 에이전트 머신

소유자가 만든 파일의 내용을 SSH stdin으로 전달한다.

```sh
aitk agent import --credential-stdin --credential-store file
aitk whoami
aitk agent status
```

가져오기 전에 서버의 whoami와 agent ID·배포 범위 일치를 확인한다. 토큰은 선택한 저장소에,
비밀이 아닌 agent ID와 서버 주소만 `~/.config/aitk/agent.json`에 저장한다.
`aitk agent disconnect`는 로컬 자격증명과 모드를 제거한다. 서버 취소는 소유자 머신에서 한다.
일반 MCP 클라이언트가 기존 개인 OAuth 연결을 쓰고 있다면 이 CLI 설정만으로 그 연결이
변경되지는 않는다. 에이전트는 기존 개인 MCP 인증 없이 이 CLI 경로로 사용해야 한다.

결과·검색 생략 보고의 검증된 내용은 `aitk_agent_events.details`에 기록한다.
개인 이벤트 테이블에 기록하지 않으며, 에이전트 요청 영수증과 수집량을 합산하지 않는다.

## 배포 및 검증

- 마이그레이션: `0039_aitk_agent_identity.sql`, 새 테이블 3개. 기존 사용자/집계 데이터는 수정하지 않는다.
- CLI 최종 버전: `0.7.12`. npm 공개 배포 없이 repo에서 설치한다.
- 웹 단위 테스트, CLI 단위 테스트, lint, CLI 타입 검사, 전체 배포 빌드로 검증한다.
- 실제 SQL 인증 경계는 `packages/db/tests/agent-identity.integration.ts`로 검증한다.
  빈 `127.0.0.1/aitk_agent_auth_test` DB와 `CONFIRM_ISOLATED_AGENT_AUTH_TESTS=run-isolated-agent-auth-tests`
  및 `TEST_DATABASE_URL`을 명시해야 한다. 운영 환경 파일은 불러오지 않는다.
- API/E2E 전체 테스트는 공유 DB에 실행하지 않는다. 기존 CI의 E2E 작업이 공유 DATABASE_URL을
  사용하므로 이 변경은 `[skip ci]`로 올리고 위 로컬 검증과 Vercel 빌드를 기록한다.

## 무인 머신의 로컬 파일 저장

- `agent import`와 `agent-telemetry install`에 `--credential-store file`을 명시하면
  `~/.config/aitk/credentials/`(0700)의 전용 파일(0600)에 에이전트 또는 수집기 토큰만 저장한다.
  설정·launchd plist·로그에는 토큰을 쓰지 않는다. Apple 계정이나 Keychain 비밀번호는 필요 없다.
- 같은 OS 사용자나 root는 이 파일을 읽을 수 있다. 디스크 암호화와 OS 계정 보호가 별도로 필요하다.
  Keychain이 실패했다고 자동으로 파일 저장으로 전환하지 않는다.
- 기존 Keychain 설치의 기본값과 읽기 경로는 유지한다. 파일 읽기 실패·잘못된 권한·링크는 거부하며,
  개인 인증으로 대체하지 않는다.
- 소유자 머신에서 서버 수집기 등록을 취소한 뒤 에이전트 머신에서
  `aitk agent-telemetry uninstall --agent <id> --source <source> --local-only`로 예약과 로컬 토큰을 제거한다.
  이 명령은 서버 취소를 수행하지 않으며 결과의 `revoked`는 false로 표시한다.
- 일반 에이전트와 수집기는 `aitk_agent_owners`의 공통 agent ID 소유권을 원자적으로 확보한다.
  먼저 등록한 소유자만 다른 인증 종류를 추가할 수 있고, 해지는 소유권 이전을 의미하지 않는다.
  등록이 중간에 실패해도 소유권 예약은 유지되며 같은 소유자가 재시도할 수 있다.
