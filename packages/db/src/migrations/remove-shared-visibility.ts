/**
 * Migration: Remove 'shared' visibility level
 *
 * Simplifies visibility from 3-tier (private/shared/public) to 2-tier (private/public).
 * In a single-org (GPTers) environment, 'shared' is functionally identical to 'public'.
 * Also removes the now-unnecessary sharedWithOrgs column.
 *
 * Steps:
 * 1. Convert all 'shared' items to 'public'
 * 2. Replace enum with new 2-value version
 * 3. Drop sharedWithOrgs column
 */

import { neon } from '@neondatabase/serverless'

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  const sql = neon(databaseUrl)

  console.log('Starting migration: remove shared visibility...')

  // Step 1: Convert all 'shared' items to 'public'
  const updated = await sql`
    UPDATE catalog_items SET visibility = 'public' WHERE visibility = 'shared'
  `
  console.log(`Converted shared → public: ${updated.length ?? 0} rows`)

  // Step 2: Drop default value (required before enum type swap)
  await sql`ALTER TABLE catalog_items ALTER COLUMN visibility DROP DEFAULT`
  console.log('Dropped default on visibility column')

  // Step 3: Create new enum without 'shared' (drop if already exists from partial run)
  await sql`DROP TYPE IF EXISTS visibility_new`
  await sql`CREATE TYPE visibility_new AS ENUM ('private', 'public')`
  console.log('Created new visibility enum')

  // Step 4: Alter column to use new enum
  await sql`
    ALTER TABLE catalog_items
      ALTER COLUMN visibility TYPE visibility_new
      USING visibility::text::visibility_new
  `
  console.log('Altered column to new enum type')

  // Step 5: Drop old enum and rename new one
  await sql`DROP TYPE visibility`
  await sql`ALTER TYPE visibility_new RENAME TO visibility`
  console.log('Replaced enum type')

  // Step 6: Restore default value
  await sql`ALTER TABLE catalog_items ALTER COLUMN visibility SET DEFAULT 'private'`
  console.log('Restored default value')

  // Step 5: Drop sharedWithOrgs column
  await sql`ALTER TABLE catalog_items DROP COLUMN IF EXISTS shared_with_orgs`
  console.log('Dropped shared_with_orgs column')

  console.log('Migration complete!')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
