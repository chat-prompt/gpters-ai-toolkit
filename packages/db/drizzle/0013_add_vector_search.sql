-- Vector search support for catalog_items using pgvector
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint

-- Add embedding column (3072 dimensions for Gemini, pgvector indexes limited to 2000 dims)
ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "embedding" vector(3072);
