/**
 * Welcome landing page
 *
 * 코딩 에이전트 사용자에게 AI Toolkit 플랫폼을 소개하고
 * 플러그인 연결 방법을 안내하는 퍼블릭 랜딩페이지.
 * Claude Code, OpenCode, Codex 세 가지 플러그인을 모두 안내한다.
 */
import { Link } from '@/i18n/navigation'
import { Footer } from '@/components/layout/Footer'
import { CopyButton } from './CopyButton'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'

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

  /** Feature 카드 데이터 */
  const FEATURES = [
    {
      icon: '/',
      label: 'Skills',
      title: t('features.skills.title'),
      description: t('features.skills.description'),
    },
    {
      icon: '@',
      label: 'Agents',
      title: t('features.agents.title'),
      description: t('features.agents.description'),
    },
    {
      icon: '>',
      label: 'Commands',
      title: t('features.commands.title'),
      description: t('features.commands.description'),
    },
    {
      icon: '?',
      label: 'Guides',
      title: t('features.guides.title'),
      description: t('features.guides.description'),
    },
  ] as const

  /** MCP 도구 예시 데이터 */
  const TOOL_EXAMPLES = [
    {
      tool: 'semantic_search',
      description: t('tools.semanticSearch'),
      example: 'semantic_search("code review")',
    },
    {
      tool: 'get_plugin_content',
      description: t('tools.getPluginContent'),
      example: 'get_plugin_content("code-reviewer")',
    },
    {
      tool: 'deploy_skill',
      description: t('tools.deploySkill'),
      example: 'deploy_skill(type="skill", name="my-skill", ...)',
    },
    {
      tool: 'check_updates',
      description: t('tools.checkUpdates'),
      example: 'check_updates(["code-reviewer", "refactor-guide"])',
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
            {t('hero.description')}
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

      {/* Features Section */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4 text-center">
            {t('features.badge')}
          </p>
          <h2
            className="text-3xl md:text-4xl font-light text-[var(--text-primary)] leading-[1.2] tracking-[-0.02em] mb-12 text-center"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            {t('features.title')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.label}
                className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-sm p-6 hover:border-[var(--brand-primary)]/30 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center text-sm font-mono text-[var(--brand-primary)]">
                    {feature.icon}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    {feature.label}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {feature.description}
                </p>
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

          {/* Command Box */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-sm p-6 mb-10">
            <p className="text-xs text-[var(--text-muted)] mb-3">{t('connect.terminalLabel')}</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-[var(--bg-secondary)] rounded-lg px-4 py-3 text-sm font-mono text-[var(--text-primary)] overflow-x-auto">
                {MCP_COMMAND}
              </code>
              <CopyButton text={MCP_COMMAND} />
            </div>
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

      {/* What's Inside Section */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4 text-center">
            {t('tools.badge')}
          </p>
          <h2
            className="text-3xl md:text-4xl font-light text-[var(--text-primary)] leading-[1.2] tracking-[-0.02em] mb-12 text-center"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            {t('tools.title')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TOOL_EXAMPLES.map((item) => (
              <div
                key={item.tool}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-sm p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <code className="text-sm font-mono font-semibold text-[var(--brand-primary)]">
                    {item.tool}
                  </code>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-3">{item.description}</p>
                <pre className="bg-[var(--bg-secondary)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-muted)] overflow-x-auto">
                  {item.example}
                </pre>
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
