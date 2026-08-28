# AX 격리 로컬 환경

AX 대시보드와 0025–0031 마이그레이션을 운영 DB와 분리해 확인하는 환경이다. 컨테이너는
`colima-gpters-ax`라는 전용 Colima 프로필에서 실행되고, PostgreSQL은 `127.0.0.1:55432`에만
노출된다. 운영 데이터는 복사하지 않았으며 현재 볼륨에는 운영의 **스키마만** 가져온 기준선과
합성 테스트 데이터가 들어 있다.

## 왜 Colima인가

- Docker CLI와 Compose 파일을 그대로 사용하면서 MIT 라이선스로 팀/상업 용도 제약이 없다.
- Apple Silicon에서 macOS Virtualization Framework(`vz`)를 사용하고, 별도 Docker Desktop
  데몬과 분리된 context를 제공한다.
- OrbStack은 사용성과 성능이 좋지만 회사 사용에는 유료 라이선스가 필요하다.
- Podman도 가능하지만 Docker socket/Compose 호환 계층을 추가로 관리해야 한다.

이 선택은 로컬 개발 환경만 바꾼다. 이미지와 Compose 파일은 표준 OCI/Docker 형식이므로 나중에
Docker Desktop이나 다른 런타임으로 옮길 수 있다.

## 최초 준비

```bash
brew install colima docker docker-compose
colima start --profile gpters-ax --runtime docker --vm-type vz --cpu 2 --memory 4 --disk 24
cp infra/ax-local/local.env.example apps/web/.env.ax-local
```

`apps/web/.env.ax-local`은 Git에 포함되지 않는 로컬 전용 파일이다. 실제 운영 연결 문자열을 이 파일에
넣지 않는다.

## 평소 실행

저장소 루트에서 다음 순서로 실행한다.

```bash
pnpm ax:local:up
pnpm ax:local:status
pnpm ax:local:preflight
pnpm ax:local:dev
```

브라우저에서 <http://localhost:3002/en/ax>를 연다. 일반 개발 서버의 기본 3000번 포트 및
브라우저 HMR 캐시와 충돌하지 않도록 격리 환경은 3002번을 사용한다. `ax:local:preflight`의 Target은 반드시
`127.0.0.1/gpters_ax_local (local)`이어야 한다.

웹 서버는 `apps/web/.env.ax-local`을 먼저, 기존 `apps/web/.env.local`을 나중에 읽는다. 따라서 DB와
개발 인증 우회는 격리 설정을 사용하고, GitHub/Vercel 조회처럼 이 파일에 없는 값만 기존 로컬 설정을
사용한다. 운영 배포 설정은 바뀌지 않는다.

## 격리 테스트 에이전트

기존 사내 Claude/Codex 에이전트를 건드리지 않고 실행 결과 보고 흐름을 확인하려면 웹 서버를
3002번에서 실행한 상태로 다음 명령을 실행한다.

```bash
pnpm ax:local:test-agent
```

테스트 에이전트는 별도 `node:22-alpine` 컨테이너에서 `local-skill-60`을 로드하고, 작은 JSON
산출물을 `/tmp`에 만든 뒤 정합성을 검증한다. 실제 적용 직전에 `report_skill_execution_started`,
검증 뒤 `report_skill_outcome`과 `report_skill_execution`을 호출하고 완료 `eventId`를 한 번 더 보내 멱등성도 확인한다. 실행
스크립트는 DB에서 `test-agent · success · artifact=true` 한 행만 생성됐는지 검사한다.

- 호스트 홈·Claude/Codex 설정·소스 저장소는 컨테이너에 마운트하지 않는다.
- 루트 파일시스템은 읽기 전용이고 `/tmp` 16MB만 쓸 수 있다.
- Linux capability를 모두 제거하고 메모리 128MB, 프로세스 64개로 제한한다.
- 서버 URL은 localhost 계열만 허용한다.
- 인증 문자열은 격리 DB에만 존재하는 공개된 로컬 fixture 값이며 운영에서는 유효하지 않다.

기존에 만들어 둔 격리 DB가 테스트 에이전트 도입 전 상태라면 최초 한 번 다음 SQL을 적용한다.

```bash
docker-compose --context colima-gpters-ax -f infra/ax-local/compose.yml exec -T postgres \
  psql -U gpters -d gpters_ax_local -v ON_ERROR_STOP=1 -f /ax-local/refresh-test-agent.sql
```

## 빈 DB 재현 검증

전체 마이그레이션과 합성 fixture가 깨끗한 PostgreSQL에서도 재현되는지는 다음 한 명령으로 확인한다.

```bash
pnpm ax:local:verify-rebuild
```

