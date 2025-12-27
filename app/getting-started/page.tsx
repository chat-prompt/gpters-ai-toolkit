import { getBeginnerItems } from '@/lib/catalog'
import { ServerHeader } from '@/components/ServerHeader'
import { DIFFICULTY_LABELS } from '@/lib/types'
import Link from 'next/link'

// Revalidate every 60 seconds
export const revalidate = 60

const LEARNING_PATH = [
  {
    step: 1,
    title: 'Claude Code 기초',
    description: 'Claude Code가 무엇인지, 어떻게 설치하고 사용하는지 알아봅니다.',
    icon: '🚀',
  },
  {
    step: 2,
    title: '첫 번째 스킬 사용하기',
    description: '이미 만들어진 스킬을 설치하고 실행해봅니다.',
    icon: '⚡',
  },
  {
    step: 3,
    title: '나만의 스킬 만들기',
    description: '간단한 스킬을 직접 작성하고 공유해봅니다.',
    icon: '✨',
  },
]

const TYPE_CONFIG = {
  skill: { icon: '⚡', color: 'cyan', label: 'Skill' },
  agent: { icon: '◈', color: 'purple', label: 'Agent' },
  command: { icon: '▸', color: 'cyan', label: 'Command' },
  guide: { icon: '📚', color: 'emerald', label: 'Guide' },
  hook: { icon: '🪝', color: 'orange', label: 'Hook' },
}

export default async function GettingStartedPage() {
  const beginnerItems = await getBeginnerItems()

  // Curated essentials - items that every beginner should know
  const essentials = beginnerItems.slice(0, 6)

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <ServerHeader />

      <main className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        {/* Hero */}
        <div className="mb-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-tertiary)] text-[var(--accent-cyan)] text-sm mb-6">
            <span>🎯</span>
            <span>Claude Code 입문자를 위한 가이드</span>
          </div>

          <h1
            className="text-5xl font-light text-[var(--text-primary)] tracking-tight mb-6"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            시작하기
          </h1>

          <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto">
            Claude Code를 처음 사용하시나요?
            <br />
            이 가이드를 따라하면 빠르게 시작할 수 있습니다.
          </p>
        </div>

        {/* Learning Path */}
        <section className="mb-16">
          <h2 className="text-2xl font-medium text-[var(--text-primary)] mb-8 text-center">
            학습 경로
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {LEARNING_PATH.map((item, index) => (
              <div
                key={item.step}
                className="glass rounded-2xl p-6 relative animate-fade-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-[var(--accent-cyan)] text-black flex items-center justify-center text-sm font-bold">
                  {item.step}
                </div>
                <div className="text-3xl mb-4 mt-2">{item.icon}</div>
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Start Commands */}
        <section className="mb-16">
          <h2 className="text-2xl font-medium text-[var(--text-primary)] mb-6">
            빠른 시작
          </h2>

          <div className="glass rounded-2xl p-6">
            <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">
              마켓플레이스 추가 (Claude Code 내에서)
            </h3>
            <div className="bg-[var(--bg-primary)] rounded-xl p-4 font-mono text-sm">
              <code className="text-[var(--accent-cyan)]">/plugin marketplace add chat-prompt/gpters-ai-toolkit</code>
            </div>

            <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4 mt-8">
              플러그인 설치 예시
            </h3>
            <div className="bg-[var(--bg-primary)] rounded-xl p-4 font-mono text-sm">
              <code className="text-[var(--accent-cyan)]">/plugin install code-reviewer@gpters-ai-toolkit</code>
            </div>
          </div>
        </section>

        {/* Recommended for Beginners */}
        {essentials.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-medium text-[var(--text-primary)]">
                입문자 추천
              </h2>
              <Link
                href="/"
                className="text-sm text-[var(--accent-cyan)] hover:underline"
              >
                전체 카탈로그 보기 →
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {essentials.map((item, index) => {
                const config = TYPE_CONFIG[item.type]
                return (
                  <Link href={`/${item.type}/${item.id}`} key={item.id}>
                    <div
                      className="glass rounded-xl p-5 h-full transition-all duration-300 hover:translate-y-[-2px] animate-fade-up"
                      style={{ animationDelay: `${index * 80}ms` }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{config.icon}</span>
                        <span className="text-[10px] font-semibold tracking-[0.15em] text-[var(--text-muted)] uppercase">
                          {config.label}
                        </span>
                        {item.difficulty && (
                          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                            {DIFFICULTY_LABELS[item.difficulty].label}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-medium text-[var(--text-primary)] mb-2 line-clamp-1">
                        {item.name}
                      </h3>

                      <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Next Steps */}
        <section className="mb-16">
          <h2 className="text-2xl font-medium text-[var(--text-primary)] mb-6">
            다음 단계
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link href="/">
              <div className="glass rounded-xl p-6 group hover:translate-y-[-2px] transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[var(--accent-cyan)]/10 flex items-center justify-center text-2xl">
                    🔍
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-cyan)] transition-colors">
                      카탈로그 탐색
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                      더 많은 스킬과 에이전트를 찾아보세요
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/upload">
              <div className="glass rounded-xl p-6 group hover:translate-y-[-2px] transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center text-2xl">
                    ✏️
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-purple)] transition-colors">
                      나만의 스킬 공유
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                      직접 만든 스킬을 팀과 공유하세요
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/guides">
              <div className="glass rounded-xl p-6 group hover:translate-y-[-2px] transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-2xl">
                    📚
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-[var(--text-primary)] group-hover:text-emerald-400 transition-colors">
                      가이드 읽기
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                      단계별 설정 가이드를 확인하세요
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            <a
              href="https://docs.anthropic.com/claude-code"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="glass rounded-xl p-6 group hover:translate-y-[-2px] transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-2xl">
                    📖
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-[var(--text-primary)] group-hover:text-orange-400 transition-colors">
                      공식 문서
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Claude Code 공식 문서 읽기
                    </p>
                  </div>
                </div>
              </div>
            </a>
          </div>
        </section>

        {/* Help */}
        <section className="text-center py-12 border-t border-[var(--border-subtle)]">
          <h2 className="text-xl font-medium text-[var(--text-primary)] mb-4">
            도움이 필요하신가요?
          </h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Slack #claude-code 채널에서 팀원들에게 질문하세요
          </p>
          <div className="inline-flex gap-4">
            <a
              href="https://slack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              Slack 열기
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}
