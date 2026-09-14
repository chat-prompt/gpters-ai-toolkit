# Claude Code 공식 주간 한도 수집 — 로컬 파일럿

## 바뀐 동작

Claude Code가 상태 표시줄 명령의 stdin으로 보내는 공식 JSON에서
`rate_limits.seven_day.used_percentage`와 `resets_at`만 받는다.
첫 응답 전이나 지원하지 않는 로그인 환경에서는 이 필드가 없을 수 있으며, 없음을 0%로 바꾸지 않는다.

- 기존 상태 표시줄 명령에 원본 stdin을 전달하고 stdout을 그대로 출력한다.
- `~/.claude/aitk-usage/claude.json`에는 사용률·리셋·관측 시각·소스·스키마 버전만 기록한다.
- 별도 OAuth 토큰 조회나 기존 `statusline-command.sh` 수정은 필요하지 않다.
- 수집기는 실제 관측 시각이 15분 이내이고 리셋이 지나지 않은 공식 스냅샷을 우선한다.
  공식 수집을 설치한 머신에서는 첫 응답 전에도 OAuth 캐시로 되돌아가지 않는다.
- 최초 유효 입력을 받으면 백그라운드에서 보고한다. 토큰·세션 집계는 UTC 날짜별로 재사용한다.
  사용률 또는 리셋이 바뀌면 그 집계에 최신 한도를 반영해 최대 5분에 한 번 전송한다.
- 성공한 값만 보고 완료로 기록한다. 인증 실패·네트워크 실패·MCP 도구 거부는 5분 후 재시도한다.
  재시도는 다음 상태 표시줄 입력이 들어올 때 실행되며, 여러 세션의 중복 작업은 잠금으로 막는다.
- 서버는 기존 `report_usage` 계약과 upsert를 그대로 사용한다. DB 마이그레이션은 없다.
- `AITK_USAGE_REPORT=0`이면 새 공식 수집·자동 보고를 하지 않는다.

공식 문서: https://code.claude.com/docs/en/statusline

## 2026-09-14 정식 반영

- aitk 0.7.18로 main·npm에 올린다. 파일럿의 `npm link` 절차는 더 이상 필요 없다.
- `aitk usage setup`은 기존 표시줄이 있으면 묻지 않고 감싼다. 없으면 TTY에서 기본 표시줄을
  보여줄지 묻고(`Y/n`), 비대화형에서는 `--display default|none` 또는 `--yes`를 요구한다.
- 선택은 `~/.claude/aitk-usage/statusline.json`의 `display`에 남고 재설치 때 유지된다.
  `display` 없는 파일럿 설치본은 `default`로 읽는다.
- 기본 표시줄은 공식 입력에 있는 값만 그린다: `모델 · ctx N% · 5h N% · 7d N%`.
- 자동 보고는 보고마다 transcript를 다시 읽는다(당일 캐시 재사용은 구현하지 않음). 정수 퍼센트가
  바뀔 때 5분, 같으면 1시간 간격. 에이전트 신원(`~/.config/aitk/agent.json`) 머신은 보내지 않는다.
- `uninstall`은 설정 원복과 함께 스냅샷·보고 상태를 지워 legacy 캐시 경로가 다시 살아난다.
- Claude Code 플러그인 0.1.25에 `usage-setup` 스킬을 넣어 "usage 설정해줘" 요청을
  `status` 조회 → 선택 질문 → `setup --display …` 순서로 안내한다.

## 이 머신의 repo 빌드 테스트 (파일럿 당시 기록)

파일럿 버전은 `0.7.11-native.2`이며 npm 레지스트리에 배포하지 않는다.

```sh
pnpm --filter @gpters/aitk build
cd apps/aitk-cli
npm link --ignore-scripts --offline --no-audit --no-fund
aitk --version
aitk usage setup
```

`npm link`는 이 머신의 명령을 repo 빌드에 연결하며 외부 패키지 배포가 아니다.
Claude Code를 재시작하면 설정이 확실히 적용된다. 이 머신의 2.1.263에서는 실행 중인 세션도
설정 변경을 반영해 실제 공식 입력을 보내는 것을 확인했다.

```sh
aitk usage status
aitk usage report --dry-run  # 전송하지 않고 현재 집계 확인
aitk usage report           # 인증한 본인의 실제 사용량을 즉시 보고
aitk usage uninstall        # AITK가 설치한 명령일 때만 원래 상태 표시줄로 복원
```

`usage status`의 `snapshot`은 현재 로컬 관측값이고 `report.lastQuotaKey`는 마지막으로
전송에 성공한 사용률·리셋 조합이다. 둘이 다르면 5분 제한 안에서 다음 갱신을 기다리는 중일 수 있다.
일반 보고를 7일 구간으로 수동 실행하면 당일 집계 캐시도 새로 채운다.

기존 npm 0.7.4 설치 파일은 로컬 링크 전 `/private/tmp/aitk-npm-0.7.4-before-native`에 보관했다.

## 검증

AITK 단위·통합 테스트, 타입 검사, 번들 빌드를 통과했다.

- 입력 누락·null·잘못된 타입·0%·만료·mtime 조작을 검사한다.
- 설치/재설치/경로 변경/사용자 설정 변경/복구와 원본 stdout 보존을 검사한다.
- 최초 보고/중복 잠금/인증 실패 재시도/한도 변경 시 당일 집계 재사용을 검사한다.
- 통합 테스트는 임시 홈에서 실행하며 실제 홈이나 서버에 테스트 수치를 쓰지 않는다.
- 실제 머신에서 공식 입력과 자동 보고를 관측하고 운영 대시보드의 최하영 행으로 확인한다.

## 팀 배포 때의 안내

현재 구현은 AITK CLI에 수집 연결과 설치를 포함한다. 정식 패키지 배포 후에는 CLI 자체를
업데이트한 다음 `aitk upgrade`를 실행한다. 기존 `aitk upgrade`는 CLI 자체를 갱신하지 않는다.

```sh
npm install -g @gpters/aitk@latest
aitk upgrade
```

(파일럿 당시 계획) `aitk upgrade`가 수집까지 연결하려 했으나 정식 반영에서는 `aitk usage setup`을 별도로 실행한다. 기존 표시줄은 보존한다.
Claude Code 재시작 후 실제 응답을 한 번 받아야 주간 한도 필드가 제공될 수 있다.
이 파일럿은 로컬 검증 단계이며 정식 npm 배포 및 사용자 업그레이드 공지는 별도로 진행한다.
