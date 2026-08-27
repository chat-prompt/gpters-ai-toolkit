-- Migration: ensure the session/skill-event analytics baseline exists, then add
-- exercise action types (DEV-3064). The baseline was present in the deployed
-- database but was missing from the checked-in SQL history.

DO $$ BEGIN
  CREATE TYPE "session_status" AS ENUM ('active', 'finalized');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mcp_sessions" (
  "session_id" text PRIMARY KEY NOT NULL,
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "access_token_id" text REFERENCES "oauth_access_tokens"("id") ON DELETE SET NULL,
  "client_type" text,
  "client_name" text,
  "client_version" text,
  "ip_hash" text,
  "started_at" timestamp with time zone NOT NULL,
  "last_activity_at" timestamp with time zone NOT NULL,
  "duration_seconds" integer,
  "total_requests" integer DEFAULT 0 NOT NULL,
  "success_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "tool_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "action_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "skill_interactions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "client_context" jsonb,
  "had_search" boolean DEFAULT false NOT NULL,
  "had_view" boolean DEFAULT false NOT NULL,
  "had_deployment" boolean DEFAULT false NOT NULL,
  "search_to_view_conversion" boolean,
  "view_to_deploy_conversion" boolean,
  "avg_response_time" integer,
  "status" "session_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mcp_sessions_user_id_idx" ON "mcp_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "mcp_sessions_started_at_idx" ON "mcp_sessions" ("started_at");
CREATE INDEX IF NOT EXISTS "mcp_sessions_last_activity_idx" ON "mcp_sessions" ("last_activity_at");
CREATE INDEX IF NOT EXISTS "mcp_sessions_status_idx" ON "mcp_sessions" ("status");
CREATE INDEX IF NOT EXISTS "mcp_sessions_client_type_idx" ON "mcp_sessions" ("client_type");
CREATE INDEX IF NOT EXISTS "mcp_sessions_had_deployment_idx" ON "mcp_sessions" ("had_deployment");
--> statement-breakpoint

ALTER TABLE "mcp_audit_logs"
  ADD COLUMN IF NOT EXISTS "client_type" text,
  ADD COLUMN IF NOT EXISTS "client_name" text,
  ADD COLUMN IF NOT EXISTS "client_version" text,
  ADD COLUMN IF NOT EXISTS "session_id" text,
  ADD COLUMN IF NOT EXISTS "search_results" jsonb,
  ADD COLUMN IF NOT EXISTS "referral_source" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mcp_audit_logs_client_type_idx" ON "mcp_audit_logs" ("client_type");
CREATE INDEX IF NOT EXISTS "mcp_audit_logs_session_id_idx" ON "mcp_audit_logs" ("session_id");
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "skill_event_action" AS ENUM ('search', 'load', 'apply', 'skip', 'deploy', 'suggest');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "skill_events" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL REFERENCES "mcp_sessions"("session_id") ON DELETE CASCADE,
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "skill_id" text NOT NULL,
  "action" "skill_event_action" NOT NULL,
  "context" text,
  "query" text,
  "rank" integer,
  "score" real,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "skill_events_session_id_idx" ON "skill_events" ("session_id");
CREATE INDEX IF NOT EXISTS "skill_events_skill_id_idx" ON "skill_events" ("skill_id");
CREATE INDEX IF NOT EXISTS "skill_events_action_idx" ON "skill_events" ("action");
CREATE INDEX IF NOT EXISTS "skill_events_user_id_idx" ON "skill_events" ("user_id");
CREATE INDEX IF NOT EXISTS "skill_events_created_at_idx" ON "skill_events" ("created_at");
CREATE INDEX IF NOT EXISTS "skill_events_skill_action_idx" ON "skill_events" ("skill_id", "action");
--> statement-breakpoint

-- ALTER TYPE ADD VALUE cannot run inside a transaction in PostgreSQL.

ALTER TYPE skill_event_action ADD VALUE IF NOT EXISTS 'exercise_search';
ALTER TYPE skill_event_action ADD VALUE IF NOT EXISTS 'exercise_apply';
