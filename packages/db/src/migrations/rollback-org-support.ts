/**
 * Rollback migration script to reverse organization migration
 *
 * This script reverses the add-org-support migration by:
 * - Setting catalog items org_id back to NULL
 * - Demoting super_admin users back to admin
 * - Removing GPTers org memberships
 * - Deleting GPTers organization
 * It is idempotent and safe to re-run.
 *
 * Usage: npx tsx packages/db/src/migrations/rollback-org-support.ts
 */
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { organizations, users, orgMemberships, catalogItems } from '../schema'
import { eq, sql } from 'drizzle-orm'

/**
 * Main rollback function
 * Reverses the organization migration in 4 steps:
 * 1. Set catalog items org_id back to NULL
 * 2. Demote super_admin back to admin
 * 3. Remove GPTers org memberships
 * 4. Delete GPTers organization
 */
async function rollback() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const client = neon(databaseUrl)
  const db = drizzle(client)

  console.log('Starting organization migration rollback...')

  try {
    // Step 1: Find GPTers organization
    console.log('\nStep 1: Finding GPTers organization...')
    const gptersOrg = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'gpters'))
      .limit(1)

    if (gptersOrg.length === 0) {
      console.log('  ✓ GPTers organization does not exist (already rolled back)')
      console.log('\n✅ Rollback complete!')
      return
    }

    const gptersOrgId = gptersOrg[0].id
    console.log(`  ✓ Found GPTers organization (ID: ${gptersOrgId})`)

    // Step 2: Set catalog items org_id back to NULL
    console.log('\nStep 2: Clearing org_id from catalog items...')
    const catalogUpdateResult = await db
      .update(catalogItems)
      .set({
        orgId: null,
        visibility: null,
      })
      .where(eq(catalogItems.orgId, gptersOrgId))

    console.log(`  ✓ Cleared org data from ${catalogUpdateResult.rowCount ?? 0} catalog items`)

    // Step 3: Demote super_admin back to admin
    console.log('\nStep 3: Demoting super_admin users back to admin...')
    const userUpdateResult = await db
      .update(users)
      .set({ role: 'admin' })
      .where(eq(users.role, 'super_admin'))

    console.log(`  ✓ Demoted ${userUpdateResult.rowCount ?? 0} super_admin users to admin`)

    // Step 4: Remove GPTers org memberships
    console.log('\nStep 4: Removing GPTers org memberships...')
    const membershipDeleteResult = await db
      .delete(orgMemberships)
      .where(eq(orgMemberships.orgId, gptersOrgId))

    console.log(`  ✓ Removed ${membershipDeleteResult.rowCount ?? 0} org memberships`)

    // Step 5: Delete GPTers organization
    console.log('\nStep 5: Deleting GPTers organization...')
    await db.delete(organizations).where(eq(organizations.slug, 'gpters'))

    console.log('  ✓ Deleted GPTers organization')

    console.log('\n✅ Rollback complete!')
  } catch (error) {
    console.error('\n❌ Rollback failed:', error)
    process.exit(1)
  }
}

rollback().catch(console.error)
