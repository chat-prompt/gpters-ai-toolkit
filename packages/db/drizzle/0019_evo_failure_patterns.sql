-- EvoSkill: Automated skill evolution tables
-- Adds failure pattern detection + run audit logs + catalogItems evo columns

-- Enums
DO $$ BEGIN
  CREATE TYPE "evo_pattern_type" AS ENUM('zero_result_cluster', 'low_conversion', 'repeated_skip');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "evo_severity" AS ENUM('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "evo_pattern_status" AS ENUM('pending', 'processing', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "evo_run_type" AS ENUM('analyze', 'generate', 'promote');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- evo_failure_patterns table
CREATE TABLE IF NOT EXISTS "evo_failure_patterns" (
  "id" text PRIMARY KEY NOT NULL,
  "pattern_type" "evo_pattern_type" NOT NULL,
  "signal_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "severity" "evo_severity" NOT NULL DEFAULT 'low',
  "status" "evo_pattern_status" NOT NULL DEFAULT 'pending',
  "resolved_action" text,
  "resolved_item_id" text,
  "analyzed_at" timestamp with time zone DEFAULT now(),
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evo_failure_patterns_status_idx" ON "evo_failure_patterns" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evo_failure_patterns_type_idx" ON "evo_failure_patterns" USING btree ("pattern_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evo_failure_patterns_severity_idx" ON "evo_failure_patterns" USING btree ("severity");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evo_failure_patterns_created_at_idx" ON "evo_failure_patterns" USING btree ("created_at");
--> statement-breakpoint

-- evo_run_logs table
CREATE TABLE IF NOT EXISTS "evo_run_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "run_type" "evo_run_type" NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "stats" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evo_run_logs_run_type_idx" ON "evo_run_logs" USING btree ("run_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evo_run_logs_started_at_idx" ON "evo_run_logs" USING btree ("started_at");
--> statement-breakpoint

-- Add evo columns to catalog_items
ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "evo_generated" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "evo_pattern_id" text;
