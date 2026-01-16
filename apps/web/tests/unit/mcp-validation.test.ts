import { describe, it, expect } from 'vitest'
import {
  containsDangerousPatterns,
  sanitizeString,
  validateSearchRequest,
  validateGetRequest,
  validateListRequest,
  validateJsonRpcRequest,
  isRequestSizeValid,
  MAX_REQUEST_SIZE,
  pluginIdSchema,
  searchQuerySchema,
} from '@/lib/security/mcp-validation'

describe('MCP Validation', () => {
  describe('containsDangerousPatterns', () => {
    it('should detect SQL injection patterns', () => {
      expect(containsDangerousPatterns("'; DROP TABLE users;--")).toBe(true)
      expect(containsDangerousPatterns("1' OR '1'='1")).toBe(true)
      expect(containsDangerousPatterns("SELECT * FROM users")).toBe(true)
      expect(containsDangerousPatterns("UNION SELECT password FROM users")).toBe(true)
    })

    it('should detect script injection', () => {
      expect(containsDangerousPatterns('<script>alert("xss")</script>')).toBe(true)
      expect(containsDangerousPatterns('javascript:alert(1)')).toBe(true)
      expect(containsDangerousPatterns('onclick=alert(1)')).toBe(true)
    })

    it('should detect path traversal', () => {
      expect(containsDangerousPatterns('../../../etc/passwd')).toBe(true)
      expect(containsDangerousPatterns('..\\..\\windows\\system32')).toBe(true)
    })

    it('should detect command injection', () => {
      expect(containsDangerousPatterns('test; rm -rf /')).toBe(true)
      expect(containsDangerousPatterns('test | cat /etc/passwd')).toBe(true)
      expect(containsDangerousPatterns('test `whoami`')).toBe(true)
    })

    it('should allow safe strings', () => {
      expect(containsDangerousPatterns('code-reviewer')).toBe(false)
      expect(containsDangerousPatterns('my-awesome-skill')).toBe(false)
      expect(containsDangerousPatterns('database helper')).toBe(false)
      expect(containsDangerousPatterns('test123')).toBe(false)
    })
  })

  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello')
    })

    it('should remove null bytes', () => {
      expect(sanitizeString('hello\0world')).toBe('helloworld')
    })

    it('should escape HTML entities', () => {
      expect(sanitizeString('<script>')).toBe('&lt;script&gt;')
      expect(sanitizeString('"test"')).toBe('&quot;test&quot;')
      expect(sanitizeString("'test'")).toBe('&#x27;test&#x27;')
    })
  })

  describe('pluginIdSchema', () => {
    it('should accept valid plugin IDs', () => {
      expect(pluginIdSchema.safeParse('code-reviewer').success).toBe(true)
      expect(pluginIdSchema.safeParse('my_skill_123').success).toBe(true)
      expect(pluginIdSchema.safeParse('test').success).toBe(true)
    })

    it('should reject invalid plugin IDs', () => {
      expect(pluginIdSchema.safeParse('').success).toBe(false)
      expect(pluginIdSchema.safeParse('-invalid').success).toBe(false)
      expect(pluginIdSchema.safeParse('has spaces').success).toBe(false)
      expect(pluginIdSchema.safeParse('has/slash').success).toBe(false)
    })

    it('should reject dangerous patterns', () => {
      expect(pluginIdSchema.safeParse("test'; DROP TABLE").success).toBe(false)
    })

    it('should reject too long IDs', () => {
      const longId = 'a'.repeat(101)
      expect(pluginIdSchema.safeParse(longId).success).toBe(false)
    })
  })

  describe('searchQuerySchema', () => {
    it('should accept valid queries', () => {
      const result = searchQuerySchema.safeParse('database helper')
      expect(result.success).toBe(true)
    })

    it('should sanitize query', () => {
      const result = searchQuerySchema.safeParse('  test <script>  ')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('test &lt;script&gt;')
      }
    })

    it('should reject too long queries', () => {
      const longQuery = 'a'.repeat(501)
      expect(searchQuerySchema.safeParse(longQuery).success).toBe(false)
    })
  })

  describe('validateSearchRequest', () => {
    it('should validate valid search request', () => {
      const result = validateSearchRequest({
        query: 'database',
        category: 'skill',
        limit: 10,
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty body', () => {
      const result = validateSearchRequest({})
      expect(result.success).toBe(true)
    })

    it('should reject invalid category', () => {
      const result = validateSearchRequest({
        category: 'invalid',
      })
      expect(result.success).toBe(false)
    })

    it('should reject limit over 100', () => {
      const result = validateSearchRequest({
        limit: 101,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('validateGetRequest', () => {
    it('should validate valid get request', () => {
      const result = validateGetRequest({
        pluginId: 'code-reviewer',
      })
      expect(result.success).toBe(true)
    })

    it('should reject missing pluginId', () => {
      const result = validateGetRequest({})
      expect(result.success).toBe(false)
    })

    it('should reject invalid pluginId', () => {
      const result = validateGetRequest({
        pluginId: '../../../etc/passwd',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('validateListRequest', () => {
    it('should validate valid list request', () => {
      const result = validateListRequest({
        category: 'skill',
        limit: 20,
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty body', () => {
      const result = validateListRequest({})
      expect(result.success).toBe(true)
    })
  })

  describe('validateJsonRpcRequest', () => {
    it('should validate valid JSON-RPC request', () => {
      const result = validateJsonRpcRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      })
      expect(result.success).toBe(true)
    })

    it('should validate with params', () => {
      const result = validateJsonRpcRequest({
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'tools/call',
        params: { name: 'search_plugins', arguments: { query: 'test' } },
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid jsonrpc version', () => {
      const result = validateJsonRpcRequest({
        jsonrpc: '1.0',
        id: 1,
        method: 'test',
      })
      expect(result.success).toBe(false)
    })

    it('should reject missing method', () => {
      const result = validateJsonRpcRequest({
        jsonrpc: '2.0',
        id: 1,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('isRequestSizeValid', () => {
    it('should accept null (no content-length)', () => {
      expect(isRequestSizeValid(null)).toBe(true)
    })

    it('should accept valid size', () => {
      expect(isRequestSizeValid(1024)).toBe(true)
      expect(isRequestSizeValid(MAX_REQUEST_SIZE)).toBe(true)
    })

    it('should reject oversized requests', () => {
      expect(isRequestSizeValid(MAX_REQUEST_SIZE + 1)).toBe(false)
    })
  })
})
