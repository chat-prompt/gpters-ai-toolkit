import Link from 'next/link'
import { ReactNode } from 'react'

interface DetailPageLayoutProps {
  children: ReactNode
  accentColor: string // e.g., 'cyan', 'purple', 'rose', 'orange', 'emerald'
  backHref?: string
  backLabel?: string
}

const ACCENT_COLORS: Record<string, string> = {
  cyan: 'bg-[var(--accent-cyan)]',
  purple: 'bg-[var(--accent-purple)]',
  rose: 'bg-rose-400',
  orange: 'bg-orange-500',
  emerald: 'bg-emerald-500',
}

export function DetailPageLayout({
  children,
  accentColor,
  backHref = '/',
  backLabel = 'Back to Catalog',
}: DetailPageLayoutProps) {
  const bgColor = ACCENT_COLORS[accentColor] || ACCENT_COLORS.cyan

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className={`absolute top-[-20%] right-[-10%] w-[600px] h-[600px] ${bgColor} opacity-[0.03] blur-[120px] rounded-full`}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-[var(--border-subtle)]">
        <div className="max-w-5xl mx-auto px-8 py-5">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
          >
            <span>←</span>
            <span>{backLabel}</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        {children}
      </main>
    </div>
  )
}
