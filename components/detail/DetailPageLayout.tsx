import { ReactNode } from 'react'
import { ServerHeader } from '../layout/ServerHeader'

interface DetailPageLayoutProps {
  children: ReactNode
  accentColor: string // e.g., 'cyan', 'purple', 'rose', 'orange', 'emerald'
}

const ACCENT_COLORS: Record<string, string> = {
  cyan: 'bg-[var(--accent-cyan)]',
  purple: 'bg-[var(--accent-purple)]',
  rose: 'bg-rose-400',
  orange: 'bg-orange-500',
  emerald: 'bg-emerald-500',
}

export async function DetailPageLayout({
  children,
  accentColor,
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

      {/* Full Navigation Header */}
      <ServerHeader />

      <main className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        {children}
      </main>
    </div>
  )
}
