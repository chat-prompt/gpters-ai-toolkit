/**
 * i18n routing configuration
 *
 * Defines locale routing strategy with 'as-needed' prefix mode
 * so the default locale (ko) does not require a URL prefix.
 */
import { defineRouting } from 'next-intl/routing'
import { locales, defaultLocale } from './config'

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
})
