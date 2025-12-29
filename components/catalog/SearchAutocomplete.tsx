'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { CatalogItemSummary, TAGS, ItemType } from '@/lib/core/types'
import {
  naturalLanguageSearch,
  getSearchSuggestions,
  extractKeywords,
  COMMON_SEARCH_SUGGESTIONS,
} from '@/lib/search/search-utils'
import { useSearchSuggestions } from '@/lib/search/use-server-search'

interface Suggestion {
  type: 'item' | 'tag' | 'author' | 'nlp' | 'hint' | 'server'
  value: string
  label: string
  icon?: string
  itemType?: ItemType
  description?: string
  matchType?: 'exact' | 'keyword' | 'fuzzy' | 'natural' | 'fts'
}

const TYPE_ICONS: Record<ItemType, string> = {
  skill: '⚡',
  agent: '◈',
  command: '▸',
  guide: '📚',
  hook: '🪝',
  package: '📦',
}

interface SearchAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect?: (suggestion: Suggestion) => void
  catalog: CatalogItemSummary[]
  placeholder?: string
  className?: string
  /** Use server-side FTS for suggestions (default: true) */
  useServerSearch?: boolean
}

export function SearchAutocomplete({
  value,
  onChange,
  onSelect,
  catalog,
  placeholder = 'Search skills, agents, commands...',
  className = '',
  useServerSearch = true,
}: SearchAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Server-side suggestions hook
  const {
    suggestions: serverSuggestions,
    isLoading: isLoadingServerSuggestions,
    getSuggestions: fetchServerSuggestions,
    clearSuggestions: clearServerSuggestions,
  } = useSearchSuggestions({ enabled: useServerSearch, limit: 6 })

  // Fetch server suggestions when value changes
  useEffect(() => {
    if (useServerSearch && value.length >= 2) {
      fetchServerSuggestions(value)
    } else {
      clearServerSuggestions()
    }
  }, [value, useServerSearch, fetchServerSuggestions, clearServerSuggestions])

  // Generate suggestions based on query (memoized)
  const generateSuggestions = useCallback((query: string): Suggestion[] => {
    // Show common suggestions when query is empty or very short
    if (!query.trim() || query.length < 2) {
      // Return hint suggestions for common queries
      return COMMON_SEARCH_SUGGESTIONS.slice(0, 4).map(s => ({
        type: 'hint' as const,
        value: s.query,
        label: s.query,
        icon: '💡',
        description: s.description,
      }))
    }

    const lowerQuery = query.toLowerCase()
    const results: Suggestion[] = []
    const seen = new Set<string>()

    // Use natural language search for Korean queries or queries with Korean keywords
    const hasKorean = /[\u3131-\uD79D]/.test(query)
    const extractedKeywords = extractKeywords(query)

    if (hasKorean || extractedKeywords.length > 1) {
      // Natural language search results
      const nlResults = naturalLanguageSearch(catalog, query, {
        includeDescriptions: true,
        maxResults: 6,
        minScore: 15,
      })

      nlResults.forEach(result => {
        if (!seen.has(`item:${result.item.id}`)) {
          results.push({
            type: 'nlp',
            value: result.item.id,
            label: result.item.name,
            icon: TYPE_ICONS[result.item.type],
            itemType: result.item.type,
            description: result.matchedKeywords.length > 0
              ? `${result.item.description.slice(0, 40)}... (${result.matchedKeywords.slice(0, 2).join(', ')})`
              : result.item.description.slice(0, 60) + (result.item.description.length > 60 ? '...' : ''),
            matchType: result.matchType,
          })
          seen.add(`item:${result.item.id}`)
        }
      })
    }

    // Also do traditional search for direct matches
    catalog.forEach(item => {
      if (item.name.toLowerCase().includes(lowerQuery) && !seen.has(`item:${item.id}`)) {
        results.push({
          type: 'item',
          value: item.id,
          label: item.name,
          icon: TYPE_ICONS[item.type],
          itemType: item.type,
          description: item.description.slice(0, 60) + (item.description.length > 60 ? '...' : ''),
        })
        seen.add(`item:${item.id}`)
      }
    })

    // Search items by description (if not already found)
    catalog.forEach(item => {
      if (item.description.toLowerCase().includes(lowerQuery) && !seen.has(`item:${item.id}`)) {
        results.push({
          type: 'item',
          value: item.id,
          label: item.name,
          icon: TYPE_ICONS[item.type],
          itemType: item.type,
          description: item.description.slice(0, 60) + (item.description.length > 60 ? '...' : ''),
        })
        seen.add(`item:${item.id}`)
      }
    })

    // Search tags
    Object.entries(TAGS).forEach(([key, tag]) => {
      if (
        (key.toLowerCase().includes(lowerQuery) || tag.label.toLowerCase().includes(lowerQuery)) &&
        !seen.has(`tag:${key}`)
      ) {
        // Only suggest tags that have items
        const hasItems = catalog.some(item => item.tags.includes(key))
        if (hasItems) {
          results.push({
            type: 'tag',
            value: key,
            label: tag.label,
            icon: '🏷️',
          })
          seen.add(`tag:${key}`)
        }
      }
    })

    // Search authors
    const authors = new Set<string>()
    catalog.forEach(item => {
      if (item.author.toLowerCase().includes(lowerQuery) && !authors.has(item.author)) {
        authors.add(item.author)
        if (!seen.has(`author:${item.author}`)) {
          results.push({
            type: 'author',
            value: item.author,
            label: `@${item.author}`,
            icon: '👤',
          })
          seen.add(`author:${item.author}`)
        }
      }
    })

    // If no results found and there's a query, add search suggestions
    if (results.length === 0 && query.length >= 2) {
      const searchHints = getSearchSuggestions(query, 3)
      searchHints.forEach(hint => {
        results.push({
          type: 'hint',
          value: hint.query,
          label: hint.query,
          icon: '🔍',
          description: hint.description,
        })
      })
    }

    // Limit and sort: NLP matches first, then items, then tags, then authors
    const sortOrder = { nlp: 0, item: 1, tag: 2, author: 3, hint: 4, server: 0 }
    results.sort((a, b) => sortOrder[a.type] - sortOrder[b.type])
    return results.slice(0, 8)
  }, [catalog])

  // Derive suggestions from value (using useMemo instead of useEffect + setState)
  // Combine server suggestions with client-side suggestions
  const suggestions = useMemo(() => {
    const clientSuggestions = generateSuggestions(value)

    // If server search is enabled and we have server suggestions, prioritize them
    if (useServerSearch && serverSuggestions.length > 0) {
      const seen = new Set<string>()
      const combinedSuggestions: Suggestion[] = []

      // Add server suggestions first (marked with FTS badge)
      serverSuggestions.forEach((item) => {
        const key = `item:${item.id}`
        if (!seen.has(key)) {
          combinedSuggestions.push({
            type: 'server',
            value: item.id,
            label: item.name,
            icon: TYPE_ICONS[item.type],
            itemType: item.type,
            matchType: 'fts',
          })
          seen.add(key)
        }
      })

      // Add remaining client suggestions (excluding duplicates)
      clientSuggestions.forEach((suggestion) => {
        const key =
          suggestion.type === 'item' || suggestion.type === 'nlp'
            ? `item:${suggestion.value}`
            : `${suggestion.type}:${suggestion.value}`
        if (!seen.has(key)) {
          combinedSuggestions.push(suggestion)
          seen.add(key)
        }
      })

      return combinedSuggestions.slice(0, 8)
    }

    return clientSuggestions
  }, [value, generateSuggestions, useServerSearch, serverSuggestions])

  // Reset selectedIndex when input value changes
  const handleInputChange = useCallback((newValue: string) => {
    onChange(newValue)
    setSelectedIndex(-1)
  }, [onChange])

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true)
        setSelectedIndex(0)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        // If no item selected yet, start from first item
        if (selectedIndex === -1) {
          setSelectedIndex(0)
        } else {
          setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0))
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        // If no item selected yet, start from last item
        if (selectedIndex === -1) {
          setSelectedIndex(suggestions.length - 1)
        } else {
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1))
        }
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          handleSelectSuggestion(suggestions[selectedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSelectedIndex(-1)
        break
    }
  }

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    if (suggestion.type === 'item' || suggestion.type === 'nlp' || suggestion.type === 'server') {
      // Navigate to item page
      window.location.href = `/${suggestion.itemType}/${suggestion.value}`
    } else if (suggestion.type === 'tag') {
      onChange(`tag:${suggestion.value}`)
    } else if (suggestion.type === 'author') {
      onChange(`author:${suggestion.value}`)
    } else if (suggestion.type === 'hint') {
      // Apply the suggested search query
      onChange(suggestion.value)
      // Don't close - let user see results for the suggested query
      return
    }
    onSelect?.(suggestion)
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        id="search-input"
        type="text"
        value={value}
        onChange={(e) => {
          handleInputChange(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => value.length >= 2 && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-6 py-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
        autoComplete="off"
      />

      {/* Input decorations */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
        {value && (
          <button
            onClick={() => {
              handleInputChange('')
              setIsOpen(false)
            }}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            ✕
          </button>
        )}
        <kbd className="px-2 py-1 text-[10px] rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
          ⌘K
        </kbd>
      </div>

      {/* Suggestions dropdown */}
      {isOpen && (suggestions.length > 0 || isLoadingServerSuggestions) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden animate-fade-up"
        >
          {/* Loading indicator */}
          {isLoadingServerSuggestions && suggestions.length === 0 && (
            <div className="px-4 py-3 flex items-center gap-3 text-[var(--text-muted)]">
              <span className="animate-spin">⟳</span>
              <span className="text-sm">Searching...</span>
            </div>
          )}
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}:${suggestion.value}`}
              onClick={() => handleSelectSuggestion(suggestion)}
              className={`w-full px-4 py-3 flex items-start gap-3 text-left transition-colors ${
                index === selectedIndex
                  ? 'bg-[var(--bg-tertiary)]'
                  : 'hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <span className="text-lg flex-shrink-0 mt-0.5">{suggestion.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {suggestion.label}
                  </span>
                  {suggestion.type === 'server' ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                      FTS
                    </span>
                  ) : suggestion.type === 'nlp' ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      suggestion.matchType === 'exact'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : suggestion.matchType === 'keyword'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'bg-purple-500/20 text-purple-400'
                    }`}>
                      {suggestion.matchType === 'exact' ? 'EXACT' : suggestion.matchType === 'keyword' ? 'KEYWORD' : 'NL'}
                    </span>
                  ) : suggestion.type === 'hint' ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                      TRY THIS
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      {suggestion.type}
                    </span>
                  )}
                </div>
                {suggestion.description && (
                  <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                    {suggestion.description}
                  </p>
                )}
              </div>
              {index === selectedIndex && (
                <span className="text-[10px] text-[var(--text-muted)] self-center">↵</span>
              )}
            </button>
          ))}

          {/* Search hint */}
          <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
            <span className="text-[10px] text-[var(--text-muted)]">
              ↑↓ to navigate • ↵ to select • esc to close
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
