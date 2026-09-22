-- 구독 키 (vendor, plan, owner_name, renewal_day) 유니크 — 동시 apply 두 번이 같은 구독을 두 줄 넣지 못하게 한다 (DEV-4491).
--
-- 구독 동기화 API 는 plan 해시를 트랜잭션 밖에서 확인한 뒤 batch 로 쓴다. 거의 동시에 들어온 apply 둘이
-- 모두 해시 확인을 통과하면 insert 가 두 번 들어간다. 이 제약이 두 번째 batch 를 통째로 실패시키고,
-- API 는 그 실패를 409("다시 plan")로 돌려준다.
--
-- NULLS NOT DISTINCT(PG15+, 운영 PG 17.11): owner_name·renewal_day 는 nullable 이다. 기본 동작이면
-- NULL 끼리는 서로 달라서 팀 공용 구독(owner_name NULL)이 같은 키로 여러 줄 들어갈 수 있다.
-- 코드의 키 함수(subscriptionKey)도 NULL 을 한 값('')으로 묶으므로 DB 도 NULL 을 같은 값으로 본다.
--
-- 기존 행은 바꾸지 않는다. 중복 키가 이미 있으면 이 문장이 실패하고 아무것도 적용되지 않는다
-- (2026-09-22 운영 읽기 전용 확인: 26행, 중복 0, NULL 0).
ALTER TABLE "ax_subscriptions"
  ADD CONSTRAINT "ax_subscriptions_key_uniq"
  UNIQUE NULLS NOT DISTINCT ("vendor", "plan", "owner_name", "renewal_day");
