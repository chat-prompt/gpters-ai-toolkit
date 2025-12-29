/**
 * MCP Audit Logging System
 *
 * Provides comprehensive audit logging for MCP API requests:
 * - All request/response logging with timing
 * - IP address hashing for privacy
 * - Sensitive data masking
 * - Abnormal pattern detection
 * - 30-day retention policy
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { mcpAuditLogs } from '@/lib/db/schema'
import { lt, count, eq, and, gte, sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'
import type { McpAuthResult } from './mcp-auth'

const log = createLogger('mcp-audit')

// Retention period in days
const AUDIT_LOG_RETENTION_DAYS = 30

// Rate thresholds for abnormal pattern detection
const ABNORMAL_THRESHOLDS = {
  requestsPerMinute: 100, // Per IP
  errorsPerMinute: 20,    // Per IP
  rateLimit: 50,          // Rate limit hits per IP per hour
}

// Sensitive keys to mask in request params
const SENSITIVE_KEYS = [
  'token',
  'password',
  'secret',
  'key',
  'authorization',
  'credential',
  'apikey',
  'api_key',
]

/**
 * Response status type
 */
export type AuditResponseStatus = 'success' | 'error' | 'rate_limited'

/**
 * Audit log entry for MCP requests
 */
export interface McpAuditEntry {
  method: string              // JSON-RPC method or REST action
  tool?: string               // Tool name if applicable
  tokenId?: string            // Token ID if authenticated
  isAuthenticated: boolean
  ipHash: string              // Hashed IP address
  userAgent?: string
  requestParams?: Record<string, unknown>
  responseStatus: AuditResponseStatus
  responseTime?: number       // Milliseconds
  errorCode?: string
  errorMessage?: string
}

/**
 * Hash a string using SHA-256 (for IP anonymization)
 */
async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Extract client IP from request
 * Handles proxies and Cloudflare headers
 */
function getClientIp(request: NextRequest): string {
  // Check common proxy headers
  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  if (cfConnectingIp) return cfConnectingIp

  const xRealIp = request.headers.get('x-real-ip')
  if (xRealIp) return xRealIp

  const xForwardedFor = request.headers.get('x-forwarded-for')
  if (xForwardedFor) {
    // Get the first IP in the chain (original client)
    const ips = xForwardedFor.split(',').map((ip) => ip.trim())
    if (ips[0]) return ips[0]
  }

  // Fallback - likely localhost in development
  return 'unknown'
}

/**
 * Mask sensitive data in request parameters
 */
function maskSensitiveData(
  params: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!params) return undefined

  const masked: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(params)) {
    const lowerKey = key.toLowerCase()

    // Check if key contains sensitive keywords
    const isSensitive = SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk))

    if (isSensitive) {
      masked[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      // Recursively mask nested objects
      masked[key] = maskSensitiveData(value as Record<string, unknown>)
    } else if (typeof value === 'string' && value.length > 200) {
      // Truncate long strings
      masked[key] = value.substring(0, 200) + '...[truncated]'
    } else {
      masked[key] = value
    }
  }

  return masked
}

/**
 * Extract tool name from JSON-RPC request
 */
function extractToolName(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined

  const rpcBody = body as Record<string, unknown>

  // Check for tools/call method
  if (rpcBody.method === 'tools/call' && rpcBody.params) {
    const params = rpcBody.params as Record<string, unknown>
    return params.name as string | undefined
  }

  return undefined
}

/**
 * Create audit context from request
 */
export async function createAuditContext(
  request: NextRequest,
  auth?: McpAuthResult
): Promise<{
  ipHash: string
  userAgent?: string
  isAuthenticated: boolean
  tokenId?: string
}> {
  const clientIp = getClientIp(request)
  const ipHash = await hashString(clientIp)
  const userAgent = request.headers.get('user-agent') || undefined

  return {
    ipHash,
    userAgent,
    isAuthenticated: !!auth?.authenticated,
    tokenId: auth?.tokenId,
  }
}

/**
 * Log MCP API request
 */
