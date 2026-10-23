-- 주간 한도 회차의 첫 관측 사용률 (EDU-11519)
--
-- 회차 기록은 최댓값만 남겨 "초기화 시각만 옮겨 가고 사용률이 이어진 회차"와 "초기화된 뒤 다시 오른 회차"를 가르지 못했다
-- (2026-10-22 한가경 Claude: 94% 회차 뒤 95% 회차). 회차를 처음 받을 때의 사용률을 남겨 다음 회차가 어디서 시작했는지 본다.
-- 두 회차 테이블에 nullable 컬럼 하나씩만 더한다. 기존 행은 null 로 남는다(첫 값을 모른다).
-- 새 코드는 insert·select 에 이 컬럼을 나열하므로 코드보다 먼저 적용해야 한다. 옛 코드는 모르므로 먼저 적용해도 안전하다.
ALTER TABLE "ax_usage_limit_windows" ADD COLUMN IF NOT EXISTS "first_used_percent" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "ax_account_limit_windows" ADD COLUMN IF NOT EXISTS "first_used_percent" numeric(5, 2);
