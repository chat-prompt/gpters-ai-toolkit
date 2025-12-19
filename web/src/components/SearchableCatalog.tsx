'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { CatalogItem, TAGS, DIFFICULTY_LABELS, ItemType } from '@/lib/types'

const TYPE_CONFIG: Record<ItemType, { label: string; icon: string; gradient: string; glow: string }> = {
  skill: {
    label: 'SKILL',
    icon: '⚡',
    gradient: 'from-cyan-400 to-emerald-400',
    glow: 'group-hover:shadow-[0_0_30px_rgba(0,212,255,0.3)]',
  },
  agent: {
    label: 'AGENT',
    icon: '◈',
    gradient: 'from-purple-400 to-pink-400',
    glow: 'group-hover:shadow-[0_0_30px_rgba(168,85,247,0.3)]',
  },
  prompt: {
    label: 'PROMPT',
    icon: '✦',
    gradient: 'from-orange-400 to-amber-400',
    glow: 'group-hover:shadow-[0_0_30px_rgba(255,107,53,0.3)]',
  },
}

function ItemCard({ item, index }: { item: CatalogItem; index: number }) {
  const config = TYPE_CONFIG[item.type]

  return (
    <Link href={`/${item.type}/${item.id}`}>
      <div
        className={`group glass rounded-2xl p-6 h-full flex flex-col transition-all duration-300 hover:translate-y-[-4px] ${config.glow} animate-fade-up`}
        style={{ animationDelay: `${index * 80}ms` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className={`text-lg bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent`}>
              {config.icon}
            </span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-[var(--text-muted)] uppercase">
              {config.label}
            </span>
          </div>
          {item.difficulty && (
            <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
              {DIFFICULTY_LABELS[item.difficulty].label}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2 tracking-tight">
          {item.name}
        </h3>

        {/* Description */}
        <p className="text-sm text-[var(--text-secondary)] mb-6 flex-grow line-clamp-2 leading-relaxed">
          {item.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {item.tags.slice(0, 2).map(tag => (
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
          <span className="text-xs text-[var(--text-muted)]">@{item.author}</span>
          {item.type === 'skill' && item.pluginId && (
            <span className="text-[10px] text-[var(--accent-cyan)] font-medium tracking-wide">
              PLUGIN READY →
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function SectionHeader({ icon, title, count, accentColor }: {
  icon: string
  title: string
  count: number
  accentColor: string
}) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <span className={`text-2xl ${accentColor}`}>{icon}</span>
        <div>
          <h2 className="text-xl font-medium text-[var(--text-primary)] tracking-tight">{title}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-wider">
            {count} items available
          </p>
        </div>
      </div>
      <div className="h-px flex-1 ml-8 bg-gradient-to-r from-[var(--border-subtle)] to-transparent" />
    </div>
  )
}

interface SearchableCatalogProps {
  catalog: CatalogItem[]
}

export function SearchableCatalog({ catalog }: SearchableCatalogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<ItemType | 'all'>('all')

  // Filter items based on search query and type filter
  const filteredCatalog = useMemo(() => {
    return catalog.filter(item => {
      // Type filter
      if (activeFilter !== 'all' && item.type !== activeFilter) {
        return false
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesName = item.name.toLowerCase().includes(query)
        const matchesDescription = item.description.toLowerCase().includes(query)
        const matchesTags = item.tags.some(tag =>
          tag.toLowerCase().includes(query) ||
          (TAGS[tag]?.label || '').toLowerCase().includes(query)
        )
        const matchesAuthor = item.author.toLowerCase().includes(query)

        return matchesName || matchesDescription || matchesTags || matchesAuthor
      }

      return true
    })
  }, [catalog, searchQuery, activeFilter])

  const skills = filteredCatalog.filter(item => item.type === 'skill')
  const agents = filteredCatalog.filter(item => item.type === 'agent')
  const prompts = filteredCatalog.filter(item => item.type === 'prompt')

  // Keyboard shortcut for search (⌘K)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      const searchInput = document.getElementById('search-input')
      searchInput?.focus()
    }
    // ESC to clear search
    if (e.key === 'Escape') {
      setSearchQuery('')
      const searchInput = document.getElementById('search-input') as HTMLInputElement
      searchInput?.blur()
    }
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const totalSkills = catalog.filter(item => item.type === 'skill').length
  const totalAgents = catalog.filter(item => item.type === 'agent').length
  const totalPrompts = catalog.filter(item => item.type === 'prompt').length

  return (
    <>
      {/* Search & Filter */}
      <div className="mt-12 max-w-2xl">
        <div className="relative">
          <input
            id="search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills, agents, prompts..."
            className="w-full px-6 py-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                ✕
              </button>
            )}
            <kbd className="px-2 py-1 text-[10px] rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Type Filter Buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeFilter === 'all'
                ? 'bg-[var(--accent-cyan)] text-black'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            All ({catalog.length})
          </button>
          <button
            onClick={() => setActiveFilter('skill')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeFilter === 'skill'
                ? 'bg-[var(--accent-cyan)] text-black'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            ⚡ Skills ({totalSkills})
          </button>
          <button
            onClick={() => setActiveFilter('agent')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeFilter === 'agent'
                ? 'bg-[var(--accent-purple)] text-black'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            ◈ Agents ({totalAgents})
          </button>
          <button
            onClick={() => setActiveFilter('prompt')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeFilter === 'prompt'
                ? 'bg-[var(--accent-orange)] text-black'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            ✦ Prompts ({totalPrompts})
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-12 flex items-center gap-12">
        <div>
          <div className="text-3xl font-light text-[var(--text-primary)]">{skills.length}</div>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Skills</div>
        </div>
        <div className="w-px h-8 bg-[var(--border-subtle)]" />
        <div>
          <div className="text-3xl font-light text-[var(--text-primary)]">{agents.length}</div>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Agents</div>
        </div>
        <div className="w-px h-8 bg-[var(--border-subtle)]" />
        <div>
          <div className="text-3xl font-light text-[var(--text-primary)]">{prompts.length}</div>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Prompts</div>
        </div>
        {searchQuery && (
          <>
            <div className="w-px h-8 bg-[var(--border-subtle)]" />
            <div className="text-xs text-[var(--text-muted)]">
              Showing {filteredCatalog.length} of {catalog.length} items
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

        {/* Prompts Section */}
        {prompts.length > 0 && (activeFilter === 'all' || activeFilter === 'prompt') && (
          <section className="mb-20">
            <SectionHeader
              icon="✦"
              title="Prompts"
              count={prompts.length}
              accentColor="text-[var(--accent-orange)]"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {prompts.map((item, i) => (
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
              {searchQuery ? `No results for "${searchQuery}"` : 'No items yet'}
            </p>
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[var(--accent-cyan)] hover:underline"
              >
                Clear search
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
