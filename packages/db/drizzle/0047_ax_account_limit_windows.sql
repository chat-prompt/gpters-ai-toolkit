-- 공용 구독 계정의 주간 한도 회차별 최댓값 (EDU-11519)
--
-- 봇이 쓰는 공용·서포트 구독은 한 사람에게 묶이지 않아 ax_usage_limit_windows(사용자 기준)로 잇지 못한다.
-- 봇 수집기가 /api/ax/agent-telemetry/limits 로 계정 이메일 해시(account_key)를 실어 오면 (클라이언트, 계정, 초기화 시각) 회차의 최댓값만 올려 둔다.
-- account_key 는 소문자·trim 한 계정 이메일의 sha256 hex 다. 원문 이메일은 저장하지 않는다.
-- ax_subscriptions.account_key 는 구독 시트 동기화가 공용·서포트 행에만 같은 해시를 실어 두 테이블을 잇는다.
-- 새 테이블과 nullable 컬럼만 더하고 기존 행은 건드리지 않는다. 옛 코드는 둘 다 모르므로 코드보다 먼저 적용해도 안전하다.
CREATE TABLE IF NOT EXISTS "ax_account_limit_windows" (
  "client" "ax_usage_client" NOT NULL,
  "account_key" text NOT NULL,
  "resets_at" timestamp with time zone NOT NULL,
  "max_used_percent" numeric(5, 2) NOT NULL,
  "first_reported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_reported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "agent_ids" text[] DEFAULT '{}' NOT NULL,
  CONSTRAINT "ax_account_limit_windows_client_account_key_resets_at_pk" PRIMARY KEY ("client", "account_key", "resets_at"),
  CONSTRAINT "ax_account_limit_windows_account_key_check" CHECK ("account_key" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ax_account_limit_windows_resets_at_idx"
  ON "ax_account_limit_windows" ("resets_at");
--> statement-breakpoint

ALTER TABLE "ax_subscriptions" ADD COLUMN IF NOT EXISTS "account_key" text;
--> statement-breakpoint

-- 이미 있으면 건너뛴다 (ADD CONSTRAINT 는 IF NOT EXISTS 를 받지 않는다)
DO $$ BEGIN
  ALTER TABLE "ax_subscriptions"
    ADD CONSTRAINT "ax_subscriptions_account_key_check" CHECK ("account_key" ~ '^[a-f0-9]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
