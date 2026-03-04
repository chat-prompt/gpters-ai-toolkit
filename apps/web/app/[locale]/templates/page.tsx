/**
 * Templates page
 *
 * Interactive wizard for generating skill templates with
 * customizable patterns, examples, and best practices.
 */
'use client'

import { Link } from '@/i18n/navigation'
import { SkillTemplateWizard, GeneratedTemplate } from '@/components/features/skill/SkillTemplateWizard'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

export default function TemplatesPage() {
  const [completedTemplate, setCompletedTemplate] = useState<GeneratedTemplate | null>(null)
  const t = useTranslations('templates')

  const handleComplete = (template: GeneratedTemplate) => {
    setCompletedTemplate(template)
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/80 backdrop-blur-lg border-b border-[var(--border-subtle)]">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <span className="text-xl">⚡</span>
              <span className="font-medium text-[var(--text-primary)]">AI Toolkit</span>
            </Link>
            <nav className="flex items-center gap-6">
              <Link href="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                {t('nav.catalog')}
              </Link>
              <Link href="/guides" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                {t('nav.guides')}
              </Link>
              <Link href="/templates" className="text-sm text-[var(--accent-cyan)] font-medium">
                {t('nav.templates')}
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-16 px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-cyan)]/5 via-transparent to-[var(--accent-purple)]/5" />
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] mb-6">
              <span className="text-sm">🔧</span>
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                Skill Template Generator
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-light text-[var(--text-primary)] mb-4 tracking-tight">
              {t('hero.title')}
            </h1>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
              {t('hero.subtitle')}
              <br />
              {t('hero.subtitleNote')}
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">📊</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">{t('features.dataReference.title')}</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {t('features.dataReference.description')}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">🔄</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">{t('features.workflow.title')}</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {t('features.workflow.description')}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">🔍</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">{t('features.codeAnalysis.title')}</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {t('features.codeAnalysis.description')}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">📝</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">{t('features.documentation.title')}</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {t('features.documentation.description')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Wizard Section */}
      <section className="py-12 px-8">
        <div className="max-w-7xl mx-auto">
          {completedTemplate ? (
            <div className="text-center">
              <div className="inline-flex items-center gap-3 px-6 py-4 rounded-xl bg-green-500/10 border border-green-500/20 mb-8">
                <span className="text-2xl">🎉</span>
                <div className="text-left">
                  <p className="text-green-400 font-medium">{t('completion.success')}</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    <code className="text-[var(--accent-cyan)]">{completedTemplate.id}</code> {t('completion.ready')}
                  </p>
                </div>
              </div>

              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setCompletedTemplate(null)}
                  className="px-6 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  {t('completion.createNew')}
                </button>
              </div>
            </div>
          ) : (
            <SkillTemplateWizard onComplete={handleComplete} />
          )}
        </div>
      </section>

      {/* Tips Section */}
      <section className="py-12 px-8 bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-light text-[var(--text-primary)] mb-8 text-center">
            {t('tips.title')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <div className="text-xl mb-3">🎯</div>
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                {t('tips.clearTrigger.title')}
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {t('tips.clearTrigger.description')}
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <div className="text-xl mb-3">🔒</div>
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                {t('tips.leastPrivilege.title')}
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {t('tips.leastPrivilege.description')}
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <div className="text-xl mb-3">📋</div>
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                {t('tips.examples.title')}
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {t('tips.examples.description')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-light text-[var(--text-primary)] mb-4">
            {t('cta.title')}
          </h2>
          <p className="text-[var(--text-secondary)] mb-8">
            {t('cta.description')}
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/getting-started"
              className="px-6 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              {t('cta.gettingStarted')}
            </Link>
            <Link
              href="/"
              className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30 hover:bg-[var(--accent-cyan)]/20 transition-colors"
            >
              {t('cta.browseCatalog')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
