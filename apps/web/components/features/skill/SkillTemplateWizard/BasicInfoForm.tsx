/**
 * Basic info form component for wizard
 *
 * Collects skill name, description, and optional custom ID
 * with auto-generated ID preview and best practices display.
 */
'use client'

import { useTranslations } from 'next-intl'
import type { TemplateCategoryInfo } from './types'

/** Props for BasicInfoForm component */
interface BasicInfoFormProps {
  /** Current skill name value */
  skillName: string
  /** Handler for skill name changes */
  onSkillNameChange: (name: string) => void
  /** Current skill description value */
  skillDescription: string
  /** Handler for description changes */
  onSkillDescriptionChange: (description: string) => void
  /** Custom skill ID override */
  customId: string
  /** Handler for custom ID changes */
  onCustomIdChange: (id: string) => void
  /** Auto-generated ID from skill name */
  generatedId: string
  /** Selected category info for best practices */
  categoryInfo: TemplateCategoryInfo | null
}

/**
 * Skill basic information form
 *
 * Form fields for skill name, description, and ID with
 * auto-generation and category-specific best practices.
 */
export function BasicInfoForm({
  skillName,
  onSkillNameChange,
  skillDescription,
  onSkillDescriptionChange,
  customId,
  onCustomIdChange,
  generatedId,
  categoryInfo,
}: BasicInfoFormProps) {
  const t = useTranslations('templates.skillWizard.basicInfoForm')

  return (
    <div className="animate-fade-up">
      <h2 className="text-xl font-medium text-[var(--text-primary)] mb-2">{t('title')}</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">{t('subtitle')}</p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
            {t('skillNameLabel')}
          </label>
          <input
            type="text"
            value={skillName}
            onChange={(e) => onSkillNameChange(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
            placeholder="예: Database Schema Reference"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
            {t('skillIdLabel')}
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={customId}
              onChange={(e) => onCustomIdChange(e.target.value)}
              className="flex-1 px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors font-mono"
              placeholder={generatedId || 'auto-generated'}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {t('skillIdHint')}{' '}
            <code className="text-[var(--accent-cyan)]">{generatedId || '...'}</code>
          </p>
        </div>

        <div>
          <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
            {t('descriptionLabel')}{' '}
            <span className="normal-case text-[var(--text-muted)]">
              {t('descriptionLabelTrigger')}
            </span>
          </label>
          <textarea
            value={skillDescription}
            onChange={(e) => onSkillDescriptionChange(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors resize-none"
            rows={3}
            placeholder="예: 데이터베이스 스키마나 테이블 구조를 참조할 때 사용합니다"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">{t('descriptionTip')}</p>
        </div>

        {categoryInfo && (
          <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <span>{categoryInfo.icon}</span>
              {categoryInfo.name} Best Practices
            </h4>
            <ul className="space-y-1">
              {categoryInfo.bestPractices.map((practice, i) => (
                <li
                  key={i}
                  className="text-xs text-[var(--text-secondary)] flex items-start gap-2"
                >
                  <span className="text-[var(--accent-cyan)]">-</span>
                  {practice}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
