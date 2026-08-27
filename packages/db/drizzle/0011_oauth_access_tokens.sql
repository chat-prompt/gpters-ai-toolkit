-- Migration: Replace mcp_tokens with oauth_access_tokens
-- This migration:
-- 1. Creates oauth_access_tokens table for OAuth 2.1 access tokens
-- 2. Migrates mcp_audit_logs from token_id to access_token_id
-- 3. Drops the legacy mcp_tokens table

-- The OAuth client/code tables existed in the deployed schema before this
-- migration was checked in, but were missing from the repository history.
-- Define them here so a clean database can replay the migration chain.
CREATE TABLE IF NOT EXISTS "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"secret_hash" text,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "oauth_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL REFERENCES "public"."oauth_clients"("id") ON DELETE cascade,
	"user_id" text NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "oauth_codes_client_id_idx" ON "oauth_codes" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_codes_user_id_idx" ON "oauth_codes" ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_codes_expires_at_idx" ON "oauth_codes" ("expires_at");
--> statement-breakpoint

-- Step 1: Create oauth_access_tokens table
CREATE TABLE "oauth_access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
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

-- Refresh tokens are part of the same OAuth contract and are required by the
-- local collector-state fixture as well as the current schema.
CREATE TABLE IF NOT EXISTS "oauth_refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"client_id" text NOT NULL REFERENCES "public"."oauth_clients"("id") ON DELETE cascade,
	"user_id" text NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"access_token_id" text REFERENCES "public"."oauth_access_tokens"("id") ON DELETE set null,
	"scope" text,
	"family_id" text NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "oauth_refresh_tokens_token_hash_idx" ON "oauth_refresh_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "oauth_refresh_tokens_user_id_idx" ON "oauth_refresh_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_refresh_tokens_client_id_idx" ON "oauth_refresh_tokens" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_refresh_tokens_family_id_idx" ON "oauth_refresh_tokens" ("family_id");
CREATE INDEX IF NOT EXISTS "oauth_refresh_tokens_expires_at_idx" ON "oauth_refresh_tokens" ("expires_at");
--> statement-breakpoint

-- Step 4: Add access_token_id column to mcp_audit_logs
ALTER TABLE "mcp_audit_logs" ADD COLUMN "access_token_id" text;--> statement-breakpoint
ALTER TABLE "mcp_audit_logs" ADD CONSTRAINT "mcp_audit_logs_access_token_id_oauth_access_tokens_id_fk" FOREIGN KEY ("access_token_id") REFERENCES "public"."oauth_access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Step 5: Drop old token_id FK and column from mcp_audit_logs
ALTER TABLE "mcp_audit_logs" DROP CONSTRAINT IF EXISTS "mcp_audit_logs_token_id_mcp_tokens_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "mcp_audit_logs_token_id_idx";--> statement-breakpoint
ALTER TABLE "mcp_audit_logs" DROP COLUMN IF EXISTS "token_id";--> statement-breakpoint

-- Step 6: Drop mcp_tokens table
DROP TABLE IF EXISTS "mcp_tokens";
