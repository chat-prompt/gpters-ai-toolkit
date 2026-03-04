/**
 * next-intl request configuration
 *
 * Provides locale-specific message loading for server components.
 */
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  // Validate locale, fallback to default
  if (!locale || !routing.locales.includes(locale as typeof routing.locales[number])) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}/index.ts`)).default,
  }
})
