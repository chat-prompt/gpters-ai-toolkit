import { beforeAll, afterAll, afterEach, expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

// Note: NODE_ENV is automatically set to 'test' by vitest

// Database isolation:
// Set TEST_DATABASE_URL in .env.local to use a separate test database
// This prevents test data from appearing in production
// Example: TEST_DATABASE_URL="postgresql://user:password@test-host.neon.tech/testdb"
if (!process.env.TEST_DATABASE_URL) {
  console.warn(
    '⚠️  TEST_DATABASE_URL not set. Tests will use DATABASE_URL.\n' +
    '   Consider setting TEST_DATABASE_URL for proper test isolation.'
  )
}

// Test item ID prefixes that should be cleaned up
const TEST_ITEM_PREFIXES = [
  'test-',
  'upload-test-',
]

/**
 * Clean up test items from the database
 * This ensures test data doesn't persist between test runs
 */
async function cleanupTestItems(): Promise<void> {
  try {
    // Dynamic import to avoid issues with module loading order
    const { db, catalogItems } = await import('@/lib/db')
    const { like, or, eq } = await import('drizzle-orm')

    // Build conditions for each prefix
    const conditions = TEST_ITEM_PREFIXES.map(prefix =>
      like(catalogItems.id, `${prefix}%`)
    )

    // Find and delete all test items
    const testItems = await db
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(or(...conditions))

    if (testItems.length > 0) {
      console.log(`🧹 Cleaning up ${testItems.length} test item(s)...`)

      for (const item of testItems) {
        await db.delete(catalogItems).where(eq(catalogItems.id, item.id))
      }

      console.log(`✅ Cleaned up test items: ${testItems.map(i => i.id).join(', ')}`)
    }
  } catch (error) {
    // Log but don't fail - cleanup is best-effort
    // This might fail if DATABASE_URL is not set (unit tests without DB)
    if (error instanceof Error && !error.message.includes('DATABASE_URL')) {
      console.warn('⚠️  Test cleanup warning:', error.message)
    }
  }
}

// Global test setup
beforeAll(async () => {
  // Clean up any leftover test items from previous runs
  await cleanupTestItems()
})

afterAll(async () => {
  // Clean up test items created during this test run
  await cleanupTestItems()
})

afterEach(() => {
  // Per-test cleanup if needed
})
