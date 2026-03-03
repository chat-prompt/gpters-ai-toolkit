/**
 * Migration script to create the Public organization for external users
 *
 * External beta testers with non-@gpters.org Google accounts are auto-enrolled
 * into this organization on first login. The script is idempotent.
 *
 * Usage: npx tsx packages/db/src/migrations/add-public-org.ts
 */
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { organizations } from '../schema'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'

/**
 * Create the Public organization for external user onboarding
 *
 * - slug: 'public'
 * - allowedDomains: [] (no domain restriction — assigned via fallback logic)
 * - isActive: true
 * - Idempotent: skips if already exists
 */
async function migrate() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const client = neon(databaseUrl)
  const db = drizzle(client)

  console.log('Starting Public organization migration...')

  try {
    const existingOrg = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'public'))
      .limit(1)

    if (existingOrg.length > 0) {
      console.log(`  ✓ Public organization already exists (ID: ${existingOrg[0].id})`)
    } else {
      const publicOrgId = crypto.randomUUID()
      await db.insert(organizations).values({
        id: publicOrgId,
        name: 'Public',
        slug: 'public',
        description: 'Default organization for external users',
        allowedDomains: [],
        isActive: true,
      })
      console.log(`  ✓ Created Public organization (ID: ${publicOrgId})`)
    }

    console.log('\n✅ Public organization migration complete!')
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  }
}

migrate().catch(console.error)
