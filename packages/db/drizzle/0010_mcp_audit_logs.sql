-- MCP Audit Logs Table for request/response logging
-- Implements audit trail for MCP API with privacy-aware IP hashing

CREATE TABLE IF NOT EXISTS "mcp_audit_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "method" text NOT NULL,
  "tool" text,
  "token_id" text REFERENCES "mcp_tokens"("id") ON DELETE SET NULL,
  "is_authenticated" boolean NOT NULL DEFAULT false,
  "ip_hash" text NOT NULL,
  "user_agent" text,
  "request_params" jsonb,
  "response_status" text NOT NULL,
  "response_time" integer,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS "mcp_audit_logs_created_at_idx" ON "mcp_audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "mcp_audit_logs_token_id_idx" ON "mcp_audit_logs" ("token_id");
CREATE INDEX IF NOT EXISTS "mcp_audit_logs_method_idx" ON "mcp_audit_logs" ("method");
CREATE INDEX IF NOT EXISTS "mcp_audit_logs_response_status_idx" ON "mcp_audit_logs" ("response_status");
CREATE INDEX IF NOT EXISTS "mcp_audit_logs_created_status_idx" ON "mcp_audit_logs" ("created_at", "response_status");
