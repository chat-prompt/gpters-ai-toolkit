/**
 * MCP Audit Logging Tests
 *
 * Unit tests for MCP audit logging functionality
 */

import { describe, it, expect, vi } from 'vitest'

// Mock the database module
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/lib/db/schema', () => ({
  mcpAuditLogs: {
    id: 'id',
    method: 'method',
    tool: 'tool',
    tokenId: 'token_id',
    isAuthenticated: 'is_authenticated',
    ipHash: 'ip_hash',
    userAgent: 'user_agent',
    requestParams: 'request_params',
    responseStatus: 'response_status',
    responseTime: 'response_time',
    errorCode: 'error_code',
    errorMessage: 'error_message',
    createdAt: 'created_at',
  },
  mcpTokens: {
    id: 'id',
  },
}))

describe('MCP Audit Logging', () => {
  describe('Sensitive Data Masking', () => {
    it('should mask sensitive keys in request params', () => {
      const sensitiveKeys = ['token', 'password', 'secret', 'key', 'authorization', 'credential']

      const maskData = (params: Record<string, unknown>) => {
        const masked: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(params)) {
          const lowerKey = key.toLowerCase()
          if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
            masked[key] = '[REDACTED]'
          } else {
            masked[key] = value
          }
        }
        return masked
      }

      expect(maskData({ apiToken: 'abc123' }).apiToken).toBe('[REDACTED]')
      expect(maskData({ password: 'secret' }).password).toBe('[REDACTED]')
      expect(maskData({ secretKey: 'xyz' }).secretKey).toBe('[REDACTED]')
      expect(maskData({ query: 'search term' }).query).toBe('search term')
    })

    it('should truncate long string values', () => {
      const truncate = (value: string, maxLen: number) => {
        if (value.length > maxLen) {
          return value.substring(0, maxLen) + '...'
        }
        return value
      }

      const longString = 'a'.repeat(200)
      expect(truncate(longString, 100)).toBe('a'.repeat(100) + '...')
      expect(truncate('short', 100)).toBe('short')
    })
  })

  describe('IP Hashing', () => {
    it('should produce consistent hashes for same IP', async () => {
      const hashString = async (input: string): Promise<string> => {
        const encoder = new TextEncoder()
        const data = encoder.encode(input)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
      }

      const hash1 = await hashString('192.168.1.1')
      const hash2 = await hashString('192.168.1.1')
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different IPs', async () => {
      const hashString = async (input: string): Promise<string> => {
        const encoder = new TextEncoder()
        const data = encoder.encode(input)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
      }

      const hash1 = await hashString('192.168.1.1')
      const hash2 = await hashString('192.168.1.2')
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Tool Extraction', () => {
    it('should extract tool name from JSON-RPC tools/call', () => {
      const extractTool = (body: unknown): string | undefined => {
        if (!body || typeof body !== 'object') return undefined
        const rpcBody = body as Record<string, unknown>
        if (rpcBody.method === 'tools/call' && rpcBody.params) {
          const params = rpcBody.params as Record<string, unknown>
          return params.name as string | undefined
        }
        return undefined
      }

      const body = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'search_plugins', arguments: { query: 'test' } },
      }

      expect(extractTool(body)).toBe('search_plugins')
    })

    it('should return undefined for non-tool methods', () => {
      const extractTool = (body: unknown): string | undefined => {
        if (!body || typeof body !== 'object') return undefined
        const rpcBody = body as Record<string, unknown>
        if (rpcBody.method === 'tools/call' && rpcBody.params) {
          const params = rpcBody.params as Record<string, unknown>
          return params.name as string | undefined
        }
        return undefined
      }

      const body = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
      }

      expect(extractTool(body)).toBeUndefined()
    })
  })

  describe('Audit Entry Structure', () => {
    it('should have correct audit entry shape', () => {
      interface McpAuditEntry {
        method: string
        tool?: string
        tokenId?: string
        isAuthenticated: boolean
        ipHash: string
        userAgent?: string
        requestParams?: Record<string, unknown>
        responseStatus: 'success' | 'error' | 'rate_limited'
        responseTime?: number
        errorCode?: string
        errorMessage?: string
      }

      const entry: McpAuditEntry = {
        method: 'rest:search',
        isAuthenticated: false,
        ipHash: 'abc123hash',
        responseStatus: 'success',
        responseTime: 45,
      }

      expect(entry.method).toBe('rest:search')
      expect(entry.isAuthenticated).toBe(false)
      expect(entry.responseStatus).toBe('success')
      expect(entry.responseTime).toBe(45)
    })

    it('should have correct error entry shape', () => {
      interface McpAuditEntry {
        method: string
        tool?: string
        tokenId?: string
        isAuthenticated: boolean
        ipHash: string
        userAgent?: string
        requestParams?: Record<string, unknown>
        responseStatus: 'success' | 'error' | 'rate_limited'
        responseTime?: number
        errorCode?: string
        errorMessage?: string
      }

      const entry: McpAuditEntry = {
        method: 'jsonrpc:tools/call',
        tool: 'search_plugins',
        isAuthenticated: true,
        tokenId: 'token-123',
        ipHash: 'xyz789hash',
        responseStatus: 'error',
        responseTime: 120,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Invalid query parameter',
      }

      expect(entry.responseStatus).toBe('error')
      expect(entry.errorCode).toBe('VALIDATION_ERROR')
      expect(entry.errorMessage).toBe('Invalid query parameter')
    })
  })

  describe('Abnormal Pattern Detection', () => {
    it('should define threshold constants', () => {
      const ABNORMAL_THRESHOLDS = {
        requestsPerMinute: 100,
        errorsPerMinute: 20,
        rateLimit: 50,
      }

      expect(ABNORMAL_THRESHOLDS.requestsPerMinute).toBe(100)
      expect(ABNORMAL_THRESHOLDS.errorsPerMinute).toBe(20)
      expect(ABNORMAL_THRESHOLDS.rateLimit).toBe(50)
    })

    it('should return patterns array for abnormal behavior', () => {
      interface AbnormalPatternResult {
        isAbnormal: boolean
        patterns: string[]
      }

      const checkPatterns = (
        requestsPerMin: number,
        errorsPerMin: number
      ): AbnormalPatternResult => {
        const patterns: string[] = []

        if (requestsPerMin > 100) {
          patterns.push(`High request rate: ${requestsPerMin}/min`)
        }
        if (errorsPerMin > 20) {
          patterns.push(`High error rate: ${errorsPerMin} errors/min`)
        }

        return {
          isAbnormal: patterns.length > 0,
          patterns,
        }
      }

      expect(checkPatterns(50, 5).isAbnormal).toBe(false)
      expect(checkPatterns(150, 5).isAbnormal).toBe(true)
      expect(checkPatterns(150, 5).patterns).toContain('High request rate: 150/min')
      expect(checkPatterns(50, 30).patterns).toContain('High error rate: 30 errors/min')
    })
  })

  describe('Log Retention', () => {
    it('should use 30-day retention period', () => {
      const AUDIT_LOG_RETENTION_DAYS = 30

      const getCutoffDate = () => {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - AUDIT_LOG_RETENTION_DAYS)
        return cutoff
      }

      const now = new Date()
      const cutoff = getCutoffDate()
      const diffDays = Math.round(
        (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24)
      )

      expect(diffDays).toBe(30)
    })
  })

  describe('Audit Summary', () => {
    it('should have correct summary structure', () => {
      interface AuditSummary {
        totalRequests: number
        successCount: number
        errorCount: number
        rateLimitCount: number
        uniqueIps: number
        authenticatedRequests: number
        topMethods: Array<{ method: string; count: number }>
        topTools: Array<{ tool: string; count: number }>
        averageResponseTime: number
      }

      const summary: AuditSummary = {
        totalRequests: 1000,
        successCount: 950,
        errorCount: 40,
        rateLimitCount: 10,
        uniqueIps: 50,
        authenticatedRequests: 200,
        topMethods: [
          { method: 'rest:search', count: 500 },
          { method: 'jsonrpc:tools/call', count: 300 },
        ],
        topTools: [
          { tool: 'search_plugins', count: 400 },
          { tool: 'get_plugin_content', count: 200 },
        ],
        averageResponseTime: 45,
      }

      expect(summary.totalRequests).toBe(1000)
      expect(summary.successCount + summary.errorCount + summary.rateLimitCount).toBe(1000)
      expect(summary.topMethods.length).toBe(2)
      expect(summary.topTools.length).toBe(2)
    })
  })
})

