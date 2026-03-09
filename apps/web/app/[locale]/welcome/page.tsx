/**
 * Welcome landing page
 *
 * 코딩 에이전트 사용자에게 AI Toolkit 플랫폼을 소개하고
 * 플러그인 연결 방법을 안내하는 퍼블릭 랜딩페이지.
 * Claude Code, OpenCode, Codex 세 가지 플러그인을 모두 안내한다.
 */
import { Link } from '@/i18n/navigation'
import { Footer } from '@/components/layout/Footer'
import { ConnectTabs } from './ConnectTabs'
import { SkillPreviewCards } from './SkillPreviewCards'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getCatalog } from '@/lib/core/catalog'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'AI Toolkit'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://ai-toolkit.gpters.org'
const MCP_COMMAND = `claude mcp add gpters-ai-toolkit ${BASE_URL}/api/mcp -t http`

/** 플러그인별 연결 커맨드 */
const PLUGIN_COMMANDS = {
  claudeCode: MCP_COMMAND,
  opencode: `# opencode settings.json\n{\n  "mcpServers": {\n    "gpters-ai-toolkit": {\n      "type": "http",\n      "url": "${BASE_URL}/api/mcp"\n    }\n  }\n}`,
  codex: `# codex MCP config\ncodex --mcp-config '{"gpters-ai-toolkit":{"type":"http","url":"${BASE_URL}/api/mcp"}}'`,
} as const

/**
 * Generate locale-aware metadata for the welcome page
 *
 * @param params - Route params containing the locale
 * @returns Metadata object with localized title and description
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata.welcome' })

  return {
    title: t('title'),
    description: t('description'),
  }
}

/**
 * Welcome landing page with i18n support
 *
 * @param params - Route params including locale
 */
