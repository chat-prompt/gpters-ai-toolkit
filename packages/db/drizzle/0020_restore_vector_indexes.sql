-- Restore / create HNSW indexes for halfvec embedding columns
--
-- Background: Migration 0014 converted catalog_items.embedding to halfvec(3072)
-- and created an HNSW index, but the index was not present in production as of
-- 2026-04-15 (btree only). mcp_servers and cli_tools also had no vector index,
-- so all three embedding columns were full-scanned on every search.
--
-- This migration is idempotent (IF NOT EXISTS) and safe to re-run.
-- Table sizes at creation time: catalog_items ~405, mcp_servers ~54, cli_tools ~41.
-- Index build is instant on this scale; read latency drops from full scan to
-- sub-millisecond ANN lookup.

-- These two columns existed in the deployed schema but their creation was not
-- present in the checked-in migration history. Keep the repair idempotent so
-- both deployed and clean databases converge before indexes are created.
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS embedding halfvec(3072);
ALTER TABLE cli_tools ADD COLUMN IF NOT EXISTS embedding halfvec(3072);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_catalog_embedding_hnsw
  ON catalog_items USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_mcp_servers_embedding_hnsw
  ON mcp_servers USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_cli_tools_embedding_hnsw
  ON cli_tools USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);
