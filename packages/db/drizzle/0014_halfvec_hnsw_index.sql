-- Convert vector(3072) to halfvec(3072) for HNSW index support
-- pgvector HNSW only supports vector up to 2000 dims, halfvec supports up to 4000 dims
-- Half-precision (16-bit) has negligible quality loss (~0.1-0.5%) for similarity search
ALTER TABLE "catalog_items" ALTER COLUMN "embedding" TYPE halfvec(3072) USING "embedding"::halfvec(3072);--> statement-breakpoint

-- HNSW index for fast approximate nearest neighbor cosine similarity search
-- Expected improvement: full table scan (50-500ms) -> index lookup (2-8ms)
-- Parameters: m=16 (connections per node), ef_construction=64 (build-time search width)
CREATE INDEX IF NOT EXISTS idx_catalog_embedding_hnsw
  ON catalog_items USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
