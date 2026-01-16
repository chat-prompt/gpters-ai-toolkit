-- Migration: Replace mcp_tokens with oauth_access_tokens
-- This migration:
-- 1. Creates oauth_access_tokens table for OAuth 2.1 access tokens
-- 2. Migrates mcp_audit_logs from token_id to access_token_id
-- 3. Drops the legacy mcp_tokens table

-- Step 1: Create oauth_access_tokens table
CREATE TABLE "oauth_access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scope" text,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

-- Step 2: Add foreign keys to oauth_access_tokens
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Step 3: Create indexes for oauth_access_tokens
CREATE INDEX "oauth_access_tokens_token_hash_idx" ON "oauth_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_user_id_idx" ON "oauth_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_client_id_idx" ON "oauth_access_tokens" USING btree ("client_id");--> statement-breakpoint

-- Step 4: Add access_token_id column to mcp_audit_logs
ALTER TABLE "mcp_audit_logs" ADD COLUMN "access_token_id" text;--> statement-breakpoint
ALTER TABLE "mcp_audit_logs" ADD CONSTRAINT "mcp_audit_logs_access_token_id_oauth_access_tokens_id_fk" FOREIGN KEY ("access_token_id") REFERENCES "public"."oauth_access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Step 5: Drop old token_id FK and column from mcp_audit_logs
ALTER TABLE "mcp_audit_logs" DROP CONSTRAINT IF EXISTS "mcp_audit_logs_token_id_mcp_tokens_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "mcp_audit_logs_token_id_idx";--> statement-breakpoint
ALTER TABLE "mcp_audit_logs" DROP COLUMN IF EXISTS "token_id";--> statement-breakpoint

-- Step 6: Drop mcp_tokens table
DROP TABLE IF EXISTS "mcp_tokens";
