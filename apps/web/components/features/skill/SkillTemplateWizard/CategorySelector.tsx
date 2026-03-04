/**
 * Category selector component for wizard
 *
 * Grid of selectable template categories with icons,
 * descriptions, and recommended tool previews.
 */
'use client'

import { useTranslations } from 'next-intl'
import type { TemplateCategory, TemplateCategoryInfo } from './types'

/** Props for CategorySelector component */
interface CategorySelectorProps {
  /** Available template categories */
  categories: TemplateCategoryInfo[]
  /** Currently selected category ID */
  selectedCategory: TemplateCategory | null
  /** Handler for category selection */
  onSelect: (category: TemplateCategory) => void
}

/**
 * Template category selection grid
 *
 * Displays category cards with visual indicators for selection
 * and previews of recommended tools.
 */
export function CategorySelector({
  categories,
  selectedCategory,
  onSelect,
}: CategorySelectorProps) {
  const t = useTranslations('templates.skillWizard.categorySelector')

  return (
    <div className="animate-fade-up">
      <h2 className="text-xl font-medium text-[var(--text-primary)] mb-2">{t('title')}</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">{t('subtitle')}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelect(category.id)}
            className={`p-6 rounded-xl text-left transition-all ${
              selectedCategory === category.id
                ? 'bg-[var(--accent-cyan)]/10 border-2 border-[var(--accent-cyan)]'
                : 'bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)]'
            }`}
          >
            <div className="flex items-start gap-4">
              <span
                className={`text-3xl w-12 h-12 flex items-center justify-center rounded-lg bg-gradient-to-br ${category.gradient} bg-opacity-20`}
              >
                {category.icon}
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">
                  {category.name}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                  {category.description}
                </p>
                <div className="flex flex-wrap gap-1 mt-3">
                  {category.recommendedTools.slice(0, 4).map((tool) => (
                    <span
                      key={tool}
                      className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                    >
                      {tool}
                    </span>
                  ))}
                  {category.recommendedTools.length > 4 && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                      +{category.recommendedTools.length - 4}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