export default async function WelcomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('welcome')
  const catalog = await getCatalog(locale)
  const skillCount = catalog.length

  /** How It Works 스텝 데이터 */
  const HOW_IT_WORKS_STEPS = [
    { key: 'step1', number: '1' },
    { key: 'step2', number: '2' },
    { key: 'step3', number: '3' },
  ] as const

  /** 인기 스킬 예시 데이터 */
  const POPULAR_SKILLS = [
    {
      name: 'Deep Interview Prompt',
      id: 'deep-interview-prompt',
      description: '소크라틱 방식의 심층 인터뷰로 요구사항을 정밀하게 도출',
      icon: '🎙',
    },
    {
      name: 'Vercel React Best Practices',
      id: 'vercel-react-best-practices',
      description: 'Vercel 엔지니어링 팀의 React/Next.js 성능 최적화 가이드',
      icon: '⚡',
    },
    {
      name: 'Markdown to PDF 변환',
      id: 'md2pdf',
      description: 'Markdown 문서를 깔끔한 PDF로 변환 — 한글 지원',
      icon: '📄',
    },
  ] as const

  /** 사용 예시 데이터 */
  const USAGE_EXAMPLES = [
    {
      icon: '💬',
      title: t('usage.naturalLanguage.title'),
      description: t('usage.naturalLanguage.description'),
      examples: [
        t('usage.naturalLanguage.example1'),
        t('usage.naturalLanguage.example2'),
        t('usage.naturalLanguage.example3'),
      ],
    },
    {
      icon: '🚀',
      title: t('usage.deploy.title'),
      description: t('usage.deploy.description'),
      examples: [
        t('usage.deploy.example1'),
        t('usage.deploy.example2'),
      ],
    },
    {
      icon: '🔄',
      title: t('usage.update.title'),
      description: t('usage.update.description'),
      examples: [
        t('usage.update.example1'),
      ],
    },
    {
      icon: '🔍',
      title: t('usage.cli.title'),
      description: t('usage.cli.description'),
      examples: [
        t('usage.cli.example1'),
        t('usage.cli.example2'),
      ],
    },
  ] as const

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 pt-24 pb-20 px-8">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-6">
            {SITE_NAME}
          </p>
          <h1
            className="text-5xl md:text-7xl font-light text-[var(--text-primary)] leading-[1.1] tracking-[-0.03em] mb-6"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            <span className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] bg-clip-text text-transparent font-medium">
              {t('hero.titleHighlight')}
            </span>{' '}
            {t('hero.titleSuffix')}
          </h1>
          <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto mb-10 whitespace-pre-line">
            {t('hero.description', { count: skillCount })}
          </p>
          <a
            href="#connect"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-medium bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] text-white hover:opacity-90 transition-opacity"
          >
            {t('hero.cta')}
            <span aria-hidden="true">&darr;</span>
          </a>
        </div>
      </section>

      {/* Why AI Toolkit Section */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4 text-center">
            {t('why.badge')}
          </p>
          <h2
            className="text-3xl md:text-4xl font-light text-[var(--text-primary)] leading-[1.2] tracking-[-0.02em] mb-12 text-center"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            {t('why.title')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {([
              { key: 'lazyLoading', icon: '⚡' },
              { key: 'autoRecommend', icon: '🎯' },
              { key: 'multiAgent', icon: '🔗' },
            ] as const).map((item) => (
              <div key={item.key} className="flex flex-col items-center text-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-sm p-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-[var(--bg-secondary)] text-2xl mb-5">{item.icon}</div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
                  {t(`why.${item.key}.title`)}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {t(`why.${item.key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4 text-center">
            {t('howItWorks.badge')}
          </p>
          <h2
            className="text-3xl md:text-4xl font-light text-[var(--text-primary)] leading-[1.2] tracking-[-0.02em] mb-12 text-center"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            {t('howItWorks.title')}
          </h2>
          <div className="space-y-6">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <div key={step.key} className="flex items-start gap-5">
                <span className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] flex items-center justify-center text-white text-lg font-medium">
                  {step.number}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
                    {t(`howItWorks.${step.key}.title`)}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {t(`howItWorks.${step.key}.description`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Connect Section */}
      <section id="connect" className="relative z-10 py-20 px-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4 text-center">
            {t('connect.badge')}
          </p>
          <h2
            className="text-3xl md:text-4xl font-light text-[var(--text-primary)] leading-[1.2] tracking-[-0.02em] mb-12 text-center"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            {t('connect.title')}{' '}
            <span className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] bg-clip-text text-transparent font-medium">
              {t('connect.titleHighlight')}
            </span>
          </h2>

          {/* Plugin Connection Tabs */}
          <div className="mb-10">
            <ConnectTabs baseUrl={BASE_URL} />
          </div>

          {/* Steps */}
          <div className="space-y-6">
            {(['1', '2', '3'] as const).map((step) => (
              <div key={step} className="flex items-start gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] flex items-center justify-center text-white text-sm font-medium">
                  {step}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                    {t(`connect.steps.${step}.title`)}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {t(`connect.steps.${step}.description`)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Getting Started link */}
          <p className="text-sm text-[var(--text-secondary)] mt-8 text-center">
            {t('connect.moreSetup')}{' '}
            <Link href="/getting-started" className="text-[var(--brand-primary)] hover:underline font-medium">
              {t('connect.gettingStartedLink')}
            </Link>
            {t('connect.moreSetupSuffix')}
          </p>
        </div>
      </section>

      {/* Popular Skills Section */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4 text-center">
            {t('popularSkills.badge')}
          </p>
          <h2
            className="text-3xl md:text-4xl font-light text-[var(--text-primary)] leading-[1.2] tracking-[-0.02em] mb-12 text-center"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            {t('popularSkills.title')}
          </h2>
          <SkillPreviewCards skills={POPULAR_SKILLS} viewAllLabel={t('popularSkills.viewAll')} />
        </div>
      </section>

      {/* Usage Examples Section */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4 text-center">
            {t('usage.badge')}
          </p>
          <h2
            className="text-3xl md:text-4xl font-light text-[var(--text-primary)] leading-[1.2] tracking-[-0.02em] mb-12 text-center"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            {t('usage.title')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {USAGE_EXAMPLES.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-sm p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{item.icon}</span>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {item.title}
                  </h3>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-3">{item.description}</p>
                <div className="space-y-1.5">
                  {item.examples.map((ex, i) => (
                    <pre key={i} className="bg-[var(--bg-secondary)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-muted)] overflow-x-auto">
                      {ex}
                    </pre>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  )
}
