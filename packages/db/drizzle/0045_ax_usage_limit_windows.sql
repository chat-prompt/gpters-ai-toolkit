-- 주간 한도 회차별 최댓값 (EDU-11519)
--
-- ax_client_usage 는 UTC 하루 단위 행을 덮어써서, 같은 날 한도가 초기화되면 초기화 직전 값이 사라진다.
-- report_usage 가 보고를 받을 때마다 (사용자, 클라이언트, 초기화 시각) 회차의 최댓값만 올려 둔다.
-- 새 테이블만 만들고 기존 행은 건드리지 않는다. 옛 코드는 이 테이블을 모르므로 코드보다 먼저 적용해도 안전하다.
-- 새 코드는 테이블이 없으면 이 기록만 건너뛰고 사용량 보고는 그대로 받는다.
CREATE TABLE IF NOT EXISTS "ax_usage_limit_windows" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "client" "ax_usage_client" NOT NULL,
  "resets_at" timestamp with time zone NOT NULL,
  "member_name" text NOT NULL,
  "max_used_percent" numeric(5, 2) NOT NULL,
  "first_reported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_reported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ax_usage_limit_windows_user_id_client_resets_at_pk" PRIMARY KEY ("user_id", "client", "resets_at")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ax_usage_limit_windows_resets_at_idx"
  ON "ax_usage_limit_windows" ("resets_at");
