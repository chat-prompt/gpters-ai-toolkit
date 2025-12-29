'use client'

import Link from 'next/link'
import { TAGS, DIFFICULTY_LABELS, TEAM_TAGS, type Difficulty, type TeamTag } from '@/lib/core/types'
import { SearchAutocomplete } from '../SearchAutocomplete'
import { ItemCard } from './ItemCard'
import { SectionHeader } from './SectionHeader'
import { useSearchFilters } from './useSearchFilters'
import type { SearchableCatalogProps } from './types'

export function SearchableCatalog({ catalog }: SearchableCatalogProps) {
  const {
    searchQuery,
    setSearchQuery,
    activeFilter,
    selectedTags,
    selectedDifficulty,
    selectedTeamTag,
    showFilters,
    setShowFilters,
    availableTags,
    filteredCatalog,
    didYouMean,
    hasActiveFilters,
    handleTypeFilter,
    handleTagToggle,
    handleDifficultyChange,
    handleTeamTagChange,
    handleClearAllFilters,
    skills,
    agents,
    commands,
    hooks,
    totalSkills,
    totalAgents,
    totalCommands,
    totalHooks,
  } = useSearchFilters({ catalog })

  return (
    <>
      {/* Search & Filter */}
      <div className="mt-12 max-w-2xl">
        <SearchAutocomplete
          value={searchQuery}
          onChange={setSearchQuery}
          catalog={catalog}
          placeholder="Search skills, agents, commands..."
        />

        {/* Type Filter Buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => handleTypeFilter('all')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeFilter === 'all'
                ? 'bg-[var(--accent-cyan)] text-black'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            All ({catalog.length})
          </button>
          <button
            onClick={() => handleTypeFilter('skill')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeFilter === 'skill'
                ? 'bg-[var(--accent-cyan)] text-black'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            ⚡ Skills ({totalSkills})
          </button>
          <button
            onClick={() => handleTypeFilter('agent')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeFilter === 'agent'
                ? 'bg-[var(--accent-purple)] text-black'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            ◈ Agents ({totalAgents})
          </button>
          <button
            onClick={() => handleTypeFilter('command')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeFilter === 'command'
                ? 'bg-rose-400 text-black'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            ▸ Commands ({totalCommands})
          </button>
          <button
            onClick={() => handleTypeFilter('hook')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeFilter === 'hook'
                ? 'bg-orange-400 text-black'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            🪝 Hooks ({totalHooks})
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
              showFilters || hasActiveFilters
                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--accent-cyan)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span>⚙</span>
            Filters
            {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[var(--accent-cyan)]" />}
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="mt-4 p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] animate-fade-up">
            {/* Team Tag Filter */}
            <div className="mb-5">
              <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
                Team
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TEAM_TAGS) as TeamTag[]).map((tag) => {
                  const tagInfo = TEAM_TAGS[tag]
                  return (
                    <button
                      key={tag}
                      onClick={() => handleTeamTagChange(selectedTeamTag === tag ? '' : tag)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border ${
                        selectedTeamTag === tag
                          ? tagInfo.color
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span>{tagInfo.emoji}</span>
                      <span>{tagInfo.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Difficulty Filter */}
            <div className="mb-5">
              <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
                Difficulty
              </div>
              <div className="flex gap-2">
                {(['easy', 'medium', 'hard'] as Difficulty[]).map((level) => (
                  <button
                    key={level}
                    onClick={() =>
                      handleDifficultyChange(selectedDifficulty === level ? '' : level)
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
                Tags {selectedTags.length > 0 && `(${selectedTags.length} selected)`}
              </div>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                      selectedTags.includes(tag)
                        ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/50'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]'
                    }`}
                  >
                    {TAGS[tag]?.label || tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <div className="mt-5 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  onClick={handleClearAllFilters}
                  className="text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors flex items-center gap-2"
                >
                  <span>✕</span>
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && !showFilters && (
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-[var(--text-muted)]">Active filters:</span>
          {selectedTeamTag && (
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${TEAM_TAGS[selectedTeamTag].color}`}
            >
              {TEAM_TAGS[selectedTeamTag].emoji} {TEAM_TAGS[selectedTeamTag].label}
              <button
                onClick={() => handleTeamTagChange('')}
                className="ml-1 hover:text-rose-400 transition-colors"
              >
                ✕
              </button>
            </span>
          )}
          {selectedDifficulty && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
              {DIFFICULTY_LABELS[selectedDifficulty].emoji}{' '}
              {DIFFICULTY_LABELS[selectedDifficulty].label}
              <button
                onClick={() => handleDifficultyChange('')}
                className="ml-1 hover:text-rose-400 transition-colors"
              >
                ✕
              </button>
            </span>
          )}
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
            >
              {TAGS[tag]?.label || tag}
              <button
                onClick={() => handleTagToggle(tag)}
                className="ml-1 hover:text-rose-400 transition-colors"
              >
                ✕
              </button>
            </span>
          ))}
          <button
            onClick={handleClearAllFilters}
            className="text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="mt-12 flex items-center gap-12">
        <div>
          <div className="text-3xl font-light text-[var(--text-primary)]">{skills.length}</div>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
            Skills
          </div>
        </div>
        <div className="w-px h-8 bg-[var(--border-subtle)]" />
        <div>
          <div className="text-3xl font-light text-[var(--text-primary)]">{agents.length}</div>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
            Agents
          </div>
        </div>
        <div className="w-px h-8 bg-[var(--border-subtle)]" />
        <div>
          <div className="text-3xl font-light text-[var(--text-primary)]">{commands.length}</div>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
            Commands
          </div>
        </div>
        <div className="w-px h-8 bg-[var(--border-subtle)]" />
        <div>
          <div className="text-3xl font-light text-[var(--text-primary)]">{hooks.length}</div>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
            Hooks
          </div>
        </div>
        {(searchQuery || hasActiveFilters) && (
          <>
            <div className="w-px h-8 bg-[var(--border-subtle)]" />
            <div className="text-xs text-[var(--text-muted)]">
              Showing {filteredCatalog.length} of {catalog.length} items
              {hasActiveFilters && ' (filtered)'}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="mt-16">
        {/* Skills Section */}
        {skills.length > 0 && (activeFilter === 'all' || activeFilter === 'skill') && (
          <section className="mb-20">
            <SectionHeader
              icon="⚡"
              title="Skills"
              count={skills.length}
              accentColor="text-[var(--accent-cyan)]"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {skills.map((item, i) => (
                <ItemCard key={item.id} item={item} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* Agents Section */}
        {agents.length > 0 && (activeFilter === 'all' || activeFilter === 'agent') && (
          <section className="mb-20">
            <SectionHeader
              icon="◈"
              title="Agents"
              count={agents.length}
              accentColor="text-[var(--accent-purple)]"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.map((item, i) => (
                <ItemCard key={item.id} item={item} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* Commands Section */}
        {commands.length > 0 && (activeFilter === 'all' || activeFilter === 'command') && (
          <section className="mb-20">
            <SectionHeader
              icon="▸"
              title="Commands"
              count={commands.length}
              accentColor="text-rose-400"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {commands.map((item, i) => (
                <ItemCard key={item.id} item={item} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* Hooks Section */}
        {hooks.length > 0 && (activeFilter === 'all' || activeFilter === 'hook') && (
          <section className="mb-20">
            <SectionHeader icon="🪝" title="Hooks" count={hooks.length} accentColor="text-orange-400" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {hooks.map((item, i) => (
                <ItemCard key={item.id} item={item} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* No Results */}
        {filteredCatalog.length === 0 && (
          <div className="text-center py-32">
            <div className="text-6xl mb-6 opacity-20">∅</div>
            <p className="text-[var(--text-secondary)] text-lg mb-4">
              {searchQuery
                ? `No results for "${searchQuery}"`
                : hasActiveFilters
                  ? 'No items match the selected filters'
                  : 'No items yet'}
            </p>

            {/* Did you mean suggestions */}
            {didYouMean.length > 0 && (
              <div className="mb-6">
                <p className="text-[var(--text-muted)] text-sm mb-2">Did you mean:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {didYouMean.map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => setSearchQuery(suggestion)}
                      className="px-3 py-1.5 rounded-lg text-sm bg-[var(--bg-tertiary)] text-[var(--accent-cyan)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchQuery || hasActiveFilters ? (
              <button
                onClick={handleClearAllFilters}
                className="text-[var(--accent-cyan)] hover:underline"
              >
                Clear all filters
              </button>
            ) : (
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 text-[var(--accent-cyan)] hover:underline"
              >
                Share the first skill →
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  )
}
