/**
 * Auth error page
 *
 * Displays authentication error messages with explanations
 * for access denied, configuration, and verification failures.
 */
import { Link } from '@/i18n/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function AuthErrorPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ error?: string }>
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('auth.error')
  const { error } = await searchParams

  const errorMessages: Record<string, { title: string; description: string }> = {
    AccessDenied: { title: t('AccessDenied.title'), description: t('AccessDenied.description') },
    Configuration: { title: t('Configuration.title'), description: t('Configuration.description') },
    Verification: { title: t('Verification.title'), description: t('Verification.description') },
    Default: { title: t('Default.title'), description: t('Default.description') },
  }

  const errorInfo = errorMessages[error || 'Default'] || errorMessages.Default

  return (
    <div className="page-shell items-center justify-center">
      <div className="w-full max-w-md px-4">
        <div className="surface-card">
          <div className="mb-6 flex items-center gap-4">
            <div className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-full border border-[var(--border-hover)]">
              <svg
                className="w-6 h-6 text-[var(--text-secondary)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)]">
                {errorInfo.title}
              </h2>
              <p className="text-sm text-[var(--text-muted)]">{errorInfo.description}</p>
            </div>
          </div>

          <Link
            href="/auth/signin"
            className="block w-full text-center px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm font-medium border border-[var(--border-subtle)] transition-colors duration-200 hover:border-[var(--border-hover)]"
          >
            {t('retryLogin')}
          </Link>
        </div>
      </div>
    </div>
  )
}
