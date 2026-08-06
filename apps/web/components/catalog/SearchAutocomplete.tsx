/**
 * Search autocomplete component with NLP support
 *
 * Provides real-time search suggestions combining:
 * - Server-side full-text search (FTS) for accurate results
 * - Client-side natural language processing for Korean queries
 * - Tag, author, and item suggestions with type indicators
 */
'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { CatalogItemSummary, TAGS, ItemType } from '@/lib/core/types'
import {
  naturalLanguageSearch,
  extractKeywords,
} from '@/lib/search/search-utils'
import { useSearchSuggestions } from '@/lib/search/use-server-search'

/**
 * Search suggestion item
 */
interface Suggestion {
  /** Type of suggestion (item, tag, author, nlp, hint, or server) */
  type: 'item' | 'tag' | 'author' | 'nlp' | 'hint' | 'server'
  /** Unique identifier or value for the suggestion */
  value: string
  /** Display label for the suggestion */
  label: string
  /** Item type for item suggestions */
  itemType?: ItemType
  /** Optional description text */
  description?: string
  /** Type of match that produced this suggestion */
  matchType?: 'exact' | 'keyword' | 'fuzzy' | 'natural' | 'fts'
}

/**
 * 제안 한 줄 앞에 붙는 분류 라벨
 *
 * 예전에는 유형마다 이모지를 달았는데, 목록이 길어지면 이름보다 그림이 먼저
 * 읽혔다. 어떤 검색 방식으로 걸렸는지(FTS·NL 같은) 표시하던 배지도 뺐다 —
 * 찾는 사람에게 필요한 정보가 아니다.
 *
 * @param suggestion - 제안 항목
 * @returns 대문자로 그릴 짧은 분류 이름
 */
function suggestionKind(suggestion: Suggestion): string {
  return suggestion.itemType ?? suggestion.type
}

/**
 * Props for the SearchAutocomplete component
 */
interface SearchAutocompleteProps {
  /** Current search input value */
  value: string
  /** Callback when search value changes */
  onChange: (value: string) => void
  /** Callback when a suggestion is selected */
  onSelect?: (suggestion: Suggestion) => void
  /** Catalog items to search through */
  catalog: CatalogItemSummary[]
  /** Placeholder text for input */
  placeholder?: string
  /** Additional CSS classes */
  className?: string
  /** Use server-side FTS for suggestions (default: true) */
  useServerSearch?: boolean
}

/**
 * Search autocomplete input with intelligent suggestions
 *
 * Features:
 * - Hybrid search combining server FTS and client-side NLP
 * - Korean language support with keyword extraction
 * - Keyboard navigation (↑↓ arrows, Enter, Escape)
 * - Direct navigation to items on selection
 *
 * @example
 * ```tsx
 * <SearchAutocomplete
 *   value={searchQuery}
 *   onChange={setSearchQuery}
 *   catalog={items}
 *   useServerSearch={true}
 * />
 * ```
 */
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
    // No suggestions for empty or very short queries
    if (!query.trim() || query.length < 2) {
      return []
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
          })
          seen.add(`tag:${key}`)
        }
      }
    })

    // Search authors
    const authors = new Set<string>()
    catalog.forEach(item => {
      if (item.authorName?.toLowerCase().includes(lowerQuery) && !authors.has(item.authorName)) {
        authors.add(item.authorName)
        if (!seen.has(`author:${item.authorName}`)) {
          results.push({
            type: 'author',
            value: item.authorName,
            label: `@${item.authorName}`,
          })
          seen.add(`author:${item.authorName}`)
        }
      }
    })

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
        className="w-full px-5 py-3.5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm hover:border-[var(--border-hover)] focus:border-[var(--brand-primary)] transition-colors"
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
            aria-label="검색어 지우기"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            ✕
          </button>
        )}
        <kbd className="font-mono px-2 py-1 text-[10px] rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
          ⌘K
        </kbd>
      </div>

      {/* Suggestions dropdown */}
      {isOpen && (suggestions.length > 0 || isLoadingServerSuggestions) && (
        <div
          ref={dropdownRef}
          className="reveal absolute z-50 w-full mt-2 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.4)] overflow-hidden"
        >
          {/* Loading indicator */}
          {isLoadingServerSuggestions && suggestions.length === 0 && (
            <div className="px-4 py-3 text-sm text-[var(--text-muted)]">Searching...</div>
          )}
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}:${suggestion.value}`}
              onClick={() => handleSelectSuggestion(suggestion)}
              className={`w-full px-4 py-2.5 flex items-baseline gap-3 text-left transition-colors ${
                index === selectedIndex
                  ? 'bg-[var(--bg-tertiary)]'
                  : 'hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] w-16 shrink-0">
                {suggestionKind(suggestion)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-[var(--text-primary)] truncate">
                  {suggestion.label}
                </span>
                {suggestion.description && (
                  <span className="block text-xs text-[var(--text-muted)] truncate mt-0.5">
                    {suggestion.description}
                  </span>
                )}
              </span>
              {index === selectedIndex && (
                <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">↵</span>
              )}
            </button>
          ))}

          {/* Search hint */}
          <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              ↑↓ navigate · ↵ select · esc close
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
