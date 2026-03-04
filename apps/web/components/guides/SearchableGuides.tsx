'use client'

/**
 * Searchable guides list component
 *
 * Client-side filtering for guides with search functionality
 */
import { useState, useMemo } from 'react'
import { Link } from '@/i18n/navigation'
import { TAGS, DIFFICULTY_LABELS, type Difficulty } from '@/lib/core/types'

interface Guide {
  id: string
  name: string
  description: string
  tags: string[]
  authorName?: string
  difficulty?: Difficulty
  estimatedTime?: string
}

interface SearchableGuidesProps {
  guides: Guide[]
}

export function SearchableGuides({ guides }: SearchableGuidesProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredGuides = useMemo(() => {
    if (!searchQuery.trim()) return guides

    const query = searchQuery.toLowerCase()
    return guides.filter(guide => {
      const matchesName = guide.name.toLowerCase().includes(query)
      const matchesDescription = guide.description.toLowerCase().includes(query)
      const matchesTags = guide.tags.some(tag =>
        tag.toLowerCase().includes(query) ||
        (TAGS[tag]?.label || '').toLowerCase().includes(query)
      )
      const matchesAuthor = guide.authorName?.toLowerCase().includes(query) ?? false

      return matchesName || matchesDescription || matchesTags || matchesAuthor
    })
  }, [guides, searchQuery])

  // Handle empty guides state (no guides in database)
  if (guides.length === 0) {
    return (
      <div className="text-center py-32">
        <div className="text-6xl mb-6 opacity-20">📚</div>
        <p className="text-[var(--text-secondary)] text-lg mb-4">
          아직 가이드가 없습니다
        </p>
        <p className="text-[var(--text-muted)] text-sm">
          곧 유용한 가이드들이 추가될 예정입니다
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Search Input */}
      <div className="mb-8">
        <div className="relative max-w-md">
          <input
            type="text"
            placeholder="가이드 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 pl-10 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            🔍
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              ✕
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {filteredGuides.length}개의 가이드 검색됨
          </p>
        )}
      </div>

      {/* Guide List */}
      {filteredGuides.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredGuides.map((guide, index) => (
            <Link href={`/guides/${guide.id}`} key={guide.id}>
              <div
                className="group glass rounded-2xl p-6 h-full flex flex-col transition-all duration-300 hover:translate-y-[-4px] group-hover:shadow-[0_0_30px_rgba(16,185,129,0.2)] animate-fade-up"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg text-emerald-400">📚</span>
                    <span className="text-[10px] font-semibold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                      Guide
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {guide.estimatedTime && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                        ⏱ {guide.estimatedTime}
                      </span>
                    )}
                    {guide.difficulty && guide.difficulty in DIFFICULTY_LABELS && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                        {DIFFICULTY_LABELS[guide.difficulty].label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2 tracking-tight">
                  {guide.name}
                </h3>

                {/* Description */}
                <p className="text-sm text-[var(--text-secondary)] mb-6 flex-grow line-clamp-2 leading-relaxed">
                  {guide.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {guide.tags.slice(0, 3).map(tag => (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-1 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-muted)] uppercase tracking-wider"
                    >
                      {TAGS[tag]?.label || tag}
                    </span>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
                  <span className="text-xs text-[var(--text-muted)]">@{guide.authorName || 'unknown'}</span>
                  <span className="text-[10px] text-emerald-400 font-medium tracking-wide">
                    READ GUIDE →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-4xl mb-4 opacity-40">🔍</div>
          <p className="text-[var(--text-secondary)] mb-2">
            &quot;{searchQuery}&quot;에 대한 결과가 없습니다
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            검색어 지우기
          </button>
        </div>
      )}
    </>
  )
}
