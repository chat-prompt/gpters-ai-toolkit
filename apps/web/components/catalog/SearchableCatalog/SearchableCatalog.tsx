/**
 * 검색·필터가 붙은 카탈로그 화면
 *
 * 검색창 → 유형 필터 → 개수 밴드 → 유형별 목록 순으로 쌓는다.
 * 유형 구분에 쓰던 색과 이모지는 걷어내고, 선택 상태는 명암으로만 나타낸다.
 */
'use client'

import { Link } from '@/i18n/navigation'
import { TAGS, DIFFICULTY_LABELS, type Difficulty, type ItemType } from '@/lib/core/types'
import { SKILL_PLATFORMS, PLATFORM_LABELS } from '@/lib/security/client-type'
import { SearchAutocomplete } from '../SearchAutocomplete'
import { ItemCard } from './ItemCard'
import { SectionHeader } from './SectionHeader'
import { useSearchFilters } from './useSearchFilters'
import type { SearchableCatalogProps } from './types'

/** 선택된 알약 버튼 — 강조색 대신 명암을 뒤집는다 */
const PILL_ACTIVE = 'border-transparent bg-[var(--text-primary)] text-[var(--bg-primary)]'

/** 선택되지 않은 알약 버튼 */
const PILL_IDLE =
  'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]'

/**
 * 검색·필터가 붙은 카탈로그
 *
 * @param catalog - 화면에 뿌릴 카탈로그 항목 전체
 *
 * @example
 * ```tsx
 * <SearchableCatalog catalog={catalogItems} />
 * ```
 */
