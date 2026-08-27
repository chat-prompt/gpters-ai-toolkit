-- 운영 기준선 뒤에 개인정보 비포함 에이전트 사용량 delta batch만 멱등 저장한다.
CREATE TABLE IF NOT EXISTS "ax_agent_telemetry_batches" (
  "batch_id" text PRIMARY KEY NOT NULL,
  "schema_version" text NOT NULL,
  "agent_id" text NOT NULL,
  "collector_instance_id" text NOT NULL,
  "runtime" jsonb NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "window_end" timestamp with time zone NOT NULL,
  "collected_at" timestamp with time zone NOT NULL,
  "input_tokens" bigint NOT NULL DEFAULT 0,
  "output_tokens" bigint NOT NULL DEFAULT 0,
  "cache_creation_input_tokens" bigint NOT NULL DEFAULT 0,
  "cache_read_input_tokens" bigint NOT NULL DEFAULT 0,
  "thinking_tokens" bigint NOT NULL DEFAULT 0,
  "thinking_tokens_relation" text NOT NULL,
  "sessions" integer NOT NULL DEFAULT 0,
  "turns" integer NOT NULL DEFAULT 0,
  "models" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "tools" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "skill_loads" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "task_categories" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "executions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "collection" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ax_agent_telemetry_window_order_check" CHECK ("window_end" > "window_start"),
  CONSTRAINT "ax_agent_telemetry_token_counts_check" CHECK (
    "input_tokens" >= 0 AND "output_tokens" >= 0
    AND "cache_creation_input_tokens" >= 0 AND "cache_read_input_tokens" >= 0
    AND "thinking_tokens" >= 0
  ),
  CONSTRAINT "ax_agent_telemetry_activity_counts_check" CHECK ("sessions" >= 0 AND "turns" >= 0),
  CONSTRAINT "ax_agent_telemetry_thinking_relation_check" CHECK (
    "thinking_tokens_relation" IN ('included-in-output', 'separate-from-output', 'unknown')
  )
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ax_agent_telemetry_agent_window_idx"
  ON "ax_agent_telemetry_batches" ("agent_id", "window_end");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_agent_telemetry_collected_idx"
  ON "ax_agent_telemetry_batches" ("collected_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ax_agent_telemetry_collector_window_uidx"
  ON "ax_agent_telemetry_batches" (
    "agent_id", "collector_instance_id", "window_start", "window_end"
  );
