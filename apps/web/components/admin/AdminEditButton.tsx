/**
 * Admin floating edit button component
 *
 * Displays a floating action button for editing catalog items,
 * visible only to users with editor or admin role.
 */
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { auth } from '@/lib/core/auth'
import { canEdit } from '@/lib/security/rbac'
import type { UserRole } from '@/lib/security/rbac'

/**
 * Props for AdminEditButton component
 */
interface AdminEditButtonProps {
  /** ID of the catalog item to edit */
  itemId: string
  /** URL to redirect back to after saving */
  returnUrl?: string
}

/**
 * Floating edit button for admin users on detail pages.
 * Only visible to users with 'editor' or 'admin' role.
 * Positioned at bottom-right of the page.
 */
export async function AdminEditButton({ itemId, returnUrl }: AdminEditButtonProps) {
  const t = await getTranslations('admin.menu')
  const session = await auth()
  const userRole = session?.user?.role as UserRole | undefined

  // Only show for users who can edit
  if (!canEdit(userRole)) {
    return null
  }

  // Build edit URL with optional return URL
  const editUrl = returnUrl
    ? `/admin/catalog/${itemId}/edit?returnUrl=${encodeURIComponent(returnUrl)}`
    : `/admin/catalog/${itemId}/edit`

  return (
    <Link
      href={editUrl}
      className="fixed bottom-6 right-6 z-50
        w-14 h-14 rounded-full
        bg-[var(--accent-cyan)] text-[var(--bg-primary)]
        flex items-center justify-center
        shadow-lg shadow-cyan-500/20
        hover:scale-110 hover:shadow-cyan-500/40
        transition-all duration-200
        group"
      title={t('edit')}
      aria-label={t('edit')}
    >
      <svg
        className="w-6 h-6 group-hover:rotate-12 transition-transform duration-200"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>

      {/* Tooltip */}
      <span className="absolute right-full mr-3 px-3 py-1.5
        bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm
        rounded-lg whitespace-nowrap
        opacity-0 group-hover:opacity-100
        pointer-events-none
        transition-opacity duration-200
        shadow-lg">
        {t('edit')}
      </span>
    </Link>
  )
}
