-- 실행 시작과 완료를 분리하고, 런타임 종류와 실제 에이전트 식별자를 구분한다.
ALTER TYPE "ax_execution_status" ADD VALUE IF NOT EXISTS 'running';
--> statement-breakpoint

ALTER TABLE "ax_skill_execution_attempts"
  ADD COLUMN IF NOT EXISTS "agent_id" text,
  ADD COLUMN IF NOT EXISTS "start_observed" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
--> statement-breakpoint

UPDATE "ax_skill_execution_attempts"
SET
  "agent_id" = COALESCE("agent_id", "agent"),
  "started_at" = COALESCE("started_at", "occurred_at"),
  "completed_at" = COALESCE("completed_at", "occurred_at")
WHERE "agent_id" IS NULL OR "started_at" IS NULL OR "completed_at" IS NULL;
--> statement-breakpoint

ALTER TABLE "ax_skill_execution_attempts"
  ALTER COLUMN "agent_id" SET NOT NULL,
  ALTER COLUMN "started_at" SET NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "ax_execution_event_phase" AS ENUM ('started', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ax_skill_execution_events" (
  "event_id" text PRIMARY KEY NOT NULL,
  "attempt_id" text NOT NULL REFERENCES "ax_skill_execution_attempts"("attempt_id") ON DELETE CASCADE,
  "phase" "ax_execution_event_phase" NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

INSERT INTO "ax_skill_execution_events" ("event_id", "attempt_id", "phase", "occurred_at")
SELECT "event_id", "attempt_id", 'completed', "occurred_at"
FROM "ax_skill_execution_attempts"
ON CONFLICT ("event_id") DO NOTHING;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ax_skill_execution_attempts_agent_id_idx"
  ON "ax_skill_execution_attempts" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_skill_execution_attempts_started_at_idx"
  ON "ax_skill_execution_attempts" ("started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_skill_execution_attempts_completed_at_idx"
  ON "ax_skill_execution_attempts" ("completed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_skill_execution_events_attempt_idx"
  ON "ax_skill_execution_events" ("attempt_id");