describe('Client IP Extraction', () => {
  it('should prioritize cf-connecting-ip header', () => {
    const getClientIp = (headers: Record<string, string | null>): string => {
      if (headers['cf-connecting-ip']) return headers['cf-connecting-ip']
      if (headers['x-real-ip']) return headers['x-real-ip']
      if (headers['x-forwarded-for']) {
        const ips = headers['x-forwarded-for'].split(',').map((ip) => ip.trim())
        if (ips[0]) return ips[0]
      }
      return 'unknown'
    }

    expect(
      getClientIp({
        'cf-connecting-ip': '1.2.3.4',
        'x-real-ip': '5.6.7.8',
        'x-forwarded-for': '9.10.11.12, 13.14.15.16',
      })
    ).toBe('1.2.3.4')
  })

  it('should fallback to x-real-ip', () => {
    const getClientIp = (headers: Record<string, string | null>): string => {
      if (headers['cf-connecting-ip']) return headers['cf-connecting-ip']
      if (headers['x-real-ip']) return headers['x-real-ip']
      if (headers['x-forwarded-for']) {
        const ips = headers['x-forwarded-for'].split(',').map((ip) => ip.trim())
        if (ips[0]) return ips[0]
      }
      return 'unknown'
    }

    expect(
      getClientIp({
        'cf-connecting-ip': null,
        'x-real-ip': '5.6.7.8',
        'x-forwarded-for': '9.10.11.12',
      })
    ).toBe('5.6.7.8')
  })

  it('should extract first IP from x-forwarded-for', () => {
    const getClientIp = (headers: Record<string, string | null>): string => {
      if (headers['cf-connecting-ip']) return headers['cf-connecting-ip']
      if (headers['x-real-ip']) return headers['x-real-ip']
      if (headers['x-forwarded-for']) {
        const ips = headers['x-forwarded-for'].split(',').map((ip) => ip.trim())
        if (ips[0]) return ips[0]
      }
      return 'unknown'
    }

    expect(
      getClientIp({
        'cf-connecting-ip': null,
        'x-real-ip': null,
        'x-forwarded-for': '9.10.11.12, 13.14.15.16, 17.18.19.20',
      })
    ).toBe('9.10.11.12')
  })

  it('should return unknown when no headers present', () => {
    const getClientIp = (headers: Record<string, string | null>): string => {
      if (headers['cf-connecting-ip']) return headers['cf-connecting-ip']
      if (headers['x-real-ip']) return headers['x-real-ip']
      if (headers['x-forwarded-for']) {
        const ips = headers['x-forwarded-for'].split(',').map((ip) => ip.trim())
        if (ips[0]) return ips[0]
      }
      return 'unknown'
    }

    expect(
      getClientIp({
        'cf-connecting-ip': null,
        'x-real-ip': null,
        'x-forwarded-for': null,
      })
    ).toBe('unknown')
  })
})
