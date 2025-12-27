import { beforeAll, afterAll, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Set test environment variables
// Note: For API integration tests, the server must also use ADMIN_PASSWORD=test-admin-password
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password'

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
