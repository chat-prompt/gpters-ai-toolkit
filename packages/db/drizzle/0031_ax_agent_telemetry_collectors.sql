-- 설치형 에이전트 텔레메트리 수집기와 개별 credential 상태.
-- 원문·로컬 경로·프로젝트 이름·credential 원문은 저장하지 않는다.
CREATE TABLE IF NOT EXISTS "ax_agent_telemetry_collectors" (
  "collector_id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "agent_id" text NOT NULL,
  "source" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "interval_seconds" integer NOT NULL DEFAULT 21600,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_seen_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "last_window_end" timestamp with time zone,
  "last_batch_id" text,
  "last_health_status" text,
  "last_health_warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "last_records_read" integer NOT NULL DEFAULT 0,
  "last_parse_failures" integer NOT NULL DEFAULT 0,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ax_agent_telemetry_collector_source_check"
    CHECK ("source" IN ('openclaw', 'claude-code', 'codex', 'hermes')),
  CONSTRAINT "ax_agent_telemetry_collector_interval_check"
    CHECK ("interval_seconds" BETWEEN 600 AND 604800),
  CONSTRAINT "ax_agent_telemetry_collector_health_check"
    CHECK ("last_health_status" IS NULL OR "last_health_status" IN ('healthy', 'blocked')),
  CONSTRAINT "ax_agent_telemetry_collector_counts_check"
    CHECK ("last_records_read" >= 0 AND "last_parse_failures" >= 0)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ax_agent_telemetry_collector_agent_source_uidx"
  ON "ax_agent_telemetry_collectors" ("agent_id", "source")
  WHERE "is_active" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_agent_telemetry_collector_user_idx"
  ON "ax_agent_telemetry_collectors" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_agent_telemetry_collector_freshness_idx"
  ON "ax_agent_telemetry_collectors" ("last_success_at");
