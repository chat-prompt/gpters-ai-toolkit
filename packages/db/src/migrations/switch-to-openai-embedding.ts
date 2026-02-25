/**
 * Migration: Switch embedding model from Gemini to OpenAI
 *
 * Changes halfvec dimension from 3072 (Gemini) to 1536 (OpenAI text-embedding-3-small).
 * All existing embeddings are cleared (set to NULL) since dimensions are incompatible.
 * Run generate-embeddings script after this migration to re-embed all items.
 *
 * Steps:
 * 1. Drop existing HNSW index if any
 * 2. Set all embeddings to NULL
 * 3. Alter column type to halfvec(1536)
 */

import { neon } from '@neondatabase/serverless'

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  const sql = neon(databaseUrl)

  console.log('Starting migration: switch to OpenAI embedding (3072 → 1536)...')

  // Step 1: Drop existing HNSW index if any
  const indexes = await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'catalog_items'
      AND (indexdef LIKE '%hnsw%' OR indexdef LIKE '%embedding%')
  `
  for (const idx of indexes) {
    console.log(`Dropping index: ${idx.indexname}`)
    await sql`DROP INDEX IF EXISTS ${sql(idx.indexname)}`
  }

  // Step 2: Clear all existing embeddings
  const cleared = await sql`
    UPDATE catalog_items SET embedding = NULL WHERE embedding IS NOT NULL
  `
  console.log(`Cleared embeddings: ${cleared.length ?? 0} rows`)

  // Step 3: Alter column type
  await sql`
    ALTER TABLE catalog_items
    ALTER COLUMN embedding TYPE halfvec(1536)
  `
  console.log('Changed column type to halfvec(1536)')

  console.log('Migration complete! Run generate-embeddings to re-embed all items.')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