export async function logMcpRequest(entry: McpAuditEntry): Promise<void> {
  try {
    await db.insert(mcpAuditLogs).values({
      method: entry.method,
      tool: entry.tool,
      tokenId: entry.tokenId,
      isAuthenticated: entry.isAuthenticated,
      ipHash: entry.ipHash,
      userAgent: entry.userAgent,
      requestParams: entry.requestParams,
      responseStatus: entry.responseStatus,
      responseTime: entry.responseTime,
      errorCode: entry.errorCode,
      errorMessage: entry.errorMessage,
    })

    log.debug('Audit log recorded', {
      method: entry.method,
      tool: entry.tool,
      status: entry.responseStatus,
      time: entry.responseTime,
    })
  } catch (error) {
    // Don't let audit logging failures break the request
    log.error('Failed to write audit log', error)
  }
}

/**
 * Helper to audit a complete MCP request cycle
 */
export async function withMcpAudit<T>(
  request: NextRequest,
  auth: McpAuthResult | undefined,
  body: unknown,
  action: string,
  handler: () => Promise<{ result: T; success: boolean; error?: { code?: string; message?: string } }>
): Promise<T> {
  const startTime = Date.now()
  const context = await createAuditContext(request, auth)

  const tool = extractToolName(body)
  const maskedParams = maskSensitiveData(
    body && typeof body === 'object' ? (body as Record<string, unknown>) : undefined
  )

  try {
    const { result, success, error } = await handler()
    const responseTime = Date.now() - startTime

    await logMcpRequest({
      method: action,
      tool,
      ...context,
      requestParams: maskedParams,
      responseStatus: success ? 'success' : 'error',
      responseTime,
      errorCode: error?.code,
      errorMessage: error?.message,
    })

    return result
  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    await logMcpRequest({
      method: action,
      tool,
      ...context,
      requestParams: maskedParams,
      responseStatus: 'error',
      responseTime,
      errorCode: 'INTERNAL_ERROR',
      errorMessage,
    })

    throw error
  }
}

/**
 * Log rate limit event
 */
export async function logRateLimitEvent(
  request: NextRequest,
  auth?: McpAuthResult
): Promise<void> {
  const context = await createAuditContext(request, auth)

  await logMcpRequest({
    method: 'rate_limit',
    ...context,
    requestParams: undefined,
    responseStatus: 'rate_limited',
  })
}

// ============================================
// Abnormal Pattern Detection
// ============================================

interface AbnormalPatternResult {
  isAbnormal: boolean
  patterns: string[]
}

/**
 * Check for abnormal request patterns from an IP
 * Used for alerting and potential blocking
 */
export async function detectAbnormalPatterns(
  ipHash: string
): Promise<AbnormalPatternResult> {
  const patterns: string[] = []
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  try {
    // Check request rate per minute
    const [requestsResult] = await db
      .select({ count: count() })
      .from(mcpAuditLogs)
      .where(
        and(
          eq(mcpAuditLogs.ipHash, ipHash),
          gte(mcpAuditLogs.createdAt, oneMinuteAgo)
        )
      )

    if ((requestsResult?.count || 0) > ABNORMAL_THRESHOLDS.requestsPerMinute) {
      patterns.push(`High request rate: ${requestsResult?.count}/min`)
    }

    // Check error rate per minute
    const [errorsResult] = await db
      .select({ count: count() })
      .from(mcpAuditLogs)
      .where(
        and(
          eq(mcpAuditLogs.ipHash, ipHash),
          eq(mcpAuditLogs.responseStatus, 'error'),
          gte(mcpAuditLogs.createdAt, oneMinuteAgo)
        )
      )

    if ((errorsResult?.count || 0) > ABNORMAL_THRESHOLDS.errorsPerMinute) {
      patterns.push(`High error rate: ${errorsResult?.count} errors/min`)
    }

    // Check rate limit hits per hour
    const [rateLimitResult] = await db
      .select({ count: count() })
      .from(mcpAuditLogs)
      .where(
        and(
          eq(mcpAuditLogs.ipHash, ipHash),
          eq(mcpAuditLogs.responseStatus, 'rate_limited'),
          gte(mcpAuditLogs.createdAt, oneHourAgo)
        )
      )

    if ((rateLimitResult?.count || 0) > ABNORMAL_THRESHOLDS.rateLimit) {
      patterns.push(`High rate limit hits: ${rateLimitResult?.count}/hour`)
    }

    if (patterns.length > 0) {
      log.warn('Abnormal pattern detected', { ipHash: ipHash.substring(0, 8) + '...', patterns })
    }

    return {
      isAbnormal: patterns.length > 0,
      patterns,
    }
  } catch (error) {
    log.error('Failed to detect abnormal patterns', error)
    return { isAbnormal: false, patterns: [] }
  }
}

