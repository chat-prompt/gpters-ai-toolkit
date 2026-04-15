-- EvoSkill: add retry tracking + failed status to break zombie pattern loops

ALTER TYPE "evo_pattern_status" ADD VALUE IF NOT EXISTS 'failed';
--> statement-breakpoint

ALTER TABLE "evo_failure_patterns" ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "evo_failure_patterns" ADD COLUMN IF NOT EXISTS "last_error" text;
