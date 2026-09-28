# 개인 Codex 사용량 수집 정확도

2026-09-08 에 설계하고 2026-09-28 에 main 에 반영했다(DEV-4512). 같은 설계에서 나온 에이전트 수집기 쪽 수정은 먼저 main 에 들어갔고(#117 등), SessionStart 훅의 "성공 후 스탬프" 변경은 반영하지 않았다 — 훅은 여전히 실행 전에 스탬프를 찍는다.

## 변경 범위 (`apps/aitk-cli/src/usage/codex.ts`)

- 개인 Codex 수집기도 에이전트 수집기와 같은 누적 스냅샷 식별 함수(`cumulativeUsageIdentity`, `codex-usage.ts`)를 쓴다. 누적값 자체는 더하지 않는다. 세션별 반복 이벤트를 제외하고, 기간 직전 이벤트가 기간 안에서 다시 찍혀도 새 사용으로 세지 않는다.
- Codex 한도는 `primary`/`secondary` 중 `window_minutes=10080`인 창만 주간 한도로 쓴다. 창을 확인할 수 없으면 추정하지 않는다. 사용량이 중복되거나 없는 이벤트에 담긴 새 한도도 읽는다.

## 검증

- `apps/aitk-cli/tests/usage/collectors.test.ts` 에 주간 창 선택, 반복 스냅샷, 기간 경계 재방출, 한도만 있는 이벤트를 검사하는 테스트를 둔다.
- 운영 API/E2E 테스트는 실행하지 않는다. 서버 계약·DB 스키마는 바뀌지 않는다.

## 참고

[Tencent/teamai-cli](https://github.com/Tencent/teamai-cli/tree/0ec7b77b3663b9f72bb8b0b4532e722be6c1c159)의 도구별 어댑터와 [성공 후 보고 이벤트 정리](https://github.com/Tencent/teamai-cli/blob/0ec7b77b3663b9f72bb8b0b4532e722be6c1c159/src/usage-tracker.ts)를 비교했다. 코드를 복사하거나 의존성으로 추가하지 않았다.

## 남은 한계

이미 적재된 과거 수치는 이번 코드 수정만으로 바뀌지 않는다. 사용자가 aitk 를 이 버전 이상으로 올려야 적용된다.
