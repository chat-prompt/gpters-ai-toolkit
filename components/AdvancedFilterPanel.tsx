'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  FilterState,
  FilterPreset,
  SortConfig,
  FilterCounts,
  SavedFilter,
  FILTER_PRESETS,
  SORT_OPTIONS,
  DEFAULT_FILTER_STATE,
  getSavedFilters,
  saveFilter,
  deleteSavedFilter,
  getSortDescription,
  countActiveFilters,
} from '@/lib/advanced-filter'
import { TAGS, DIFFICULTY_LABELS, TEAM_TAGS, TeamTag, Difficulty } from '@/lib/types'

// ============================================================================
// Filter Preset Button
// ============================================================================

interface PresetButtonProps {
  preset: FilterPreset
  isActive: boolean
  onClick: () => void
}

function PresetButton({ preset, isActive, onClick }: PresetButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
        isActive
          ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/50'
          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
      }`}
      title={preset.description}
    >
      <span>{preset.icon}</span>
      <span>{preset.nameKo}</span>
    </button>
  )
}

// ============================================================================
// Sort Selector
// ============================================================================

interface SortSelectorProps {
  value: SortConfig
  onChange: (config: SortConfig) => void
}

function SortSelector({ value, onChange }: SortSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)]">정렬:</span>
      <select
        value={`${value.field}-${value.direction}`}
        onChange={(e) => {
          const [field, direction] = e.target.value.split('-') as [SortConfig['field'], SortConfig['direction']]
          onChange({ field, direction })
        }}
        className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-[var(--accent-cyan)] outline-none"
      >
        {SORT_OPTIONS.map((option) => (
          <option
            key={`${option.value.field}-${option.value.direction}`}
            value={`${option.value.field}-${option.value.direction}`}
          >
            {option.labelKo}
          </option>
        ))}
      </select>
    </div>
  )
}

// ============================================================================
// Tag Filter with Counts
// ============================================================================

interface TagFilterWithCountsProps {
  availableTags: string[]
  selectedTags: string[]
  tagsOperator: 'AND' | 'OR'
  counts: Record<string, number>
  onTagToggle: (tag: string) => void
  onOperatorChange: (op: 'AND' | 'OR') => void
}

function TagFilterWithCounts({
  availableTags,
  selectedTags,
  tagsOperator,
  counts,
  onTagToggle,
  onOperatorChange,
}: TagFilterWithCountsProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          태그 {selectedTags.length > 0 && `(${selectedTags.length}개 선택)`}
        </div>
        {selectedTags.length > 1 && (
          <div className="flex gap-1">
            <button
              onClick={() => onOperatorChange('AND')}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                tagsOperator === 'AND'
                  ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              모두 포함
            </button>
            <button
              onClick={() => onOperatorChange('OR')}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                tagsOperator === 'OR'
                  ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              하나 이상
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {availableTags.map((tag) => {
          const count = counts[tag] || 0
          const isSelected = selectedTags.includes(tag)
          return (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              disabled={count === 0 && !isSelected}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/50'
                  : count === 0
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]/50 cursor-not-allowed'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]'
              }`}
            >
              <span>{TAGS[tag]?.label || tag}</span>
              <span className={`text-[10px] ${isSelected ? 'text-[var(--accent-cyan)]/70' : 'text-[var(--text-muted)]/60'}`}>
                ({count})
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Likes Range Filter
// ============================================================================

interface LikesRangeFilterProps {
  min?: number
  max?: number
  onChange: (range: { min?: number; max?: number }) => void
}

