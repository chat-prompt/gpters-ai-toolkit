'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { TAGS, type ItemType, type Difficulty, type TeamTag } from '@/lib/core/types'
import {
  naturalLanguageSearch,
  extractKeywords,
  getDidYouMeanSuggestions,
} from '@/lib/search/search-utils'
import type { UseSearchFiltersOptions, UseSearchFiltersReturn } from './types'

export function useSearchFilters({
  catalog,
}: UseSearchFiltersOptions): UseSearchFiltersReturn {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Initialize state from URL params
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [activeFilter, setActiveFilter] = useState<ItemType | 'all'>(
    (searchParams.get('type') as ItemType | 'all') || 'all'
  )
  const [selectedTags, setSelectedTags] = useState<string[]>(
    searchParams.get('tags')?.split(',').filter(Boolean) || []
  )
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | ''>(
    (searchParams.get('difficulty') as Difficulty) || ''
  )
  const [selectedTeamTag, setSelectedTeamTag] = useState<TeamTag | ''>(
    (searchParams.get('team') as TeamTag) || ''
  )
  const [showFilters, setShowFilters] = useState(
    Boolean(searchParams.get('tags') || searchParams.get('difficulty') || searchParams.get('team'))
  )

  // Sync URL with filter state
  const updateURL = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(searchParams.toString())

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
          params.delete(key)
        } else if (Array.isArray(value)) {
          params.set(key, value.join(','))
        } else {
          params.set(key, value)
        }
      })

      const queryString = params.toString()
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
    },
    [searchParams, router, pathname]
  )

  // Debounced search query update
  useEffect(() => {
    const timer = setTimeout(() => {
      updateURL({ q: searchQuery || null })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, updateURL])

  // Handlers that update both state and URL
  const handleTypeFilter = useCallback(
    (type: ItemType | 'all') => {
      setActiveFilter(type)
      updateURL({ type: type === 'all' ? null : type })
    },
    [updateURL]
  )

  const handleTagToggle = useCallback(
    (tag: string) => {
      setSelectedTags((prev) => {
        const newTags = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        updateURL({ tags: newTags.length > 0 ? newTags : null })
        return newTags
      })
    },
    [updateURL]
  )

  const handleDifficultyChange = useCallback(
    (difficulty: Difficulty | '') => {
      setSelectedDifficulty(difficulty)
      updateURL({ difficulty: difficulty || null })
    },
    [updateURL]
  )

  const handleTeamTagChange = useCallback(
    (team: TeamTag | '') => {
      setSelectedTeamTag(team)
      updateURL({ team: team || null })
    },
    [updateURL]
  )

  const handleClearAllFilters = useCallback(() => {
    setSelectedTags([])
    setSelectedDifficulty('')
    setSelectedTeamTag('')
    setSearchQuery('')
    setActiveFilter('all')
    router.replace(pathname, { scroll: false })
  }, [router, pathname])

  // Get unique tags from all items
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    catalog.forEach((item) => item.tags.forEach((tag) => tagSet.add(tag)))
    return Array.from(tagSet).sort()
  }, [catalog])

  // Filter items based on search query, type filter, tags, and difficulty
  const { filteredCatalog, didYouMean } = useMemo(() => {
    // First, apply non-search filters
    let filtered = catalog.filter((item) => {
      // Type filter
      if (activeFilter !== 'all' && item.type !== activeFilter) {
        return false
      }

      // Tag filter - item must have ALL selected tags
      if (selectedTags.length > 0) {
        const hasAllTags = selectedTags.every((tag) => item.tags.includes(tag))
        if (!hasAllTags) return false
      }

      // Difficulty filter
      if (selectedDifficulty && item.difficulty !== selectedDifficulty) {
        return false
      }

      // Team tag filter
      if (selectedTeamTag && item.teamTag !== selectedTeamTag) {
        return false
      }

      return true
    })

    // Then apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()

      // Handle tag: prefix - exact tag filter
      if (query.startsWith('tag:')) {
        const tagKey = query.slice(4).trim()
        filtered = filtered.filter((item) =>
          item.tags.some(
            (tag) =>
              tag.toLowerCase() === tagKey ||
              (TAGS[tag]?.label || '').toLowerCase() === tagKey
          )
        )
        return { filteredCatalog: filtered, didYouMean: [] }
      }

      // Handle author: prefix - exact author filter
      if (query.startsWith('author:')) {
        const authorName = query.slice(7).trim()
        filtered = filtered.filter((item) => item.author.toLowerCase() === authorName)
        return { filteredCatalog: filtered, didYouMean: [] }
      }

      // Check if this is a natural language query (Korean or multi-word)
      const hasKorean = /[\u3131-\uD79D]/.test(searchQuery)
      const extractedKeywords = extractKeywords(searchQuery)

      if (hasKorean || extractedKeywords.length > 1) {
        // Use natural language search
        const nlResults = naturalLanguageSearch(filtered, searchQuery, {
          includeDescriptions: true,
          maxResults: 100,
          minScore: 10,
        })

        // If no results, get "did you mean" suggestions
        if (nlResults.length === 0) {
          const suggestions = getDidYouMeanSuggestions(searchQuery, catalog, 3)
          return { filteredCatalog: [], didYouMean: suggestions }
        }

        // Sort by score
        const sortedItems = nlResults.map((r) => r.item)
        return { filteredCatalog: sortedItems, didYouMean: [] }
      }

      // Traditional text search for simple queries
      filtered = filtered
        .filter((item) => {
          const matchesName = item.name.toLowerCase().includes(query)
          const matchesDescription = item.description.toLowerCase().includes(query)
          const matchesTags = item.tags.some(
            (tag) =>
              tag.toLowerCase().includes(query) ||
              (TAGS[tag]?.label || '').toLowerCase().includes(query)
          )
          const matchesAuthor = item.author.toLowerCase().includes(query)
          const matchesId = item.id.toLowerCase().includes(query)

          return matchesName || matchesDescription || matchesTags || matchesAuthor || matchesId
        })
        .sort((a, b) => {
          // Prioritize name matches
          const aNameMatch = a.name.toLowerCase().includes(query) ? 1 : 0
          const bNameMatch = b.name.toLowerCase().includes(query) ? 1 : 0
          if (aNameMatch !== bNameMatch) return bNameMatch - aNameMatch
          // Then sort by updated date
          return (b.updatedAt || '').localeCompare(a.updatedAt || '')
        })

      // If no results, get "did you mean" suggestions
      if (filtered.length === 0) {
        const suggestions = getDidYouMeanSuggestions(searchQuery, catalog, 3)
        return { filteredCatalog: [], didYouMean: suggestions }
      }

      return { filteredCatalog: filtered, didYouMean: [] }
    }

    // No search query - just sort by updated date
    filtered.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    return { filteredCatalog: filtered, didYouMean: [] }
  }, [catalog, searchQuery, activeFilter, selectedTags, selectedDifficulty, selectedTeamTag])

  const hasActiveFilters =
    selectedTags.length > 0 || selectedDifficulty !== '' || selectedTeamTag !== ''

  // Memoize category groupings
  const { skills, agents, commands, hooks } = useMemo(
    () => ({
      skills: filteredCatalog.filter((item) => item.type === 'skill'),
      agents: filteredCatalog.filter((item) => item.type === 'agent'),
      commands: filteredCatalog.filter((item) => item.type === 'command'),
      hooks: filteredCatalog.filter((item) => item.type === 'hook'),
    }),
    [filteredCatalog]
  )

  // Memoize total counts from original catalog
  const { totalSkills, totalAgents, totalCommands, totalHooks } = useMemo(
    () => ({
      totalSkills: catalog.filter((item) => item.type === 'skill').length,
      totalAgents: catalog.filter((item) => item.type === 'agent').length,
      totalCommands: catalog.filter((item) => item.type === 'command').length,
      totalHooks: catalog.filter((item) => item.type === 'hook').length,
    }),
    [catalog]
  )

  // Keyboard shortcut for search (⌘K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return {
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
  }
}
