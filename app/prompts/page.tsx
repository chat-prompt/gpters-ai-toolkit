import Link from 'next/link'
import { PromptExamplesLibrary } from '@/components/admin/PromptExamplesLibrary'
import { ServerHeader } from '@/components/layout/ServerHeader'

export const metadata = {
  title: '프롬프트 예시 라이브러리 | GPTers AI Toolkit',
  description: 'Claude Code에서 사용할 수 있는 효과적인 프롬프트 예시 모음',
}

export default function PromptsPage() {
  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <ServerHeader />

      {/* Hero Section */}
      <section className="relative z-10 py-16 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-12">
            <p className="text-[var(--accent-purple)] text-xs font-medium uppercase tracking-[0.3em] mb-6">
              Prompt Examples Library
            </p>
            <h1
              className="text-4xl md:text-5xl font-light text-[var(--text-primary)] leading-[1.1] tracking-[-0.03em] mb-6"
              style={{ fontFamily: 'var(--font-newsreader)' }}
            >
              효과적인{' '}
              <span className="bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-cyan)] bg-clip-text text-transparent font-medium">
                프롬프트 예시
              </span>
            </h1>
            <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl">
              코드 리뷰, 문서 작성, 버그 수정 등 다양한 작업에 활용할 수 있는
              프롬프트 템플릿을 찾아보세요. 복사해서 바로 사용하거나 커스터마이징할
              수 있습니다.
            </p>
          </div>

          {/* Quick Tips */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">🎯</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">
                구체적으로 요청하기
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                원하는 결과를 명확하게 설명할수록 좋은 답변을 얻을 수 있습니다.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">📋</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">
                컨텍스트 제공하기
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                관련 코드나 에러 메시지를 함께 제공하면 더 정확한 도움을 받을 수
                있습니다.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">🔄</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">
                단계별로 요청하기
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                복잡한 작업은 여러 단계로 나누어 요청하면 더 좋은 결과를 얻을 수
                있습니다.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">✨</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">
                출력 형식 지정하기
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                원하는 출력 형식(마크다운, JSON 등)을 명시하면 결과물을 바로
                사용할 수 있습니다.
              </p>
            </div>
          </div>

          {/* Prompt Examples Library */}
          <PromptExamplesLibrary />
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-16 px-8 bg-[var(--bg-secondary)]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-light text-[var(--text-primary)] mb-4">
            나만의 스킬로 만들어보세요
          </h2>
          <p className="text-[var(--text-secondary)] mb-8">
            자주 사용하는 프롬프트는 스킬로 저장하면 더 편리하게 활용할 수
            있습니다. 팀과 공유하여 모두의 생산성을 높여보세요.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/templates"
              className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
            >
              스킬 템플릿 만들기
            </Link>
            <Link
              href="/"
              className="px-6 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
            >
              카탈로그 둘러보기
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--border-subtle)] py-8">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            GPTers AI Toolkit - Prompt Examples
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Built with Claude Code
          </p>
        </div>
      </footer>
    </div>
  )
}
