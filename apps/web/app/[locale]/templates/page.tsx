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

export default function TemplatesPage() {
  const [completedTemplate, setCompletedTemplate] = useState<GeneratedTemplate | null>(null)

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
                카탈로그
              </Link>
              <Link href="/guides" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                가이드
              </Link>
              <Link href="/templates" className="text-sm text-[var(--accent-cyan)] font-medium">
                템플릿
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
              스킬 템플릿 생성기
            </h1>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
              카테고리별 최적화된 템플릿으로 Claude Code 스킬을 빠르게 만들어보세요.
              <br />
              Best practices가 자동으로 적용됩니다.
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">📊</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">데이터 참조</h3>
              <p className="text-xs text-[var(--text-muted)]">
                DB, API 등 외부 데이터를 활용하는 스킬
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">🔄</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">워크플로우</h3>
              <p className="text-xs text-[var(--text-muted)]">
                반복 작업을 자동화하는 스킬
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">🔍</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">코드 분석</h3>
              <p className="text-xs text-[var(--text-muted)]">
                코드 품질과 보안을 분석하는 스킬
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="text-2xl mb-2">📝</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">문서화</h3>
              <p className="text-xs text-[var(--text-muted)]">
                자동 문서 생성 및 관리 스킬
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
                  <p className="text-green-400 font-medium">템플릿 생성 완료!</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    <code className="text-[var(--accent-cyan)]">{completedTemplate.id}</code> 스킬이
                    준비되었습니다.
                  </p>
                </div>
              </div>

              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setCompletedTemplate(null)}
                  className="px-6 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  새 템플릿 만들기
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
            스킬 작성 팁
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <div className="text-xl mb-3">🎯</div>
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                명확한 트리거 설정
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                설명에 &quot;~할 때&quot;, &quot;~작업 시&quot; 같은 키워드를 포함하면 Claude가 적절한 시점에
                스킬을 활성화합니다.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <div className="text-xl mb-3">🔒</div>
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                최소 권한 원칙
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                필요한 도구만 허용하여 안전성을 높이세요. 읽기만 필요하면 Read, Grep, Glob만
                허용하는 것이 좋습니다.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <div className="text-xl mb-3">📋</div>
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                구체적인 예시 제공
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                스킬 내용에 구체적인 사용 예시를 포함하면 Claude가 더 정확하게 스킬을 활용할 수
                있습니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-light text-[var(--text-primary)] mb-4">
            직접 만든 스킬을 팀과 공유하세요
          </h2>
          <p className="text-[var(--text-secondary)] mb-8">
            템플릿을 기반으로 스킬을 커스터마이징한 후, 카탈로그에 등록하여 팀원들과 함께
            사용하세요.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/getting-started"
              className="px-6 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              시작 가이드
            </Link>
            <Link
              href="/"
              className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30 hover:bg-[var(--accent-cyan)]/20 transition-colors"
            >
              카탈로그 둘러보기
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