function LikesRangeFilter({ min, max, onChange }: LikesRangeFilterProps) {
  return (
    <div>
      <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
        좋아요 수
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="최소"
          value={min ?? ''}
          onChange={(e) => onChange({ min: e.target.value ? parseInt(e.target.value) : undefined, max })}
          className="w-20 px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-[var(--accent-cyan)] outline-none"
        />
        <span className="text-xs text-[var(--text-muted)]">~</span>
        <input
          type="number"
          placeholder="최대"
          value={max ?? ''}
          onChange={(e) => onChange({ min, max: e.target.value ? parseInt(e.target.value) : undefined })}
          className="w-20 px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-[var(--accent-cyan)] outline-none"
        />
        {(min !== undefined || max !== undefined) && (
          <button
            onClick={() => onChange({ min: undefined, max: undefined })}
            className="text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Date Range Filter
// ============================================================================

interface DateRangeFilterProps {
  after?: Date
  before?: Date
  onChange: (range: { after?: Date; before?: Date }) => void
}

function DateRangeFilter({ after, before, onChange }: DateRangeFilterProps) {
  const formatDate = (date: Date) => date.toISOString().split('T')[0]

  return (
    <div>
      <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
        업데이트 날짜
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={after ? formatDate(after) : ''}
          onChange={(e) => onChange({ after: e.target.value ? new Date(e.target.value) : undefined, before })}
          className="px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-[var(--accent-cyan)] outline-none"
        />
        <span className="text-xs text-[var(--text-muted)]">~</span>
        <input
          type="date"
          value={before ? formatDate(before) : ''}
          onChange={(e) => onChange({ after, before: e.target.value ? new Date(e.target.value) : undefined })}
          className="px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-[var(--accent-cyan)] outline-none"
        />
        {(after !== undefined || before !== undefined) && (
          <button
            onClick={() => onChange({ after: undefined, before: undefined })}
            className="text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Status Filter
// ============================================================================

interface StatusFilterProps {
  value: 'published' | 'draft' | 'all'
  counts: { published: number; draft: number; all: number }
  onChange: (status: 'published' | 'draft' | 'all') => void
}

function StatusFilter({ value, counts, onChange }: StatusFilterProps) {
  const options: Array<{ value: 'published' | 'draft' | 'all'; label: string }> = [
    { value: 'all', label: '전체' },
    { value: 'published', label: '게시됨' },
    { value: 'draft', label: '초안' },
  ]

  return (
    <div>
      <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
        상태
      </div>
      <div className="flex gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
              value === option.value
                ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/50'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span>{option.label}</span>
            <span className="text-[10px] opacity-70">({counts[option.value]})</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Marketplace Filter
// ============================================================================

interface MarketplaceFilterProps {
  value: boolean | null
  counts: { true: number; false: number; all: number }
  onChange: (value: boolean | null) => void
}

function MarketplaceFilter({ value, counts, onChange }: MarketplaceFilterProps) {
  const options: Array<{ value: boolean | null; label: string; count: number }> = [
    { value: null, label: '전체', count: counts.all },
    { value: true, label: 'CLI 지원', count: counts.true },
    { value: false, label: 'CLI 미지원', count: counts.false },
  ]

  return (
    <div>
      <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
        CLI 지원
      </div>
      <div className="flex gap-2">
        {options.map((option, i) => (
          <button
            key={i}
            onClick={() => onChange(option.value)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
              value === option.value
                ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/50'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span>{option.label}</span>
            <span className="text-[10px] opacity-70">({option.count})</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Saved Filter Modal
// ============================================================================

interface SaveFilterModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string) => void
}

function SaveFilterModal({ isOpen, onClose, onSave }: SaveFilterModalProps) {
  const [name, setName] = useState('')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--bg-secondary)] rounded-2xl p-6 w-full max-w-sm border border-[var(--border-subtle)]">
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">필터 저장</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="필터 이름"
          className="w-full px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-[var(--accent-cyan)] outline-none mb-4"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => {
              if (name.trim()) {
                onSave(name.trim())
                setName('')
                onClose()
              }
            }}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Saved Filters Panel
// ============================================================================

interface SavedFiltersPanelProps {
  savedFilters: SavedFilter[]
  onApply: (filters: FilterState) => void
  onDelete: (id: string) => void
}

function SavedFiltersPanel({ savedFilters, onApply, onDelete }: SavedFiltersPanelProps) {
  if (savedFilters.length === 0) return null

  return (
    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
      <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
        저장된 필터
      </div>
      <div className="flex flex-wrap gap-2">
        {savedFilters.map((saved) => (
          <div
            key={saved.id}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] group"
          >
            <button
              onClick={() => onApply(saved.filters)}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              {saved.name}
            </button>
            <button
              onClick={() => onDelete(saved.id)}
              className="text-[var(--text-muted)] hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Main Advanced Filter Panel
// ============================================================================

interface AdvancedFilterPanelProps {
  filters: FilterState
  counts: FilterCounts
  availableTags: string[]
  onFiltersChange: (filters: Partial<FilterState>) => void
  onReset: () => void
}

export function AdvancedFilterPanel({
  filters,
  counts,
  availableTags,
  onFiltersChange,
  onReset,
}: AdvancedFilterPanelProps) {
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => getSavedFilters())
  const [activePresetId, setActivePresetId] = useState<string | null>(null)

  const activeFilterCount = countActiveFilters(filters)

  const handlePresetClick = useCallback((preset: FilterPreset) => {
    if (activePresetId === preset.id) {
      // Deactivate preset
      setActivePresetId(null)
      onReset()
    } else {
      setActivePresetId(preset.id)
      onFiltersChange(preset.filters)
    }
  }, [activePresetId, onFiltersChange, onReset])

  const handleSaveFilter = useCallback((name: string) => {
    const saved = saveFilter(name, filters)
    setSavedFilters([...savedFilters, saved])
  }, [filters, savedFilters])

  const handleDeleteSavedFilter = useCallback((id: string) => {
    deleteSavedFilter(id)
    setSavedFilters(savedFilters.filter(f => f.id !== id))
  }, [savedFilters])

  const handleApplySavedFilter = useCallback((savedFilters: FilterState) => {
    setActivePresetId(null)
    onFiltersChange(savedFilters)
  }, [onFiltersChange])

  return (
    <div className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[var(--text-primary)]">고급 필터</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]">
              {activeFilterCount}개 적용
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={activeFilterCount === 0}
            className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            💾 저장
          </button>
          <button
            onClick={onReset}
            disabled={activeFilterCount === 0}
            className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-rose-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ✕ 초기화
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="mb-5">
        <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
          빠른 필터
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTER_PRESETS.map((preset) => (
            <PresetButton
              key={preset.id}
              preset={preset}
              isActive={activePresetId === preset.id}
              onClick={() => handlePresetClick(preset)}
            />
          ))}
        </div>
      </div>

      {/* Sort */}
      <div className="mb-5 pb-5 border-b border-[var(--border-subtle)]">
        <SortSelector
          value={filters.sort}
          onChange={(sort) => onFiltersChange({ sort })}
        />
      </div>

      {/* Team Tag Filter */}
      <div className="mb-5">
        <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
          팀
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TEAM_TAGS) as TeamTag[]).map((tag) => {
            const tagInfo = TEAM_TAGS[tag]
            const count = counts.teamTags[tag] || 0
            return (
              <button
                key={tag}
                onClick={() => onFiltersChange({ teamTag: filters.teamTag === tag ? '' : tag })}
                disabled={count === 0 && filters.teamTag !== tag}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border ${
                  filters.teamTag === tag
                    ? tagInfo.color
                    : count === 0
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]/50 border-transparent cursor-not-allowed'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{tagInfo.emoji}</span>
                <span>{tagInfo.label}</span>
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Difficulty Filter */}
      <div className="mb-5">
        <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
          난이도
        </div>
        <div className="flex gap-2">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((level) => {
            const count = counts.difficulties[level] || 0
            return (
              <button
                key={level}
                onClick={() => onFiltersChange({ difficulty: filters.difficulty === level ? '' : level })}
                disabled={count === 0 && filters.difficulty !== level}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                  filters.difficulty === level
                    ? level === 'easy'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                      : level === 'medium'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/50'
                    : count === 0
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]/50 cursor-not-allowed'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {DIFFICULTY_LABELS[level].emoji} {DIFFICULTY_LABELS[level].label}
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tags Filter */}
      <div className="mb-5">
        <TagFilterWithCounts
          availableTags={availableTags}
          selectedTags={filters.tags}
          tagsOperator={filters.tagsOperator}
          counts={counts.tags}
          onTagToggle={(tag) => {
            const newTags = filters.tags.includes(tag)
              ? filters.tags.filter(t => t !== tag)
              : [...filters.tags, tag]
            onFiltersChange({ tags: newTags })
          }}
          onOperatorChange={(op) => onFiltersChange({ tagsOperator: op })}
        />
      </div>

      {/* Status Filter */}
      <div className="mb-5">
        <StatusFilter
          value={filters.status}
          counts={counts.statuses}
          onChange={(status) => onFiltersChange({ status })}
        />
      </div>

      {/* Marketplace Filter */}
      <div className="mb-5">
        <MarketplaceFilter
          value={filters.marketplaceEnabled}
          counts={counts.marketplaceEnabled}
          onChange={(value) => onFiltersChange({ marketplaceEnabled: value })}
        />
      </div>

      {/* Range Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <LikesRangeFilter
          min={filters.likesRange.min}
          max={filters.likesRange.max}
          onChange={(range) => onFiltersChange({ likesRange: range })}
        />
        <DateRangeFilter
          after={filters.updatedDateRange.after}
          before={filters.updatedDateRange.before}
          onChange={(range) => onFiltersChange({ updatedDateRange: range })}
        />
      </div>

      {/* Saved Filters */}
      <SavedFiltersPanel
        savedFilters={savedFilters}
        onApply={handleApplySavedFilter}
        onDelete={handleDeleteSavedFilter}
      />

      {/* Save Modal */}
      <SaveFilterModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveFilter}
      />
    </div>
  )
}

// ============================================================================
// Active Filters Badge Bar
// ============================================================================

interface ActiveFiltersBadgeProps {
  filters: FilterState
  onRemoveFilter: (key: keyof FilterState, value?: string) => void
  onClearAll: () => void
}

export function ActiveFiltersBadge({ filters, onRemoveFilter, onClearAll }: ActiveFiltersBadgeProps) {
  const badges: Array<{ key: keyof FilterState; label: string; value?: string }> = []

  if (filters.type !== 'all') {
    badges.push({ key: 'type', label: `타입: ${filters.type}` })
  }
  if (filters.teamTag) {
    badges.push({ key: 'teamTag', label: `팀: ${TEAM_TAGS[filters.teamTag].label}` })
  }
  if (filters.difficulty) {
    badges.push({ key: 'difficulty', label: `${DIFFICULTY_LABELS[filters.difficulty].emoji} ${DIFFICULTY_LABELS[filters.difficulty].label}` })
  }
  if (filters.status !== 'all') {
    badges.push({ key: 'status', label: `상태: ${filters.status === 'published' ? '게시됨' : '초안'}` })
  }
  if (filters.marketplaceEnabled !== null) {
    badges.push({ key: 'marketplaceEnabled', label: filters.marketplaceEnabled ? 'CLI 지원' : 'CLI 미지원' })
  }
  if (filters.likesRange.min !== undefined) {
    badges.push({ key: 'likesRange', label: `좋아요 ≥ ${filters.likesRange.min}` })
  }
  if (filters.likesRange.max !== undefined) {
    badges.push({ key: 'likesRange', label: `좋아요 ≤ ${filters.likesRange.max}` })
  }
  if (filters.updatedDateRange.after) {
    badges.push({ key: 'updatedDateRange', label: `이후: ${filters.updatedDateRange.after.toLocaleDateString()}` })
  }
  if (filters.updatedDateRange.before) {
    badges.push({ key: 'updatedDateRange', label: `이전: ${filters.updatedDateRange.before.toLocaleDateString()}` })
  }
  for (const tag of filters.tags) {
    badges.push({ key: 'tags', label: TAGS[tag]?.label || tag, value: tag })
  }

  if (badges.length === 0) return null

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-[var(--text-muted)]">적용된 필터:</span>
      {badges.map((badge, i) => (
        <span
          key={`${badge.key}-${i}`}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
        >
          {badge.label}
          <button
            onClick={() => onRemoveFilter(badge.key, badge.value)}
            className="ml-1 hover:text-rose-400 transition-colors"
          >
            ✕
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors"
      >
        모두 지우기
      </button>
    </div>
  )
}

// ============================================================================
// Filter Summary Stats
// ============================================================================

interface FilterSummaryProps {
  totalCount: number
  filteredCount: number
  sortedBy: SortConfig
}

export function FilterSummary({ totalCount, filteredCount, sortedBy }: FilterSummaryProps) {
  const isFiltered = filteredCount !== totalCount

  return (
    <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
      {isFiltered ? (
        <span>
          {filteredCount}개 항목 <span className="opacity-60">(전체 {totalCount}개 중)</span>
        </span>
      ) : (
        <span>전체 {totalCount}개 항목</span>
      )}
      <span className="opacity-60">|</span>
      <span>정렬: {getSortDescription(sortedBy)}</span>
    </div>
  )
}
