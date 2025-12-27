'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { CatalogItem, TAGS, ItemType } from '@/lib/types'

interface Suggestion {
  type: 'item' | 'tag' | 'author'
  value: string
  label: string
  icon?: string
  itemType?: ItemType
  description?: string
}

const TYPE_ICONS: Record<ItemType, string> = {
  skill: '⚡',
  agent: '◈',
  command: '▸',
  guide: '📚',
  hook: '🪝',
}

interface SearchAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect?: (suggestion: Suggestion) => void
  catalog: CatalogItem[]
  placeholder?: string
  className?: string
}

export function SearchAutocomplete({
  value,
  onChange,
  onSelect,
  catalog,
  placeholder = 'Search skills, agents, commands...',
  className = '',
}: SearchAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Generate suggestions based on query
  const generateSuggestions = useCallback((query: string): Suggestion[] => {
    if (!query.trim() || query.length < 2) return []

    const lowerQuery = query.toLowerCase()
    const results: Suggestion[] = []
    const seen = new Set<string>()

    // Search items by name (prioritized)
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

    // Limit and sort: items first, then tags, then authors
    return results.slice(0, 8)
  }, [catalog])

  // Update suggestions when query changes
  useEffect(() => {
    const newSuggestions = generateSuggestions(value)
    setSuggestions(newSuggestions)
    setSelectedIndex(-1)
  }, [value, generateSuggestions])

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
        setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1))
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
    if (suggestion.type === 'item') {
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
          onChange(e.target.value)
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
              onChange('')
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
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden animate-fade-up"
        >
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
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    {suggestion.type}
                  </span>
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
