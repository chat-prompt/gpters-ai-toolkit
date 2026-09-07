/**
 * Account access policy shared by web login, JWT validation, and OAuth token issuance.
 *
 * Access is granted to the exact `gpters.org` domain, plus the individually
 * approved external accounts a super admin manages from the admin console.
 * Approved external accounts are treated as GPTers organization members.
 */

import { db, allowedExternalAccounts } from '@gpters/db'
import { eq } from 'drizzle-orm'

export const GPTTERS_EMAIL_DOMAIN = 'gpters.org'

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Return true only for a syntactically valid email on the exact GPTers domain. */
export function isGptersEmail(email: string | null | undefined): email is string {
  if (typeof email !== 'string') return false

  return /^[^@\s]+@gpters\.org$/.test(normalizeEmail(email))
}

/**
 * Return true for GPTers domain accounts and for external accounts that are
 * currently on the approval list. Removing an approval revokes access at once,
 * because every login, session, and token check reads the list live.
 */
export async function isAllowedAccountEmail(email: string | null | undefined): Promise<boolean> {
  if (typeof email !== 'string') return false
  if (isGptersEmail(email)) return true

  const normalizedEmail = normalizeEmail(email)
  if (normalizedEmail.length === 0) return false

  const [approval] = await db
    .select({ email: allowedExternalAccounts.email })
    .from(allowedExternalAccounts)
    .where(eq(allowedExternalAccounts.email, normalizedEmail))
    .limit(1)

  return Boolean(approval)
}
