'use client'

/**
 * Language switcher component
 *
 * Allows users to switch between supported locales (ko/en).
 */
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, usePathname } from '@/i18n/navigation'
import type { Locale } from '@/i18n/config'

/**
 * Compact locale switcher for the header
 */
export function LocaleSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('common.localeSwitcher')

  const handleChange = (newLocale: Locale) => {
    router.replace(pathname, { locale: newLocale })
  }

  return (
    <button
      onClick={() => handleChange(locale === 'ko' ? 'en' : 'ko')}
      className="min-h-11 touch-manipulation rounded-lg bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] xl:min-h-0"
      title={t('label')}
    >
      {locale === 'ko' ? 'EN' : '한국어'}
    </button>
  )
}
