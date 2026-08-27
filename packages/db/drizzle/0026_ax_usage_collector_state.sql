-- AX 사용량 수집 참여 상태
--
-- 사용량이 0건이어도 사용자별 마지막 점검 시각을 남긴다. 이 신호가 있어야
-- "최근 실제 사용 없음"과 "수집기 미설치/미보고"를 구분할 수 있다.
CREATE TABLE IF NOT EXISTS "ax_usage_collector_state" (
  "user_id" text PRIMARY KEY NOT NULL
    REFERENCES "users"("id") ON DELETE CASCADE,
  "member_name" text NOT NULL,
  "clients" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "record_count" integer DEFAULT 0 NOT NULL,
  "last_reported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ax_usage_collector_state_last_reported_idx"
  ON "ax_usage_collector_state" ("last_reported_at");
