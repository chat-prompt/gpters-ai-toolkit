'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

export function Header() {
  const pathname = usePathname()

  const isGuidesTab = pathname.startsWith('/guides')
  const isCatalogTab = !isGuidesTab && pathname !== '/upload'

  return (
    <header className="relative z-10 border-b border-[var(--border-subtle)]">
      <div className="max-w-6xl mx-auto px-8 py-5">
        <div className="flex items-center justify-between">
          {/* Logo & Nav */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/gpters-logo.svg"
                alt="GPTers"
                width={32}
                height={32}
                className="rounded-full"
              />
              <span className="text-lg font-medium text-[var(--text-primary)]">
                AI Toolkit
              </span>
            </Link>

            {/* Tab Navigation */}
            <nav className="flex items-center gap-1 bg-[var(--bg-secondary)] rounded-xl p-1">
              <Link
                href="/"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isCatalogTab
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                Catalog
              </Link>
              <Link
                href="/guides"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isGuidesTab
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                Guides
              </Link>
            </nav>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Link
              href="/upload"
              className="px-4 py-2 rounded-xl text-sm font-medium bg-[#F26522] text-white hover:bg-[#E55A1B] transition-colors"
            >
              Share
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
