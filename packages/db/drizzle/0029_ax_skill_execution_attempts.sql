-- 검증 가능한 스킬 실행 결과를 기존 apply/skip 자기보고와 분리해 저장한다.
DO $$ BEGIN
  CREATE TYPE "ax_execution_source" AS ENUM ('aitk', 'bbopters-shared');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "ax_execution_status" AS ENUM ('success', 'partial', 'failed', 'abandoned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "ax_execution_failure_stage" AS ENUM ('load', 'instruction', 'dependency', 'execution', 'validation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "ax_execution_validation_method" AS ENUM ('test', 'command', 'artifact', 'user_confirmation', 'none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ax_skill_execution_attempts" (
  "attempt_id" text PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL UNIQUE,
  "session_id" text NOT NULL REFERENCES "mcp_sessions"("session_id") ON DELETE CASCADE,
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "source" "ax_execution_source" NOT NULL,
  "skill_id" text NOT NULL,
  "skill_version" text,
  "agent" text NOT NULL,
  "status" "ax_execution_status" NOT NULL,
  "failure_stage" "ax_execution_failure_stage",
  "error_code" text,
  "validation_method" "ax_execution_validation_method" NOT NULL DEFAULT 'none',
  "validation_passed" boolean,
  "validation_summary" text,
  "user_accepted" boolean,
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ax_skill_execution_attempts_skill_idx"
  ON "ax_skill_execution_attempts" ("skill_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_skill_execution_attempts_user_idx"
  ON "ax_skill_execution_attempts" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_skill_execution_attempts_occurred_idx"
  ON "ax_skill_execution_attempts" ("occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ax_skill_execution_attempts_status_idx"
  ON "ax_skill_execution_attempts" ("status");
