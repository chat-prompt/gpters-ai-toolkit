'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ItemType } from '@/lib/core/types'

interface SearchParams {
  query: string
  type?: ItemType | 'all'
  status?: 'published' | 'draft' | 'all'
  limit?: number
  offset?: number
  sortBy?: 'relevance' | 'newest' | 'popular' | 'name'
  teamTag?: string
  tags?: string[]
}

interface SearchItem {
  id: string
  name: string
  type: ItemType
  description: string
  content: string
  author: string
  tags: string[]
  difficulty: string | null
  teamTag: string | null
  status: string
  likes: number
  createdAt: string
  updatedAt: string
}

interface SearchResponse {
  items: SearchItem[]
  total: number
  hasMore: boolean
  searchTime: number
  query: string
  filters: {
    type: ItemType | 'all'
    status: string
    sortBy: string
    teamTag?: string
    tags?: string[]
  }
  pagination: {
    limit: number
    offset: number
    page: number
    totalPages: number
  }
}

interface SuggestionItem {
  id: string
  name: string
  type: ItemType
}

interface SuggestionsResponse {
  suggestions: SuggestionItem[]
  query: string
}

interface UseServerSearchOptions {
  debounceMs?: number
  enabled?: boolean
}

interface UseServerSearchReturn {
  results: SearchItem[]
  total: number
  hasMore: boolean
  isLoading: boolean
  error: Error | null
  searchTime: number
  search: (params: SearchParams) => Promise<void>
  loadMore: () => Promise<void>
}

/**
 * Hook for server-side catalog search using PostgreSQL FTS
 */
export function useServerSearch(
  options: UseServerSearchOptions = {}
): UseServerSearchReturn {
  const { debounceMs: _debounceMs = 300, enabled = true } = options

  const [results, setResults] = useState<SearchItem[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [searchTime, setSearchTime] = useState(0)

  const currentParamsRef = useRef<SearchParams | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const search = useCallback(
    async (params: SearchParams) => {
      if (!enabled) return

      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Store current params for loadMore
      currentParamsRef.current = params

      // Create new abort controller
      abortControllerRef.current = new AbortController()

      setIsLoading(true)
      setError(null)

      try {
        const searchParams = new URLSearchParams()

        if (params.query) searchParams.set('q', params.query)
        if (params.type && params.type !== 'all') searchParams.set('type', params.type)
        if (params.status) searchParams.set('status', params.status)
        if (params.limit) searchParams.set('limit', String(params.limit))
        if (params.offset) searchParams.set('offset', String(params.offset))
        if (params.sortBy) searchParams.set('sortBy', params.sortBy)
        if (params.teamTag) searchParams.set('teamTag', params.teamTag)
        if (params.tags && params.tags.length > 0) {
          searchParams.set('tags', params.tags.join(','))
        }

        const response = await fetch(`/api/catalog/search?${searchParams.toString()}`, {
          signal: abortControllerRef.current.signal,
        })

        if (!response.ok) {
          throw new Error(`Search failed: ${response.statusText}`)
        }

        const data: SearchResponse = await response.json()

        setResults(data.items)
        setTotal(data.total)
        setHasMore(data.hasMore)
        setSearchTime(data.searchTime)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was aborted, ignore
          return
        }
        setError(err instanceof Error ? err : new Error('Search failed'))
      } finally {
        setIsLoading(false)
      }
    },
    [enabled]
  )

  const loadMore = useCallback(async () => {
    if (!currentParamsRef.current || !hasMore || isLoading) return

    const params = currentParamsRef.current
    const newOffset = (params.offset || 0) + (params.limit || 20)

    await search({
      ...params,
      offset: newOffset,
    })
  }, [hasMore, isLoading, search])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    results,
    total,
    hasMore,
    isLoading,
    error,
    searchTime,
    search,
    loadMore,
  }
}

interface UseSearchSuggestionsOptions {
  debounceMs?: number
  limit?: number
  enabled?: boolean
}

interface UseSearchSuggestionsReturn {
  suggestions: SuggestionItem[]
  isLoading: boolean
  error: Error | null
  getSuggestions: (query: string) => Promise<void>
  clearSuggestions: () => void
}

/**
 * Hook for fetching search suggestions from the server
 */
export function useSearchSuggestions(
  options: UseSearchSuggestionsOptions = {}
): UseSearchSuggestionsReturn {
  const { debounceMs: debounceDelay = 150, limit = 5, enabled = true } = options

  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const getSuggestions = useCallback(
    async (query: string) => {
      if (!enabled) return

      // Clear pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      // Clear suggestions for empty query
      if (!query.trim() || query.length < 2) {
        setSuggestions([])
        return
      }

      // Debounce the request
      debounceTimerRef.current = setTimeout(async () => {
        // Cancel any pending request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }

        abortControllerRef.current = new AbortController()
        setIsLoading(true)
        setError(null)

        try {
          const params = new URLSearchParams({
            q: query,
            suggestions: 'true',
            limit: String(limit),
          })

          const response = await fetch(`/api/catalog/search?${params.toString()}`, {
            signal: abortControllerRef.current.signal,
          })

          if (!response.ok) {
            throw new Error(`Failed to fetch suggestions: ${response.statusText}`)
          }

          const data: SuggestionsResponse = await response.json()
          setSuggestions(data.suggestions)
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            return
          }
          setError(err instanceof Error ? err : new Error('Failed to fetch suggestions'))
        } finally {
          setIsLoading(false)
        }
      }, debounceDelay)
    },
    [enabled, limit, debounceDelay]
  )

  const clearSuggestions = useCallback(() => {
    setSuggestions([])
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    suggestions,
    isLoading,
    error,
    getSuggestions,
    clearSuggestions,
  }
}
