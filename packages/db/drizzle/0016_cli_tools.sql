-- Create cli_tools table for exercise-aware CLI tool recommendations (DEV-3062)
CREATE TABLE IF NOT EXISTS "cli_tools" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "install_command" text NOT NULL,
  "latest_version" text,
  "npm_package" text,
  "sync_source" text DEFAULT 'npm',
  "context7_library_id" text,
  "related_tags" text[],
  "tier" integer DEFAULT 3,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