이 명령은 같은 격리 컨테이너 안의 `gpters_ax_rebuild` DB만 삭제 후 다시 만든다. 평소 localhost가
사용하는 `gpters_ax_local` DB와 PostgreSQL 볼륨은 건드리지 않는다. 과거에 journal에서 누락되었던
`0008_full_text_search.sql`도 명시적으로 포함한다. 조직 기능은 원래 SQL 파일이 아닌 프로그램형
마이그레이션으로 도입되었으므로 `bootstrap-org-support.sql`로 그 스키마 전제만 재현한다. 이후 0024가
요구하는 단일 활성 `gpters` 조직을 합성 fixture로 만든 다음 0024–0031을 순서대로 적용한다. 마지막에는
활성 구성원, 스킬, 사용자 연결 사용량, 여정 fixture, 실행 결과, 에이전트 telemetry batch와 빈 collector registry를 SQL
assertion으로 검증한다.

## 에이전트 telemetry 수신 확인

`apps/web/.env.ax-local`에 로컬 전용 `AX_AGENT_TELEMETRY_TOKEN`을 설정하고 3002번 웹 서버를
실행한 뒤, PII-free fixture를 보낼 수 있다.

```bash
curl -sS http://127.0.0.1:3002/api/ax/agent-telemetry \
  -H 'Authorization: Bearer ax-local-telemetry-only' \
  -H 'Content-Type: application/json' \
  --data-binary @infra/ax-local/fixtures/agent-telemetry-bbodoong.json
```

첫 요청은 `{"ok":true,"inserted":true}`, 같은 batch를 다시 보내면
`{"ok":true,"inserted":false}`가 정상이다. 수신부는 원문·raw session ID·경로를 받지 않으며,
운영 토큰이나 실제 트랜스크립트를 이 fixture 또는 로컬 env에 넣지 않는다.

OpenClaw collector 자체는 합성 session JSONL로 다음처럼 확인한다. `--dry-run`은 checkpoint를
만들지 않고 서버에도 보내지 않는다.

```bash
corepack pnpm --filter @gpters/aitk exec tsx bin/aitk.ts \
  agent-telemetry collect \
  --agent bbodoong \
  --sessions-dir ../../infra/ax-local/fixtures \
  --checkpoint-dir /tmp/gpters-aitk-agent-pilot \
  --days 7 \
  --category qa-verify \
  --dry-run
```

## 종료와 데이터 보존

웹 서버에서 `Ctrl-C`를 누른 뒤 다음을 실행한다.

```bash
pnpm ax:local:down
colima stop --profile gpters-ax
```

`ax:local:down`은 PostgreSQL 볼륨을 보존한다. `docker-compose ... down -v`는 합성 데이터와 준비된
스키마를 모두 삭제하므로, 기준선을 처음부터 재구성하려는 경우 외에는 실행하지 않는다.

## 현재 검증용 데이터

- 구성원 21명 중 활성 20명, 정지·퇴사 1명
- 주간 활성 2명, 수집기는 정상이나 최근 사용 기록이 없는 구성원 1명
- 수집 상태 예시: 7일 초과 미보고 1명, 승인 후 수집 미확인 1명, 활성 승인 없음 15명
- 카탈로그 스킬 60개
- 기본 스킬 이벤트 77건에 여정 비교용 이벤트 10건 추가
- 사용량 3행: 사용자 ID 연결 및 중복 정리 완료
- 활성 구독 3건, 월 $420
- 여정 4종: 검색 후 적용, 검색 후 미적용, 결과 미보고, 검색 없는 직접 로드
- 실행 결과 6종: 검증 성공, 부분 성공, 실패, 중단, 진행 중, 완료 보고 누락
- 에이전트 telemetry 5개 batch: 활성 4개 에이전트의 현재 구간과 비교용 이전 구간

합성 fixture는 `seed-pre-0026.sql`과 `seed-post-0028.sql`에 나뉜다. 전자는 마이그레이션 전 백필·중복
정리를 검증하고, 후자는 heartbeat·승인 상태·퇴사 상태를 검증한다. `refresh-demo-states.sql`,
`refresh-journey-demo.sql`, `refresh-execution-demo.sql`, `refresh-agent-telemetry-demo.sql`은 기존 로컬 DB에서 각 예시만 안전하게 다시
맞출 때 사용한다.

## 안전 경계

- 범용 `pnpm db:migrate`는 사용하지 않는다. 저장소의 Drizzle journal과 과거 운영 이력이 아직
  정합하지 않다.
- 운영 적용은 이 환경의 목적이 아니다. 운영 반영 전에는 별도 승인, 복원 지점, 프리플라이트가 필요하다.
- 로컬 앱의 기본 DB 드라이버는 `postgres-js`, 운영의 기본값은 기존 `neon-http`로 유지된다.
