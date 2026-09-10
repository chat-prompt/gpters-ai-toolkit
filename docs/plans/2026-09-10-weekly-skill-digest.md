# DEV-4280 주간 스킬 소식 — 본문과 스레드 분리

## 변경 범위

- 인기 집계: `skill_events`와 `catalog_items`를 내부 조인한다. 카탈로그에 존재하는 `type=skill`, 발행 상태(`published` 또는 기존 NULL 상태)의 `apply`만 센다. 외부·삭제·초안·agent·command 이벤트는 인기 목록과 합계에서 제외한다.
- 신규·업데이트도 `type=skill`로 제한한다.
- 본문: 지난 7일 많이 쓴 스킬 + 새로 올라온 스킬.
- 스레드: 업데이트된 스킬과 설명 보완 요청을 각각 별도 답글로 쓴다. 빈 구역은 생략한다.
- 인기·신규가 모두 없으면 발송하지 않는다. 업데이트·설명 요청만으로 새 본문을 만들지 않는다.
- 기존 신규 배포 Webhook 알림과 주간 일정은 유지한다.

## 발송 전 검토

이번 작업은 코드 수정과 발송 없는 검증만 한다. 운영 배포·실제 발송은 검토 후 진행한다.

합성 데이터 미리보기:

```sh
node --import tsx apps/web/scripts/preview-popular-skills.ts
```

`out/dev-4280/index.html`, `messages.json`, `preview.md`가 생성된다. 실제 메시지 빌더를 사용하고 네트워크·DB·Slack에 접근하지 않는다.

실데이터를 확인할 때는 인증된 `GET /api/cron/popular-skills?quiet=1` 응답의 `preview.main`과 `preview.replies`를 본다. quiet는 크론 기록을 쓰지 않으며, 실패 알림을 포함해 Slack 발송 함수를 호출하지 않는다. 설명 요약용 모델 호출은 발생할 수 있다.

## 운영 연결 조건

주간 소식은 `chat.postMessage`로 본문을 보낸 뒤 응답 `ts`를 각 답글의 `thread_ts`로 사용한다. 답글의 `reply_broadcast`는 false다. Incoming Webhook은 발송 응답에 ts를 주지 않으므로 이 경로에는 사용하지 않는다.

- `SLACK_BOT_TOKEN`: `chat:write` 권한이 있는 Bot 토큰.
- `SLACK_SKILL_DIGEST_CHANNEL_ID`: 검토한 알림 대상 채널 ID. Bot을 해당 채널에 초대해야 한다.
- 기존 `SLACK_WEBHOOK_URL`은 다른 배포·운영 알림에 계속 사용한다.

이번 작업에서 운영 환경변수 등록 여부와 Bot 권한은 검증하지 않았다. Bot 설정 없이 새 코드를 배포하면 주간 발송은 설정 오류로 기록된다. 설정과 수신 채널 확인 후 배포한다.

HTTP 오류뿐 아니라 Slack `ok:false`도 실패로 처리한다. 부분 발송 실패는 본문 ts와 완료된 답글 수를 오류에 남긴다. 전체 자동 재전송은 하지 않으며, 재실행 전 기존 스레드를 확인한다. 크론 성공 산출량에 `sent`, `repliesSent`를 남기고 응답에는 `delivery.threadTs`를 포함한다.

근거: [Slack chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/), [Incoming Webhooks와 스레드](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/).

## 알림 이후 신규 실행 확인 방법

별도의 수집 기능 없이 기존 `skill_events`를 조회할 수 있다. 확인할 때 다음 세 값을 정한다.

1. 실제 알림에 실린 스킬 ID 목록 — 현재 인기 목록을 다시 계산하지 않고 보낸 메시지에서 고정한다.
2. 실제 본문 발송 시각.
3. 관측 종료 시각 — 예를 들어 발송 후 7일. 기간이 지나기 전에는 중간 결과로 표기한다.

아래는 읽기 전용 조회 예시다. `$1`은 스킬 ID 배열, `$2`는 발송 시각, `$3`은 관측 종료 시각이다. 사용자 이름·실제 운영 값은 이 문서에 넣지 않는다.

```sql
WITH after_send AS (
  SELECT skill_id, user_id, count(*) AS applies, min(created_at) AS first_apply_at
  FROM skill_events
  WHERE action = 'apply'
    AND skill_id = ANY($1::text[])
    AND created_at >= $2::timestamptz
    AND created_at < $3::timestamptz
  GROUP BY skill_id, user_id
)
SELECT a.skill_id,
       sum(a.applies)::int AS applies_after_send,
       count(DISTINCT a.user_id)::int AS users_after_send,
       count(*) FILTER (
         WHERE a.user_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM skill_events prior
           WHERE prior.skill_id = a.skill_id AND prior.user_id = a.user_id
             AND prior.action = 'apply' AND prior.created_at < $2::timestamptz
         )
       )::int AS first_observed_users,
       min(a.first_apply_at) AS first_apply_after_send
FROM after_send a
GROUP BY a.skill_id;
```

결과가 없는 스킬은 관측 기간 내 적용 0건이다. 사용자 ID가 없는 이벤트는 적용 건수에는 포함하지만 신규 사용자로 세지 않는다. `first_observed_users`는 보존된 기록상 첫 사용자다. 과거 유실·계정 변경까지 복원한 평생 최초 사용으로 해석하지 않는다.

이 조회는 **발송 이후 사용**을 확인한다. **알림을 보고 사용했다는 인과관계**를 확인하려면 알림 전용 유입 식별자를 실행 journey까지 연결하는 별도 작업이 필요하다. 이번 수정에는 그 추적 기능을 포함하지 않는다.

