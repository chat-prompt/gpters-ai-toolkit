CREATE TABLE IF NOT EXISTS "aitk_agent_owners" (
  "agent_id" text PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aitk_agent_credentials" (
  "agent_id" text PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "org_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "allow_deploy" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aitk_agent_events" (
  "request_id" text NOT NULL,
  "id" text PRIMARY KEY NOT NULL,
  "agent_id" text NOT NULL,
  "tool" text NOT NULL,
  "skill_id" text,
  "status" text NOT NULL,
  "details" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "aitk_agent_events_agent_created_idx" ON "aitk_agent_events" ("agent_id", "created_at");
