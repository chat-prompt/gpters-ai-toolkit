export const GPTTERS_EMAIL_DOMAIN = 'gpters.org'

/** Return true only for a syntactically valid email on the exact GPTers domain. */
export function isGptersEmail(email: string | null | undefined): email is string {
  if (typeof email !== 'string') return false

  const normalizedEmail = email.trim().toLowerCase()
  return /^[^@\s]+@gpters\.org$/.test(normalizedEmail)
}
