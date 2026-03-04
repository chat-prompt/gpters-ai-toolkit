/**
 * i18n configuration
 *
 * Defines supported locales and default locale for the application.
 */

/** Supported locale codes */
export const locales = ['ko', 'en'] as const

/** Type for supported locales */
export type Locale = (typeof locales)[number]

/** Default locale (Korean) */
export const defaultLocale: Locale = 'ko'
