/**
 * Prompt examples library components
 *
 * Provides a searchable, filterable library of prompt examples
 * with categories, difficulty levels, and copy functionality.
 */
'use client'

import { useState, useMemo, useCallback, memo } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import {
  PromptExample,
  PromptCategory,
  PROMPT_CATEGORIES,
  getAllPromptExamples,
  getAllPromptTags,
} from '@/lib/data/prompt-examples'
import { CopyButton } from '../ui/CopyButton'
import { DIFFICULTY_LABELS, Difficulty } from '@/lib/core/types'

// ============================================================================
// Sub-Components
// ============================================================================

/** Props for PromptCard component */
interface PromptCardProps {
  /** Prompt example data */
  example: PromptExample
  /** Callback when prompt is copied */
  onCopy: (text: string) => void
}

/** Individual prompt example card with expandable content */
const PromptCard = memo(function PromptCard({
  example,
  onCopy,
}: PromptCardProps) {
  const t = useTranslations('admin.prompts')
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const categoryConfig = PROMPT_CATEGORIES[example.category]
  const difficultyConfig = DIFFICULTY_LABELS[example.difficulty]

  const handleCopy = useCallback(() => {
    onCopy(example.prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [example.prompt, onCopy])

  return (
    <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-subtle)] overflow-hidden hover:border-[var(--border-primary)] transition-colors">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{categoryConfig.icon}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {categoryConfig.label}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${difficultyConfig.color}`}
              >
                {difficultyConfig.label}
              </span>
            </div>
            <h3 className="text-base font-medium text-[var(--text-primary)]">
              {example.title}
            </h3>
          </div>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              copied
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] hover:bg-[var(--bg-primary)]'
            }`}
          >
            <span>{copied ? '✓' : '⧉'}</span>
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Prompt Preview */}
      <div className="px-5 py-4">
        <div className="relative">
          <pre
            className={`text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-sans leading-relaxed ${
              isExpanded ? '' : 'line-clamp-4'
            }`}
          >
            {example.prompt}
          </pre>
          {!isExpanded && example.prompt.split('\n').length > 4 && (
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--bg-primary)] to-transparent" />
          )}
        </div>

        {example.prompt.split('\n').length > 4 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 text-xs text-[var(--accent-cyan)] hover:underline"
          >
            {isExpanded ? t('collapse') : t('showMore')}
          </button>
        )}
      </div>

      {/* Expected Outcome */}
      <div className="px-5 py-4 bg-[var(--bg-tertiary)]/50 border-t border-[var(--border-subtle)]">
        <div className="flex items-start gap-3">
          <span className="text-sm text-emerald-400">→</span>
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
              {t('expectedOutcome')}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {example.expectedOutcome}
            </p>
          </div>
        </div>
      </div>

      {/* Use Case */}
      <div className="px-5 py-4 border-t border-[var(--border-subtle)]">
        <div className="flex items-start gap-3">
          <span className="text-sm text-amber-400">💡</span>
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
              {t('useCase')}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {example.useCase}
            </p>
          </div>
        </div>
      </div>

      {/* Related Items & Tags */}
      <div className="px-5 py-4 border-t border-[var(--border-subtle)] flex items-center justify-between gap-4">
        {/* Related Items */}
        {example.relatedItems.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">{t('related')}</span>
            {example.relatedItems.map((item) => (
              <Link
                key={item.id}
                href={`/${item.type}/${item.id}`}
                className="text-xs px-2 py-1 rounded-md bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors"
              >
                {item.name}
              </Link>
            ))}
          </div>
        )}

        {/* Tags */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {example.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-1 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-muted)] uppercase tracking-wider"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
})

/** Props for CategoryFilter component */
interface CategoryFilterProps {
  /** Available categories */
  categories: PromptCategory[]
  /** Currently active category filter */
  activeCategory: PromptCategory | 'all'
  /** Callback when category changes */
  onCategoryChange: (category: PromptCategory | 'all') => void
  /** Count of prompts per category */
  counts: Record<PromptCategory | 'all', number>
}

/** Category filter button group */
const CategoryFilter = memo(function CategoryFilter({
  categories,
  activeCategory,
  onCategoryChange,
  counts,
}: CategoryFilterProps) {
  const t = useTranslations('admin.prompts')
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onCategoryChange('all')}
        className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
          activeCategory === 'all'
            ? 'bg-[var(--accent-cyan)] text-black'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
        }`}
      >
        {t('allFilter', { count: counts.all })}
      </button>
      {categories.map((category) => {
        const config = PROMPT_CATEGORIES[category]
        return (
          <button
            key={category}
            onClick={() => onCategoryChange(category)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
              activeCategory === category
                ? `bg-gradient-to-r ${config.color} text-black`
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span>{config.icon}</span>
            <span>
              {config.label} ({counts[category]})
            </span>
          </button>
        )
      })}
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

/** Props for PromptExamplesLibrary component */
export interface PromptExamplesLibraryProps {
  /** Maximum number of prompts to display */
  maxVisible?: number
}

/**
 * Full prompt examples library with search and filtering
 *
 * Features category tabs, difficulty filters, tag selection,
 * and full-text search across all prompt examples.
 */
export function PromptExamplesLibrary({
  maxVisible,
}: PromptExamplesLibraryProps = {}) {
  const t = useTranslations('admin.prompts')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<PromptCategory | 'all'>(
    'all'
  )
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | ''>(
    ''
  )
  const [showFilters, setShowFilters] = useState(false)

  const allExamples = useMemo(() => getAllPromptExamples(), [])
  const allTags = useMemo(() => getAllPromptTags(), [])
  const categories = useMemo(
    () => Object.keys(PROMPT_CATEGORIES) as PromptCategory[],
    []
  )

  // Calculate counts for each category
  const categoryCounts = useMemo(() => {
    const counts: Record<PromptCategory | 'all', number> = {
      all: allExamples.length,
      'code-review': 0,
      documentation: 0,
      'bug-fix': 0,
      refactoring: 0,
      testing: 0,
      implementation: 0,
      analysis: 0,
    }
    allExamples.forEach((example) => {
      counts[example.category]++
    })
    return counts
  }, [allExamples])

  // Filter examples
  const filteredExamples = useMemo(() => {
    let filtered = allExamples

    // Category filter
    if (activeCategory !== 'all') {
      filtered = filtered.filter(
        (example) => example.category === activeCategory
      )
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (example) =>
          example.title.toLowerCase().includes(query) ||
          example.prompt.toLowerCase().includes(query) ||
          example.expectedOutcome.toLowerCase().includes(query) ||
          example.tags.some((tag) => tag.toLowerCase().includes(query))
      )
    }

    // Tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter((example) =>
        selectedTags.every((tag) => example.tags.includes(tag))
      )
    }

    // Difficulty filter
    if (selectedDifficulty) {
      filtered = filtered.filter(
        (example) => example.difficulty === selectedDifficulty
      )
    }

    // Limit results if maxVisible is set
    if (maxVisible && maxVisible > 0) {
      filtered = filtered.slice(0, maxVisible)
    }

    return filtered
  }, [
    allExamples,
    activeCategory,
    searchQuery,
    selectedTags,
    selectedDifficulty,
    maxVisible,
  ])

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [])

  const handleTagToggle = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }, [])

  const handleClearFilters = useCallback(() => {
    setSearchQuery('')
    setActiveCategory('all')
    setSelectedTags([])
    setSelectedDifficulty('')
  }, [])

  const hasActiveFilters =
    selectedTags.length > 0 || selectedDifficulty !== '' || searchQuery !== ''

  return (
    <div className="space-y-8">
      {/* Search */}
      <div className="max-w-xl">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full px-4 py-3 pl-10 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)]"
          />
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            🔍
          </span>
        </div>
      </div>

      {/* Category Filter */}
      <CategoryFilter
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        counts={categoryCounts}
      />

      {/* Advanced Filters Toggle */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
            showFilters || hasActiveFilters
              ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--accent-cyan)]'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span>⚙</span>
          <span>{t('filter')}</span>
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-[var(--accent-cyan)]" />
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors"
          >
            {t('clearFilters')}
          </button>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] animate-fade-up">
          {/* Difficulty Filter */}
          <div className="mb-5">
            <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
              {t('difficulty')}
            </div>
            <div className="flex gap-2">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((level) => (
                <button
                  key={level}
                  onClick={() =>
                    setSelectedDifficulty(
                      selectedDifficulty === level ? '' : level
                    )
                  }
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                    selectedDifficulty === level
                      ? level === 'easy'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                        : level === 'medium'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/50'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {DIFFICULTY_LABELS[level].emoji} {DIFFICULTY_LABELS[level].label}
                </button>
              ))}
            </div>
          </div>

          {/* Tag Filter */}
          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
              {t('tags')}{selectedTags.length > 0 && ` ${t('tagsSelected', { count: selectedTags.length })}`}
            </div>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                    selectedTags.includes(tag)
                      ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/50'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results Stats */}
      <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
        <span>
          {t('results', { count: filteredExamples.length })}
          {hasActiveFilters && ` ${t('resultsTotal', { total: allExamples.length })}`}
        </span>
      </div>

      {/* Examples Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredExamples.map((example) => (
          <PromptCard key={example.id} example={example} onCopy={handleCopy} />
        ))}
      </div>

      {/* No Results */}
      {filteredExamples.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 opacity-20">🔍</div>
          <p className="text-[var(--text-secondary)] mb-4">
            {t('noResults')}
          </p>
          <button
            onClick={handleClearFilters}
            className="text-[var(--accent-cyan)] hover:underline"
          >
            {t('clearFiltersLink')}
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Compact Version for embedding in other pages
// ============================================================================

/** Props for PromptExamplesCompact component */
export interface PromptExamplesCompactProps {
  /** Optional category filter */
  category?: PromptCategory
  /** Maximum items to show */
  maxItems?: number
  /** Whether to show "View all" link */
  showViewAll?: boolean
}

/** Compact prompt examples for embedding in other pages */
export function PromptExamplesCompact({
  category,
  maxItems = 3,
  showViewAll = true,
}: PromptExamplesCompactProps) {
  const t = useTranslations('admin.prompts')
  const examples = useMemo(() => {
    const all = getAllPromptExamples()
    const filtered = category
      ? all.filter((ex) => ex.category === category)
      : all
    return filtered.slice(0, maxItems)
  }, [category, maxItems])

  if (examples.length === 0) return null

  const categoryConfig = category ? PROMPT_CATEGORIES[category] : null

  return (
    <div className="glass rounded-2xl p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-xl">{categoryConfig?.icon || '💡'}</span>
          <h2 className="text-lg font-medium text-[var(--text-primary)]">
            {categoryConfig?.label || t('promptExamples')}
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-xs text-[var(--text-muted)]">
            {t('compactCount', { count: examples.length })}
          </span>
        </div>
        {showViewAll && (
          <Link
            href="/prompts"
            className="text-xs text-[var(--accent-cyan)] hover:underline flex items-center gap-1"
          >
            <span>{t('viewAll')}</span>
            <span>→</span>
          </Link>
        )}
      </div>

      {/* Examples */}
      <div className="space-y-4">
        {examples.map((example) => (
          <div
            key={example.id}
            className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3 className="text-sm font-medium text-[var(--text-primary)]">
                {example.title}
              </h3>
              <CopyButton text={example.prompt} />
            </div>
            <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
              {example.prompt}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
