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

## 새 Slack 봇 생성 후 재개 메모

2026-09-10 결정: 기존 복돌이 Slack 앱을 재사용하지 않고 **새 Slack 앱과 Bot User를 만든다.**
새 봇 하나가 아래 두 역할을 함께 맡는다.

1. Vercel Cron이 만든 주간 스킬 소식을 `#toolkit-알림`에 본문과 스레드로 발송한다.
2. Slack 채널에서 멘션을 받거나 DM을 받으면 AI agent로 전달하고, 결과를 같은 스레드에서 답한다.

Slack 봇은 입출력 창구이고 AI agent는 서버에서 실행한다. 대화 문맥은
`team_id + channel_id + thread_ts`를 agent session과 연결해 유지한다. 채널 전체 메시지를 읽는
방식 대신 봇 멘션과 DM만 처리하는 구성을 기본으로 한다.

### Slack 앱 설정

1. [Slack 앱 관리](https://api.slack.com/apps)에서 `From scratch`로 새 앱을 만들고 Gpters 워크스페이스를 선택한다.
2. Bot User의 표시 이름과 아이콘을 정한다. 기존 복돌이와 구분되는 새 봇으로 만든다.
3. OAuth & Permissions의 Bot Token Scopes에 아래 권한을 추가한다.
   - `chat:write`: 정기 알림과 대화 답변 전송
   - `app_mentions:read`: 봇이 참여한 채널에서 봇을 멘션한 메시지 수신
   - `im:history`: 봇에게 온 DM 수신
4. 워크스페이스에 앱을 설치하고 발급된 `xoxb-...` Bot User OAuth Token을 비밀 저장소에만 보관한다.
5. 새 봇을 `#toolkit-알림`에 초대한다. 채널에 초대하지 않고 쓰기 위한 `chat:write.public`은 추가하지 않는다.
6. Event Subscriptions를 켜고 Request URL을 운영 앱의 `/api/slack/events`로 지정한다.
7. Subscribe to bot events에 `app_mention`, `message.im`을 추가하고 앱을 다시 설치한다.
8. Basic Information의 Signing Secret을 비밀 저장소에만 보관한다.

토큰과 Signing Secret은 문서, Git, Slack 메시지에 원문을 남기지 않는다. 새 앱을 실제로 만들 때
앱 이름·아이콘·AI가 응답할 채널 범위는 사용자와 확정한다.

### 애플리케이션 연결

- 기존 주간 발송은 새 봇의 `SLACK_BOT_TOKEN`과 `SLACK_SKILL_DIGEST_CHANNEL_ID=C0AEMKXRG4C`를 사용한다.
- 대화 수신용 `POST /api/slack/events`를 추가하고 `SLACK_SIGNING_SECRET`으로 모든 요청 서명을 검증한다.
- Slack URL 검증 요청에는 challenge를 반환한다.
- 이벤트를 3초 안에 승인하고 durable queue/job에 넣은 뒤 AI 처리를 실행한다.
- `event_id`를 저장해 Slack 재시도에 따른 중복 답변을 막고, 봇이 작성한 메시지는 무시해 응답 루프를 막는다.
- 답변은 원문의 `thread_ts` 또는 `ts`를 `thread_ts`로 지정해 같은 스레드에 쓴다.
- AI 실패 시 해당 스레드에 짧은 오류 메시지를 남기고 운영 로그에 원인을 기록한다.

### 현재 상태와 재개 순서

- 구현 브랜치: `fix/dev-4280-weekly-skill-digest`
- 구현 커밋: `6131d04a`
- Draft PR: [#133](https://github.com/chat-prompt/gpters-ai-toolkit/pull/133)
- Vercel Production의 `SLACK_SKILL_DIGEST_CHANNEL_ID`는 등록되어 있다.
- 새 Slack 앱, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, 대화 이벤트 엔드포인트는 아직 없다.
- PR #133은 주간 알림 발송만 구현하며 AI 대화 수신은 후속 구현 범위다.

재개할 때는 다음 순서로 진행한다.

1. 새 Slack 앱을 만들고 이름·아이콘·권한·이벤트를 설정한다.
2. 새 봇을 `#toolkit-알림`에 초대하고 Bot Token으로 테스트 메시지와 스레드 답글을 보낸다.
3. 확인된 `SLACK_BOT_TOKEN`을 Vercel Production에 등록한다.
4. PR #133의 quiet preview를 확인한 뒤 Ready 전환, 병합, 운영 배포한다.
5. 운영에서 주간 알림 본문과 스레드가 새 봇 이름으로 발송되는지 한 차례 수동 실행으로 검증한다.
6. `/api/slack/events`, 서명 검증, 중복 방지, agent session 연결을 별도 변경으로 구현한다.
7. 테스트 채널의 멘션과 DM에서 대화 연속성, 스레드 응답, 오류 처리를 확인한 뒤 사용할 채널 범위를 넓힌다.

새 봇 생성과 토큰 등록이 끝나기 전에는 PR #133을 병합하지 않는다. 현재 상태만으로는 다음 월요일
자동 발송이 보장되지 않는다.

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
