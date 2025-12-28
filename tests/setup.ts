import { beforeAll, afterAll, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Note: NODE_ENV is automatically set to 'test' by vitest

// Set test environment variables
// Note: For API integration tests, the server must also use ADMIN_PASSWORD=test-admin-password
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password'

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

// Global test setup
beforeAll(() => {
  // Setup code before all tests
})

afterAll(() => {
  // Cleanup code after all tests
})

afterEach(() => {
  // Cleanup code after each test
})
