/**
 * Account access policy shared by web login, JWT validation, and OAuth token issuance.
 *
 * Access is granted to the exact `gpters.org` domain plus an explicit list of
 * individually approved external accounts. Approved external accounts are
 * treated as GPTers organization members for org resolution.
 */

export const GPTTERS_EMAIL_DOMAIN = 'gpters.org'

/** Individually approved accounts outside the GPTers domain (lowercase). */
export const ALLOWED_EXTERNAL_EMAILS: ReadonlySet<string> = new Set([
  'zeusajm@yonsei.ac.kr',
])

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Return true only for a syntactically valid email on the exact GPTers domain. */
export function isGptersEmail(email: string | null | undefined): email is string {
  if (typeof email !== 'string') return false

  return /^[^@\s]+@gpters\.org$/.test(normalizeEmail(email))
}

/** Return true for GPTers domain accounts and individually approved external accounts. */
export function isAllowedAccountEmail(email: string | null | undefined): email is string {
  if (typeof email !== 'string') return false

  return isGptersEmail(email) || ALLOWED_EXTERNAL_EMAILS.has(normalizeEmail(email))
}

/**
 * Domain used to resolve organization membership for an allowed account.
 * Approved external accounts resolve to the GPTers domain so they join the GPTers org.
 */
export function accessDomainOf(email: string): string {
  const normalized = normalizeEmail(email)
  if (ALLOWED_EXTERNAL_EMAILS.has(normalized)) return GPTTERS_EMAIL_DOMAIN

  return normalized.split('@')[1]
}
