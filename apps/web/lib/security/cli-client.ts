/**
 * Shared aitk-cli OAuth client management
 *
 * Ensures the aitk-cli OAuth client exists in the database.
 * Used by CLI token, device flow, and API key endpoints.
 */

import { db, oauthClients } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { createLogger } from '@/lib/core/logger'

const log = createLogger('cli-client')

/** aitk-cli OAuth 클라이언트 ID */
export const CLI_CLIENT_ID = 'aitk-cli'

/** CLI 토큰 기본 만료: 90일 (ms) */
export const CLI_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000

/** CLI 토큰 기본 스코프 */
export const CLI_TOKEN_SCOPE = 'mcp:tools mcp:prompts'

/**
 * aitk-cli OAuth 클라이언트가 DB에 존재하는지 확인하고, 없으면 생성
 *
 * @returns 클라이언트 ID
 */
export async function ensureCliClient(): Promise<string> {
  const [existing] = await db
    .select({ id: oauthClients.id })
    .from(oauthClients)
    .where(eq(oauthClients.id, CLI_CLIENT_ID))

  if (existing) return existing.id

  await db.insert(oauthClients).values({
    id: CLI_CLIENT_ID,
    name: 'aitk CLI',
    redirectUris: ['http://localhost'],
  })

  log.info('Created aitk-cli OAuth client')
  return CLI_CLIENT_ID
}
