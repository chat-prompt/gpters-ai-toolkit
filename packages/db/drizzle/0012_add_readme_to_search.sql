-- Add readme to full-text search indexes
-- This migration updates search_vector and search_text to include readme content

-- Drop existing generated columns (must recreate to change definition)
ALTER TABLE "catalog_items" DROP COLUMN IF EXISTS "search_vector";
ALTER TABLE "catalog_items" DROP COLUMN IF EXISTS "search_text";

-- Recreate search_vector with readme included (weight C, same as content)
ALTER TABLE "catalog_items" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(readme, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'D')
  ) STORED;--> statement-breakpoint

-- Recreate search_text with readme included (for Korean trigram search)
ALTER TABLE "catalog_items" ADD COLUMN "search_text" text
  GENERATED ALWAYS AS (
    coalesce(name, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(readme, '') || ' ' ||
    coalesce(author, '') || ' ' ||
    coalesce(immutable_text_array_to_string(tags, ' '), '')
  ) STORED;--> statement-breakpoint

-- Recreate GIN indexes
DROP INDEX IF EXISTS "catalog_items_search_vector_idx";
DROP INDEX IF EXISTS "catalog_items_search_text_trgm_idx";

CREATE INDEX "catalog_items_search_vector_idx" ON "catalog_items" USING GIN(search_vector);--> statement-breakpoint
CREATE INDEX "catalog_items_search_text_trgm_idx" ON "catalog_items" USING GIN(search_text gin_trgm_ops);
