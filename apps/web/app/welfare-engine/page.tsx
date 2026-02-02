import { ServerHeader } from '@/components/layout/ServerHeader'
import { WelfareEngineDashboard } from '@/components/welfare-engine/WelfareEngineDashboard'

export const metadata = {
  title: '복리 엔진 지표 - GPTers AI Toolkit',
  description: 'Welfare Engine metrics tracking for GPTers AI Toolkit',
}

export default function WelfareEnginePage() {
  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <ServerHeader />

      <main className="relative z-10 py-12 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-10">
            <p className="text-[#F26522] text-xs font-medium uppercase tracking-[0.3em] mb-4">
              Welfare Engine
            </p>
            <h1 className="text-4xl md:text-5xl font-light text-[var(--text-primary)] leading-[1.1] tracking-[-0.03em] mb-4" style={{ fontFamily: 'var(--font-newsreader)' }}>
              복리 엔진{' '}
              <span className="bg-gradient-to-r from-[#F26522] to-[#FF8C42] bg-clip-text text-transparent font-medium">
                지표 추적
              </span>
            </h1>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl">
              스킬의 축적과 활용, 품질 지표를 추적합니다.
              팀의 지식이 어떻게 쌓이고 활용되는지 한눈에 확인하세요.
            </p>
          </div>

          <WelfareEngineDashboard />
        </div>
      </main>

      <footer className="relative z-10 border-t border-[var(--border-subtle)] py-8 mt-12">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            GPTers AI Toolkit - Welfare Engine
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Built with Claude Code
          </p>
        </div>
      </footer>
    </div>
  )
}