// ============================================
// Log Retention / Cleanup
// ============================================

/**
 * Clean up audit logs older than retention period
 * Should be run periodically (e.g., daily via cron)
 */
export async function cleanupOldAuditLogs(): Promise<{ deleted: number }> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - AUDIT_LOG_RETENTION_DAYS)

  try {
    await db
      .delete(mcpAuditLogs)
      .where(lt(mcpAuditLogs.createdAt, cutoffDate))

    // Drizzle doesn't return count directly
    log.info('Audit log cleanup completed', {
      cutoffDate: cutoffDate.toISOString(),
    })

    return { deleted: 0 } // Would need to query count before/after for accurate count
  } catch (error) {
    log.error('Failed to cleanup audit logs', error)
    throw error
  }
}

// ============================================
// Analytics / Reporting
// ============================================

export interface AuditSummary {
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

/**
 * Get audit summary for a time period
 */
export async function getAuditSummary(
  startDate: Date,
  endDate: Date = new Date()
): Promise<AuditSummary> {
  // Get total counts by status
  const statusCounts = await db
    .select({
      status: mcpAuditLogs.responseStatus,
      count: count(),
    })
    .from(mcpAuditLogs)
    .where(
      and(
        gte(mcpAuditLogs.createdAt, startDate),
        lt(mcpAuditLogs.createdAt, endDate)
      )
    )
    .groupBy(mcpAuditLogs.responseStatus)

  const statusMap: Record<string, number> = {}
  statusCounts.forEach((s) => {
    statusMap[s.status] = s.count
  })

  // Get unique IPs count
  const [uniqueIpsResult] = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${mcpAuditLogs.ipHash})`,
    })
    .from(mcpAuditLogs)
    .where(
      and(
        gte(mcpAuditLogs.createdAt, startDate),
        lt(mcpAuditLogs.createdAt, endDate)
      )
    )

  // Get authenticated requests count
  const [authResult] = await db
    .select({ count: count() })
    .from(mcpAuditLogs)
    .where(
      and(
        eq(mcpAuditLogs.isAuthenticated, true),
        gte(mcpAuditLogs.createdAt, startDate),
        lt(mcpAuditLogs.createdAt, endDate)
      )
    )

  // Get top methods
  const topMethods = await db
    .select({
      method: mcpAuditLogs.method,
      count: count(),
    })
    .from(mcpAuditLogs)
    .where(
      and(
        gte(mcpAuditLogs.createdAt, startDate),
        lt(mcpAuditLogs.createdAt, endDate)
      )
    )
    .groupBy(mcpAuditLogs.method)
    .orderBy(sql`count(*) DESC`)
    .limit(10)

  // Get top tools
  const topTools = await db
    .select({
      tool: mcpAuditLogs.tool,
      count: count(),
    })
    .from(mcpAuditLogs)
    .where(
      and(
        gte(mcpAuditLogs.createdAt, startDate),
        lt(mcpAuditLogs.createdAt, endDate),
        sql`${mcpAuditLogs.tool} IS NOT NULL`
      )
    )
    .groupBy(mcpAuditLogs.tool)
    .orderBy(sql`count(*) DESC`)
    .limit(10)

  // Get average response time
  const [avgTimeResult] = await db
    .select({
      avg: sql<number>`AVG(${mcpAuditLogs.responseTime})`,
    })
    .from(mcpAuditLogs)
    .where(
      and(
        gte(mcpAuditLogs.createdAt, startDate),
        lt(mcpAuditLogs.createdAt, endDate),
        sql`${mcpAuditLogs.responseTime} IS NOT NULL`
      )
    )

  const totalRequests =
    (statusMap['success'] || 0) +
    (statusMap['error'] || 0) +
    (statusMap['rate_limited'] || 0)

  return {
    totalRequests,
    successCount: statusMap['success'] || 0,
    errorCount: statusMap['error'] || 0,
    rateLimitCount: statusMap['rate_limited'] || 0,
    uniqueIps: uniqueIpsResult?.count || 0,
    authenticatedRequests: authResult?.count || 0,
    topMethods: topMethods.map((m) => ({ method: m.method, count: m.count })),
    topTools: topTools
      .filter((t) => t.tool !== null)
      .map((t) => ({ tool: t.tool as string, count: t.count })),
    averageResponseTime: Math.round(avgTimeResult?.avg || 0),
  }
}
