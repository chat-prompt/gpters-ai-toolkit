/** Refuse mutating API tests unless the caller explicitly confirms an isolated target. */

const required = {
  TEST_API_URL: process.env.TEST_API_URL,
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
}

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name)

if (missing.length > 0) {
  throw new Error(`API tests require an isolated target: missing ${missing.join(', ')}`)
}

if (process.env.CONFIRM_ISOLATED_API_TESTS !== 'run-mutating-api-tests') {
  throw new Error(
    'API tests mutate data. Set CONFIRM_ISOLATED_API_TESTS=run-mutating-api-tests only after verifying the isolated server and DB branch.'
  )
}

const apiUrl = new URL(required.TEST_API_URL)
const databaseUrl = new URL(required.TEST_DATABASE_URL)
if (apiUrl.protocol !== 'http:' && apiUrl.protocol !== 'https:') {
  throw new Error('TEST_API_URL must use http or https')
}
if (databaseUrl.protocol !== 'postgres:' && databaseUrl.protocol !== 'postgresql:') {
  throw new Error('TEST_DATABASE_URL must be a PostgreSQL URL')
}

console.log(`Isolated API test target confirmed: ${apiUrl.origin}`)
