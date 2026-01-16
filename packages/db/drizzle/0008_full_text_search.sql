-- Full-text search support for catalog_items
-- Uses PostgreSQL tsvector for English and pg_trgm for Korean/multilingual

-- Enable pg_trgm extension for trigram-based similarity search (supports Korean)
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

-- Add search_vector column as a generated column
-- Combines name (weight A), description (weight B), and content (weight C)
ALTER TABLE "catalog_items" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'D')
  ) STORED;--> statement-breakpoint

-- Create GIN index for full-text search vector
CREATE INDEX "catalog_items_search_vector_idx" ON "catalog_items" USING GIN(search_vector);--> statement-breakpoint

-- Create GIN index for trigram similarity on name (Korean search)
CREATE INDEX "catalog_items_name_trgm_idx" ON "catalog_items" USING GIN(name gin_trgm_ops);--> statement-breakpoint

-- Create GIN index for trigram similarity on description (Korean search)
CREATE INDEX "catalog_items_description_trgm_idx" ON "catalog_items" USING GIN(description gin_trgm_ops);--> statement-breakpoint

-- Create combined text column for Korean full-text search
ALTER TABLE "catalog_items" ADD COLUMN "search_text" text
  GENERATED ALWAYS AS (
    coalesce(name, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(author, '') || ' ' ||
    coalesce(array_to_string(tags, ' '), '')
  ) STORED;--> statement-breakpoint

-- Create GIN index for trigram on combined search text
CREATE INDEX "catalog_items_search_text_trgm_idx" ON "catalog_items" USING GIN(search_text gin_trgm_ops);
