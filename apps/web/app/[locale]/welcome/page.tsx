/**
 * 소개 랜딩 페이지
 *
 * 코딩 에이전트 사용자에게 AI Toolkit 을 소개하고 플러그인 연결 방법을 안내한다.
 * 로그인 없이 열리는 화면이라, 무엇을 주는 곳인지부터 읽히게 조판한다.
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

/** 구획 사이 간격 — 페이지 전체에서 같은 리듬을 쓴다 */
const SECTION_CLASS = 'mt-20 border-t border-[var(--border-subtle)] pt-12'

/** 구획 제목 */
const SECTION_TITLE_CLASS = 'mt-3 text-2xl md:text-3xl font-medium tracking-tight text-[var(--text-primary)]'

/**
 * 로케일에 맞는 메타데이터를 만든다
 *
 * @param params - locale 을 담은 라우트 파라미터
 * @returns 로케일별 제목·설명이 담긴 메타데이터
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
 * 소개 랜딩 페이지
 *
 * @param params - locale 을 담은 라우트 파라미터
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

  /** 동작 방식 단계 */
  const HOW_IT_WORKS_STEPS = [
    { key: 'step1', number: '1' },
    { key: 'step2', number: '2' },
    { key: 'step3', number: '3' },
  ] as const

  /** 왜 쓰는지 — 문구는 i18n 에서 가져온다 */
  const WHY_KEYS = ['lazyLoading', 'autoRecommend', 'multiAgent'] as const

  /** 인기 스킬 예시 */
  const POPULAR_SKILLS = [
    {
      name: 'Deep Interview Prompt',
      id: 'deep-interview-prompt',
      description: '소크라틱 방식의 심층 인터뷰로 요구사항을 정밀하게 도출',
    },
    {
      name: 'Vercel React Best Practices',
      id: 'vercel-react-best-practices',
      description: 'Vercel 엔지니어링 팀의 React/Next.js 성능 최적화 가이드',
    },
    {
      name: 'Markdown to PDF 변환',
      id: 'md2pdf',
      description: 'Markdown 문서를 깔끔한 PDF로 변환 — 한글 지원',
    },
  ] as const

  /** 사용 예시 */
  const USAGE_EXAMPLES = [
    {
      title: t('usage.naturalLanguage.title'),
      description: t('usage.naturalLanguage.description'),
      examples: [
        t('usage.naturalLanguage.example1'),
        t('usage.naturalLanguage.example2'),
        t('usage.naturalLanguage.example3'),
      ],
    },
    {
      title: t('usage.deploy.title'),
      description: t('usage.deploy.description'),
      examples: [
        t('usage.deploy.example1'),
        t('usage.deploy.example2'),
      ],
    },
    {
      title: t('usage.update.title'),
      description: t('usage.update.description'),
      examples: [
        t('usage.update.example1'),
      ],
    },
    {
      title: t('usage.cli.title'),
      description: t('usage.cli.description'),
      examples: [
        t('usage.cli.example1'),
        t('usage.cli.example2'),
      ],
    },
  ] as const

  return (
    <div className="page-shell">
      <main className="page-main">
        {/* 왼쪽 정렬 — 가운데 정렬 히어로를 쓰지 않는다 */}
        <header className="reveal max-w-2xl pt-8">
          <p className="eyebrow">{SITE_NAME}</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-medium leading-tight tracking-tight text-[var(--text-primary)]">
            <span className="text-[var(--brand-primary)]">{t('hero.titleHighlight')}</span>{' '}
            {t('hero.titleSuffix')}
          </h1>
          <p className="page-subtitle whitespace-pre-line">
            {t('hero.description', { count: skillCount })}
          </p>
          <a
            href="#connect"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] px-6 py-2.5 text-sm font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 active:translate-y-px"
          >
            {t('hero.cta')}
            <span aria-hidden="true">&darr;</span>
          </a>
        </header>

        {/* 왜 쓰는지 */}
        <section className={SECTION_CLASS}>
          <p className="eyebrow">{t('why.badge')}</p>
          <h2 className={SECTION_TITLE_CLASS}>{t('why.title')}</h2>
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3 items-start">
            {WHY_KEYS.map((key) => (
              <div key={key} className="surface-card">
                <h3 className="text-base font-medium text-[var(--text-primary)]">
                  {t(`why.${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {t(`why.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 동작 방식 */}
        <section className={SECTION_CLASS}>
          <p className="eyebrow">{t('howItWorks.badge')}</p>
          <h2 className={SECTION_TITLE_CLASS}>{t('howItWorks.title')}</h2>
          <ol className="mt-8 max-w-3xl divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <li key={step.key} className="flex items-start gap-5 py-5">
                <span className="font-mono text-sm tabular-nums text-[var(--text-muted)]">
                  {step.number}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-medium text-[var(--text-primary)]">
                    {t(`howItWorks.${step.key}.title`)}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {t(`howItWorks.${step.key}.description`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 연결하기 */}
        <section id="connect" className={`${SECTION_CLASS} scroll-mt-8`}>
          <p className="eyebrow">{t('connect.badge')}</p>
          <h2 className={SECTION_TITLE_CLASS}>
            {t('connect.title')}{' '}
            <span className="text-[var(--brand-primary)]">{t('connect.titleHighlight')}</span>
          </h2>

          <div className="mt-8 max-w-3xl">
            <ConnectTabs baseUrl={BASE_URL} />

            <ol className="mt-8 divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
              {(['1', '2', '3'] as const).map((step) => (
                <li key={step} className="flex items-start gap-5 py-4">
                  <span className="font-mono text-sm tabular-nums text-[var(--text-muted)]">
                    {step}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">
                      {t(`connect.steps.${step}.title`)}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {t(`connect.steps.${step}.description`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-6 text-sm text-[var(--text-secondary)]">
              {t('connect.moreSetup')}{' '}
              <Link
                href="/getting-started"
                className="font-medium text-[var(--brand-primary)] hover:underline"
              >
                {t('connect.gettingStartedLink')}
              </Link>
              {t('connect.moreSetupSuffix')}
            </p>
          </div>
        </section>

        {/* 인기 스킬 */}
        <section className={SECTION_CLASS}>
          <p className="eyebrow">{t('popularSkills.badge')}</p>
          <h2 className={`${SECTION_TITLE_CLASS} mb-8`}>{t('popularSkills.title')}</h2>
          <SkillPreviewCards skills={POPULAR_SKILLS} viewAllLabel={t('popularSkills.viewAll')} />
        </section>

        {/* 사용 예시 */}
        <section className={SECTION_CLASS}>
          <p className="eyebrow">{t('usage.badge')}</p>
          <h2 className={SECTION_TITLE_CLASS}>{t('usage.title')}</h2>
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 items-start">
            {USAGE_EXAMPLES.map((item) => (
              <div key={item.title} className="surface-card">
                <h3 className="text-base font-medium text-[var(--text-primary)]">{item.title}</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.description}</p>
                <div className="mt-4 space-y-2">
                  {item.examples.map((example, i) => (
                    <pre
                      key={i}
                      className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 font-mono text-xs text-[var(--text-secondary)]"
                    >
                      {example}
                    </pre>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
