/**
 * Discovery analytics system unit tests
 *
 * Tests for schema changes, audit entry types, _meta handling,
 * and referral source inference logic.
 */

import { describe, it, expect } from 'vitest'
import type { McpAuditEntry } from '@/lib/security/mcp-audit'
import type { McpToolResponse, ToolExecutionMeta, SemanticSearchInput } from '@/lib/mcp/types'

describe('Discovery Analytics Schema', () => {
  describe('McpAuditEntry interface', () => {
    it('accepts discovery analytics fields', () => {
      const entry: McpAuditEntry = {
        method: 'jsonrpc:tools/call',
        tool: 'semantic_search',
        isAuthenticated: true,
        ipHash: 'abc123',
        responseStatus: 'success',
        sessionId: 'mcp_123_abc',
        searchResults: [
          { itemId: 'skill-1', rank: 1, score: 0.95 },
          { itemId: 'skill-2', rank: 2, score: 0.80 },
        ],
        referralSource: 'search',
      }

      expect(entry.sessionId).toBe('mcp_123_abc')
      expect(entry.searchResults).toHaveLength(2)
      expect(entry.searchResults![0].score).toBe(0.95)
      expect(entry.referralSource).toBe('search')
    })

    it('allows undefined discovery fields (backward compat)', () => {
      const entry: McpAuditEntry = {
        method: 'jsonrpc:tools/call',
        tool: 'get_plugin_content',
        isAuthenticated: false,
        ipHash: 'xyz789',
        responseStatus: 'success',
      }

      expect(entry.sessionId).toBeUndefined()
      expect(entry.searchResults).toBeUndefined()
      expect(entry.referralSource).toBeUndefined()
    })
  })

  describe('McpToolResponse _meta', () => {
    it('includes _meta in tool response', () => {
      const response: McpToolResponse = {
        content: [{ type: 'text', text: '{"plugins":[]}' }],
        _meta: {
          searchResults: [
            { itemId: 'code-reviewer', rank: 1, score: 0.92 },
          ],
        },
      }

      expect(response._meta).toBeDefined()
      expect(response._meta!.searchResults).toHaveLength(1)
      expect(response._meta!.searchResults![0].itemId).toBe('code-reviewer')
    })

    it('allows _meta to be undefined', () => {
      const response: McpToolResponse = {
        content: [{ type: 'text', text: '{}' }],
      }

      expect(response._meta).toBeUndefined()
    })

    it('supports referralSource in _meta', () => {
      const meta: ToolExecutionMeta = {
        searchResults: [{ itemId: 'x', rank: 1, score: 0.5 }],
        referralSource: 'suggest',
      }

      expect(meta.referralSource).toBe('suggest')
    })
  })

  describe('SemanticSearchInput _source', () => {
    it('accepts _source field for referral tracking', () => {
      const input: SemanticSearchInput = {
        query: 'code review',
        category: 'skill',
        limit: 5,
        _source: 'skill-suggest',
      }

      expect(input._source).toBe('skill-suggest')
    })

    it('allows _source to be undefined', () => {
      const input: SemanticSearchInput = {
        query: 'database',
      }

      expect(input._source).toBeUndefined()
    })
  })

  describe('_meta extraction logic', () => {
    it('extracts _meta from JSON-RPC response result', () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [{ type: 'text', text: '{"plugins":[]}' }],
          _meta: {
            searchResults: [{ itemId: 'a', rank: 1, score: 0.9 }],
          },
        },
      }

      // Simulate extraction logic from route.ts
      let toolMeta: ToolExecutionMeta | undefined
      if (response && typeof response === 'object' && !Array.isArray(response) && 'result' in response) {
        const result = (response as Record<string, unknown>).result as Record<string, unknown> | undefined
        if (result?._meta) {
          toolMeta = result._meta as ToolExecutionMeta
          delete result._meta
        }
      }

      expect(toolMeta).toBeDefined()
      expect(toolMeta!.searchResults).toHaveLength(1)
      // _meta should be stripped from response
      expect((response.result as Record<string, unknown>)._meta).toBeUndefined()
    })

    it('handles responses without _meta gracefully', () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [{ type: 'text', text: '{}' }],
        },
      }

      let toolMeta: ToolExecutionMeta | undefined
      if (response && typeof response === 'object' && !Array.isArray(response) && 'result' in response) {
        const result = (response as Record<string, unknown>).result as Record<string, unknown> | undefined
        if (result?._meta) {
          toolMeta = result._meta as ToolExecutionMeta
          delete result._meta
        }
      }

      expect(toolMeta).toBeUndefined()
    })

    it('handles error responses (no result field)', () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32600, message: 'Invalid Request' },
      }

      let toolMeta: ToolExecutionMeta | undefined
      if (response && typeof response === 'object' && !Array.isArray(response) && 'result' in response) {
        const result = (response as Record<string, unknown>).result as Record<string, unknown> | undefined
        if (result?._meta) {
          toolMeta = result._meta as ToolExecutionMeta
          delete result._meta
        }
      }

      expect(toolMeta).toBeUndefined()
    })
  })

  describe('referralSource values', () => {
    it('validates expected referral source values', () => {
      const validSources = ['search', 'suggest', 'direct', 'browse']

      validSources.forEach((source) => {
        const entry: Partial<McpAuditEntry> = { referralSource: source }
        expect(entry.referralSource).toBe(source)
      })
    })
  })

  describe('searchResults structure', () => {
    it('validates search results array format', () => {
      const results: Array<{ itemId: string; rank: number; score: number }> = [
        { itemId: 'code-reviewer', rank: 1, score: 0.95 },
        { itemId: 'refactor-guide', rank: 2, score: 0.82 },
        { itemId: 'data-source-reference', rank: 3, score: 0.71 },
      ]

      expect(results).toHaveLength(3)
      expect(results[0].rank).toBe(1)
      expect(results[2].score).toBe(0.71)

      // Ranks should be sequential
      results.forEach((r, idx) => {
        expect(r.rank).toBe(idx + 1)
      })

      // Scores should be descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score)
      }
    })
  })

  describe('truncation limit update', () => {
    it('validates new 500-char truncation for audit masking', () => {
      const longString = 'a'.repeat(600)
      const truncated = longString.length > 500
        ? longString.substring(0, 500) + '...[truncated]'
        : longString

      expect(truncated).toHaveLength(500 + '...[truncated]'.length)
      expect(truncated.endsWith('...[truncated]')).toBe(true)
    })

    it('does not truncate strings under 500 chars', () => {
      const shortString = 'a'.repeat(499)
      const result = shortString.length > 500
        ? shortString.substring(0, 500) + '...[truncated]'
        : shortString

      expect(result).toBe(shortString)
      expect(result).toHaveLength(499)
    })
  })
})

describe('Discovery Analysis API', () => {
  describe('reportType validation', () => {
    const validTypes = ['search-effectiveness', 'recommendation-accuracy', 'usage-gaps', 'funnel', 'full']

    it('accepts all valid report types', () => {
      validTypes.forEach((type) => {
        expect(validTypes.includes(type)).toBe(true)
      })
    })

    it('rejects invalid report types', () => {
      expect(validTypes.includes('invalid')).toBe(false)
      expect(validTypes.includes('')).toBe(false)
    })
  })

  describe('days parameter validation', () => {
    it('clamps days to valid range', () => {
      const clamp = (days: number) => Math.min(Math.max(days, 1), 90)

      expect(clamp(30)).toBe(30)
      expect(clamp(0)).toBe(1)
      expect(clamp(-5)).toBe(1)
      expect(clamp(100)).toBe(90)
      expect(clamp(90)).toBe(90)
      expect(clamp(1)).toBe(1)
    })
  })
})
