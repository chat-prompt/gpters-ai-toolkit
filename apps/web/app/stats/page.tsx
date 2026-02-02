/**
 * Statistics page - Welfare Engine Dashboard
 *
 * Public analytics dashboard displaying welfare engine metrics:
 * skill accumulation, utilization, and quality metrics.
 */
import { ServerHeader } from '@/components/layout/ServerHeader'
import { WelfareEngineDashboard } from '@/components/welfare-engine/WelfareEngineDashboard'

export const metadata = {
  title: '복리 엔진 - GPTers AI Toolkit',
  description: '스킬 축적, 활용, 품질 지표를 확인하세요',
}

export default function StatsPage() {
  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <ServerHeader />

      {/* Main Content */}
      <main className="relative z-10 py-12 px-8">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="mb-10">
            <p className="text-[#F26522] text-xs font-medium uppercase tracking-[0.3em] mb-4">
              Welfare Engine
            </p>
            <h1 className="text-4xl md:text-5xl font-light text-[var(--text-primary)] leading-[1.1] tracking-[-0.03em] mb-4" style={{ fontFamily: 'var(--font-newsreader)' }}>
              복리{' '}
              <span className="bg-gradient-to-r from-[#F26522] to-[#FF8C42] bg-clip-text text-transparent font-medium">
                엔진
              </span>
            </h1>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl">
              GPTers AI Toolkit의 복리 엔진 지표를 확인하세요.
              스킬 축적, 활용, 품질 지표를 한눈에 파악할 수 있습니다.
            </p>
          </div>

          {/* Dashboard */}
          <WelfareEngineDashboard />
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--border-subtle)] py-8 mt-12">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            GPTers AI Toolkit - 복리 엔진
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Built with Claude Code
          </p>
        </div>
      </footer>
    </div>
  )
}
