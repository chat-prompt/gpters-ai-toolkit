/**
 * Forward migration script to migrate existing data into GPTers organization
 *
 * This script creates the GPTers organization, migrates users to org memberships,
 * promotes admins to super_admin, and assigns all catalog items to the organization.
 * It is idempotent and safe to re-run.
 *
 * Usage: npx tsx packages/db/src/migrations/add-org-support.ts
 */
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { organizations, users, orgMemberships, catalogItems } from '../schema'
import { eq, isNull, sql } from 'drizzle-orm'
import crypto from 'crypto'

/**
 * Main migration function
 * Performs data migration in 4 steps:
 * 1. Create GPTers organization
 * 2. Migrate users to org memberships
 * 3. Promote admins to super_admin
 * 4. Assign catalog items to GPTers org
 */
async function migrate() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const client = neon(databaseUrl)
  const db = drizzle(client)

  console.log('Starting organization migration...')

  try {
    // Step 1: Create GPTers Organization
    console.log('\nStep 1: Creating GPTers organization...')
    let gptersOrgId: string

    const existingOrg = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'gpters'))
      .limit(1)

    if (existingOrg.length > 0) {
      gptersOrgId = existingOrg[0].id
      console.log(`  ✓ GPTers organization already exists (ID: ${gptersOrgId})`)
    } else {
      gptersOrgId = crypto.randomUUID()
      await db.insert(organizations).values({
        id: gptersOrgId,
        name: 'GPTers',
        slug: 'gpters',
        description: 'GPTers AI Team',
        allowedDomains: ['gpters.org'],
        isActive: true,
      })
      console.log(`  ✓ Created GPTers organization (ID: ${gptersOrgId})`)
    }

    // Step 2: Migrate Users to GPTers Org Memberships
    console.log('\nStep 2: Migrating users to org memberships...')
    const allUsers = await db.select().from(users)

    let membershipCount = 0
    let skippedCount = 0

    for (const user of allUsers) {
      // Map user role to org role
      let orgRole: 'org_admin' | 'org_editor' | 'org_viewer'
      if (user.role === 'admin' || user.role === 'super_admin') {
        orgRole = 'org_admin'
      } else if (user.role === 'editor') {
        orgRole = 'org_editor'
      } else {
        orgRole = 'org_viewer'
      }

      try {
        await db
          .insert(orgMemberships)
          .values({
            userId: user.id,
            orgId: gptersOrgId,
            role: orgRole,
          })
          .onConflictDoNothing()

        membershipCount++
      } catch (error) {
        // Membership might already exist due to onConflictDoNothing
        skippedCount++
      }
    }

    console.log(`  ✓ Created ${membershipCount} org memberships`)
    if (skippedCount > 0) {
      console.log(`  ✓ Skipped ${skippedCount} existing memberships`)
    }

    // Step 3: Promote Admins to Super Admin
    console.log('\nStep 3: Promoting admins to super_admin...')
    const result = await db
      .update(users)
      .set({ role: 'super_admin' })
      .where(eq(users.role, 'admin'))

    console.log(`  ✓ Promoted ${result.rowCount ?? 0} admins to super_admin`)

    // Step 4: Assign All Catalog Items to GPTers Org
    console.log('\nStep 4: Assigning catalog items to GPTers org...')

    // Update org_id for items without an org
    const orgUpdateResult = await db
      .update(catalogItems)
      .set({ orgId: gptersOrgId })
      .where(isNull(catalogItems.orgId))

    console.log(`  ✓ Assigned ${orgUpdateResult.rowCount ?? 0} catalog items to GPTers org`)

    // Set default visibility for items without visibility
    const visibilityUpdateResult = await db
      .update(catalogItems)
      .set({ visibility: 'private' })
      .where(isNull(catalogItems.visibility))

    console.log(`  ✓ Set visibility for ${visibilityUpdateResult.rowCount ?? 0} catalog items`)

    // Initialize shared_with_orgs for items without it
    const sharedUpdateResult = await db
      .update(catalogItems)
      .set({ sharedWithOrgs: [] })
      .where(
        sql`${catalogItems.sharedWithOrgs} IS NULL`
      )

    console.log(`  ✓ Initialized sharedWithOrgs for ${sharedUpdateResult.rowCount ?? 0} catalog items`)

    // Initialize fork_count for items without it
    const forkCountUpdateResult = await db
      .update(catalogItems)
      .set({ forkCount: 0 })
      .where(isNull(catalogItems.forkCount))

    console.log(`  ✓ Initialized forkCount for ${forkCountUpdateResult.rowCount ?? 0} catalog items`)

    console.log('\n✅ Migration complete!')
    console.log('\nNOTE: Run `pnpm db:generate` and `pnpm db:push` to make org_id NOT NULL after verifying migration')
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  }
}

migrate().catch(console.error)