export function SearchableCatalog({ catalog }: SearchableCatalogProps) {
  const {
    searchQuery,
    setSearchQuery,
    activeFilter,
    selectedTags,
    selectedDifficulty,
    selectedPlatform,
    showFilters,
    setShowFilters,
    availableTags,
    filteredCatalog,
    didYouMean,
    hasActiveFilters,
    handleTypeFilter,
    handleTagToggle,
    handleDifficultyChange,
    handlePlatformChange,
    handleClearAllFilters,
    skills,
    agents,
    commands,
    hooks,
    packages,
    totalSkills,
    totalAgents,
    totalCommands,
    totalHooks,
    totalPackages,
  } = useSearchFilters({ catalog })

  /** 유형 필터 버튼 — 라벨과 전체 개수 */
  const typeFilters: { value: ItemType | 'all'; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: catalog.length },
    { value: 'skill', label: 'Skills', count: totalSkills },
    { value: 'agent', label: 'Agents', count: totalAgents },
    { value: 'command', label: 'Commands', count: totalCommands },
    { value: 'hook', label: 'Hooks', count: totalHooks },
    { value: 'package', label: 'Packages', count: totalPackages },
  ]

  /** 현재 필터에 걸린 유형별 목록 */
  const sections: { type: ItemType; title: string; items: typeof catalog }[] = [
    { type: 'skill', title: 'Skills', items: skills },
    { type: 'agent', title: 'Agents', items: agents },
    { type: 'command', title: 'Commands', items: commands },
    { type: 'hook', title: 'Hooks', items: hooks },
    { type: 'package', title: 'Packages', items: packages },
  ]

  const visibleSections = sections.filter(
    (section) =>
      section.items.length > 0 && (activeFilter === 'all' || activeFilter === section.type)
  )

  return (
    <>
      {/* 검색 — 히어로 바로 아래에 붙여 가장 먼저 눈에 걸리게 한다 */}
      <div className="reveal mt-8 max-w-3xl" style={{ '--ax-delay': '80ms' } as React.CSSProperties}>
        <SearchAutocomplete
          value={searchQuery}
          onChange={setSearchQuery}
          catalog={catalog}
          placeholder="Search skills, agents, commands..."
        />

        {/* 유형 필터 — 모바일에서 줄바꿈되게 한다 */}
        <div className="flex flex-wrap gap-2 mt-3">
          {typeFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => handleTypeFilter(filter.value)}
              aria-pressed={activeFilter === filter.value}
              className={`px-3.5 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                activeFilter === filter.value ? PILL_ACTIVE : PILL_IDLE
              }`}
            >
              {filter.label} <span className="font-mono tabular-nums">({filter.count})</span>
            </button>
          ))}
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            className={`px-3.5 py-1.5 rounded-full border text-xs font-medium transition-colors flex items-center gap-1.5 ${
              showFilters || hasActiveFilters
                ? 'border-[var(--border-hover)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                : PILL_IDLE
            }`}
          >
            Filters
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" />
            )}
          </button>
        </div>

        {/* 상세 필터 */}
        {showFilters && (
          <div className="reveal mt-3 p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            {/* 난이도 */}
            <div className="mb-5">
              <p className="eyebrow mb-2.5">Difficulty</p>
              <div className="flex flex-wrap gap-2">
                {(['easy', 'medium', 'hard'] as Difficulty[]).map((level) => (
                  <button
                    key={level}
                    onClick={() =>
                      handleDifficultyChange(selectedDifficulty === level ? '' : level)
                    }
                    aria-pressed={selectedDifficulty === level}
                    className={`px-3.5 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                      selectedDifficulty === level ? PILL_ACTIVE : PILL_IDLE
                    }`}
                  >
                    {DIFFICULTY_LABELS[level].label}
                  </button>
                ))}
              </div>
            </div>

            {/* 플랫폼 */}
            <div className="mb-5">
              <p className="eyebrow mb-2.5">Platform</p>
              <div className="flex flex-wrap gap-2">
                {SKILL_PLATFORMS.map((platform) => {
                  const info = PLATFORM_LABELS[platform]
                  const isActive = selectedPlatform === platform
                  return (
                    <button
                      key={platform}
                      onClick={() => handlePlatformChange(isActive ? null : platform)}
                      aria-pressed={isActive}
                      className={`px-3.5 py-1.5 rounded-full border text-xs transition-colors ${
                        isActive ? PILL_ACTIVE : PILL_IDLE
                      }`}
                    >
                      {info.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 태그 */}
            <div>
              <p className="eyebrow mb-2.5">
                Tags {selectedTags.length > 0 && `(${selectedTags.length})`}
              </p>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    aria-pressed={selectedTags.includes(tag)}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                      selectedTags.includes(tag) ? PILL_ACTIVE : PILL_IDLE
                    }`}
                  >
                    {TAGS[tag]?.label || tag}
                  </button>
                ))}
              </div>
            </div>

            {hasActiveFilters && (
              <div className="mt-5 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  onClick={handleClearAllFilters}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 접힌 상태에서도 무엇이 걸려 있는지 보이게 한다 */}
      {hasActiveFilters && !showFilters && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {selectedDifficulty && (
            <FilterChip
              label={DIFFICULTY_LABELS[selectedDifficulty].label}
              onRemove={() => handleDifficultyChange('')}
            />
          )}
          {selectedPlatform && (
            <FilterChip
              label={
                PLATFORM_LABELS[selectedPlatform as keyof typeof PLATFORM_LABELS]?.label ||
                selectedPlatform
              }
              onRemove={() => handlePlatformChange(null)}
            />
          )}
          {selectedTags.map((tag) => (
            <FilterChip
              key={tag}
              label={TAGS[tag]?.label || tag}
              onRemove={() => handleTagToggle(tag)}
            />
          ))}
          <button
            onClick={handleClearAllFilters}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* 개수 밴드 — 칸 사이는 1px 선으로만 나눈다 */}
      <div
        className="reveal mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px rounded-2xl overflow-hidden bg-[var(--border-subtle)]"
        style={{ '--ax-delay': '160ms' } as React.CSSProperties}
      >
        {sections.map((section) => (
          <div key={section.type} className="bg-[var(--bg-primary)] px-5 py-4">
            <p className="font-mono text-2xl leading-none tabular-nums tracking-tight text-[var(--text-primary)]">
              {section.items.length}
            </p>
            <p className="eyebrow mt-2">{section.title}</p>
          </div>
        ))}
      </div>

      {(searchQuery || hasActiveFilters) && (
        <p className="mt-3 font-mono text-xs tabular-nums text-[var(--text-muted)]">
          {filteredCatalog.length} / {catalog.length}
        </p>
      )}

      <div className="mt-12">
        {visibleSections.map((section) => (
          <section key={section.type} className="mb-12">
            <SectionHeader title={section.title} count={section.items.length} />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {section.items.map((item, i) => (
                <ItemCard key={item.id} item={item} index={i} />
              ))}
            </div>
          </section>
        ))}

        {/* 빈 결과 */}
        {filteredCatalog.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-[var(--text-secondary)]">
              {searchQuery
                ? `No results for "${searchQuery}"`
                : hasActiveFilters
                  ? 'No items match the selected filters'
                  : 'No items yet'}
            </p>

            {didYouMean.length > 0 && (
              <div className="mt-6">
                <p className="eyebrow mb-2.5">Did you mean</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {didYouMean.map((suggestion, i) => (
                    <button
                      key={`${i}-${suggestion}`}
                      onClick={() => setSearchQuery(suggestion)}
                      className={`px-3.5 py-1.5 rounded-full border text-xs transition-colors ${PILL_IDLE}`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              {searchQuery || hasActiveFilters ? (
                <button
                  onClick={handleClearAllFilters}
                  className="text-sm text-[var(--brand-primary)] hover:underline"
                >
                  Clear all filters
                </button>
              ) : (
                <Link href="/upload" className="text-sm text-[var(--brand-primary)] hover:underline">
                  Share the first skill →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * 적용 중인 필터 하나를 보여주고 지우는 칩
 *
 * @param label - 필터 이름
 * @param onRemove - 이 필터를 해제하는 핸들러
 */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
      {label}
      <button
        onClick={onRemove}
        aria-label={`${label} 필터 해제`}
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        ✕
      </button>
    </span>
  )
}
