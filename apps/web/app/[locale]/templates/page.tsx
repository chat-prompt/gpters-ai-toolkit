'use client'

/**
 * 스킬 템플릿 생성기 페이지
 *
 * 카테고리를 고르면 그에 맞춘 스킬 뼈대를 만들어 준다.
 * 마법사 자체는 별도 컴포넌트가 맡고, 이 파일은 그 앞뒤 설명만 조판한다.
 */

import { Link } from '@/i18n/navigation'
import { SkillTemplateWizard, GeneratedTemplate } from '@/components/features/skill/SkillTemplateWizard'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

/** 소개 칸에 세울 특징 키 — 문구는 i18n 에서 가져온다 */
const FEATURE_KEYS = ['dataReference', 'workflow', 'codeAnalysis', 'documentation'] as const

/** 작성 팁 칸에 세울 키 */
const TIP_KEYS = ['clearTrigger', 'leastPrivilege', 'examples'] as const

/** 페이지 안에서 반복되는 버튼 모양 */
const BUTTON_CLASS =
  'rounded-full border border-[var(--border-hover)] px-5 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] active:translate-y-px'

/**
 * 스킬 템플릿 생성기 페이지
 */
export default function TemplatesPage() {
  const [completedTemplate, setCompletedTemplate] = useState<GeneratedTemplate | null>(null)
  const t = useTranslations('templates')

  const handleComplete = (template: GeneratedTemplate) => {
    setCompletedTemplate(template)
  }

  return (
    <div className="page-shell">
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-4 md:px-10">
          <Link href="/" className="font-medium text-[var(--text-primary)]">
            AI Toolkit
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/"
              className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              {t('nav.catalog')}
            </Link>
            <Link
              href="/guides"
              className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              {t('nav.guides')}
            </Link>
            <Link href="/templates" className="text-sm font-medium text-[var(--text-primary)]">
              {t('nav.templates')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="page-main">
        {/* 왼쪽 정렬 — 가운데 정렬 히어로를 쓰지 않는다 */}
        <header className="reveal">
          <p className="eyebrow">{t('hero.badge')}</p>
          <h1 className="page-title mt-3">{t('hero.title')}</h1>
          <p className="page-subtitle">
            {t('hero.subtitle')} {t('hero.subtitleNote')}
          </p>
        </header>

        {/* 특징 — 칸 사이를 1px 선으로만 나눈다 */}
        <div className="reveal mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-[var(--border-subtle)] sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_KEYS.map((key) => (
            <div key={key} className="bg-[var(--bg-primary)] px-6 py-5">
              <h2 className="text-sm font-medium text-[var(--text-primary)]">
                {t(`features.${key}.title`)}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
                {t(`features.${key}.description`)}
              </p>
            </div>
          ))}
        </div>

        {/* 마법사 */}
        <section className="mt-12">
          {completedTemplate ? (
            <div className="surface-card">
              <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)]">
                {t('completion.success')}
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                <code className="font-mono text-[var(--text-primary)]">
                  {completedTemplate.id}
                </code>{' '}
                {t('completion.ready')}
              </p>
              <button
                onClick={() => setCompletedTemplate(null)}
                className={`${BUTTON_CLASS} mt-5`}
              >
                {t('completion.createNew')}
              </button>
            </div>
          ) : (
            <SkillTemplateWizard onComplete={handleComplete} />
          )}
        </section>

        {/* 작성 팁 */}
        <section className="mt-16">
          <h2 className="text-xl font-medium tracking-tight text-[var(--text-primary)]">
            {t('tips.title')}
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3 items-start">
            {TIP_KEYS.map((key) => (
              <div key={key} className="surface-card">
                <h3 className="text-base font-medium text-[var(--text-primary)]">
                  {t(`tips.${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {t(`tips.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 다음 걸음 */}
        <section className="mt-16 border-t border-[var(--border-subtle)] pt-10">
          <h2 className="text-xl font-medium tracking-tight text-[var(--text-primary)]">
            {t('cta.title')}
          </h2>
          <p className="page-subtitle">{t('cta.description')}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/getting-started" className={BUTTON_CLASS}>
              {t('cta.gettingStarted')}
            </Link>
            <Link
              href="/"
              className="rounded-full bg-[var(--text-primary)] px-5 py-2.5 text-sm font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 active:translate-y-px"
            >
              {t('cta.browseCatalog')}
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
