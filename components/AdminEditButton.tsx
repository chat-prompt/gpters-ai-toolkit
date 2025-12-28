import Link from 'next/link'
import { auth } from '@/lib/auth'
import { canEdit } from '@/lib/rbac'
import type { UserRole } from '@/lib/rbac'

interface AdminEditButtonProps {
  itemId: string
  /** URL to redirect back to after saving. Defaults to current page. */
  returnUrl?: string
}

/**
 * Floating edit button for admin users on detail pages.
 * Only visible to users with 'editor' or 'admin' role.
 * Positioned at bottom-right of the page.
 */
export async function AdminEditButton({ itemId, returnUrl }: AdminEditButtonProps) {
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
      title="편집하기"
      aria-label="편집하기"
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
        편집하기
      </span>
    </Link>
  )
}
