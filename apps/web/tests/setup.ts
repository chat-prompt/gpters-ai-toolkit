import { beforeAll, afterAll, afterEach, expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

// Note: NODE_ENV is automatically set to 'test' by vitest

// DB 정리가 필요한 통합 테스트만 명시적으로 opt-in한다. 일반 단위 테스트에서
// DATABASE_URL을 암묵적으로 사용하거나, 모킹된 DB를 전역 cleanup이 건드리지 않는다.
const runDatabaseCleanup = process.env.RUN_DB_TEST_CLEANUP === 'true'
if (runDatabaseCleanup && !process.env.TEST_DATABASE_URL) {
  console.warn(
    '⚠️  RUN_DB_TEST_CLEANUP=true requires an isolated TEST_DATABASE_URL. Cleanup is disabled.'
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
  if (runDatabaseCleanup && process.env.TEST_DATABASE_URL) await cleanupTestItems()
})

afterAll(async () => {
  if (runDatabaseCleanup && process.env.TEST_DATABASE_URL) await cleanupTestItems()
})

afterEach(() => {
  // Per-test cleanup if needed
})
