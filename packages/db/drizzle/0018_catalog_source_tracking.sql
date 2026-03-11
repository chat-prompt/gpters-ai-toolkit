-- Add source tracking columns to catalog_items for external skill imports (DEV-3066)
ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "source_repo" text;
ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "source_commit_sha" text;

-- Index for efficient source-based lookups and sync
CREATE INDEX IF NOT EXISTS "catalog_items_source_repo_idx" ON "catalog_items" ("source_repo") WHERE "source_repo" IS NOT NULL;
