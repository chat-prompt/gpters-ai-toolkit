/**
 * Agent Execution History Library
 *
 * Tracks agent invocation history with context, I/O summaries,
 * execution time, token usage, and success/failure statistics.
 */

import { logger as log } from './logger'

// Execution status types
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout'

// Execution record
export interface ExecutionRecord {
  id: string
  agentId: string
  agentName: string
  agentType?: string
  status: ExecutionStatus
  startTime: Date
  endTime?: Date
  duration?: number // ms
  context: ExecutionContext
  input: ExecutionInput
  output?: ExecutionOutput
  error?: ExecutionError
  tokenUsage?: TokenUsage
  metadata?: Record<string, unknown>
}

export interface ExecutionContext {
  sessionId?: string
  userId?: string
  parentExecutionId?: string
  chainId?: string
  stepId?: string
  environment?: 'development' | 'staging' | 'production'
  source?: string
  tags?: string[]
}

export interface ExecutionInput {
  raw?: unknown
  summary?: string
  contentType?: string
  size?: number // bytes
  tokenCount?: number
}

export interface ExecutionOutput {
  raw?: unknown
  summary?: string
  contentType?: string
  size?: number // bytes
  tokenCount?: number
}

export interface ExecutionError {
  code?: string
  message: string
  stack?: string
  retryable?: boolean
  details?: Record<string, unknown>
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  model?: string
  estimatedCost?: number
}

// Statistics
export interface ExecutionStatistics {
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  cancelledExecutions: number
  timeoutExecutions: number
  successRate: number
  averageDuration: number
  totalDuration: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  executionsByAgent: Map<string, AgentStats>
  executionsByStatus: Map<ExecutionStatus, number>
  hourlyDistribution: Map<number, number>
}

export interface AgentStats {
  agentId: string
  agentName: string
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  successRate: number
  averageDuration: number
  totalTokens: number
  totalCost: number
}

// Filter options
export interface HistoryFilter {
  agentId?: string
  agentName?: string
  status?: ExecutionStatus | ExecutionStatus[]
  startTimeAfter?: Date
  startTimeBefore?: Date
  sessionId?: string
  userId?: string
  chainId?: string
  minDuration?: number
  maxDuration?: number
  hasError?: boolean
  tags?: string[]
  limit?: number
  offset?: number
}

// Sort options
export interface HistorySort {
  field: 'startTime' | 'endTime' | 'duration' | 'agentName' | 'status'
  order: 'asc' | 'desc'
}

/**
 * Generate unique execution ID
 */
export function generateExecutionId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `exec_${timestamp}_${random}`
}

/**
 * Summarize input/output content
 */
export function summarizeContent(content: unknown, maxLength: number = 200): string {
  if (content === null || content === undefined) return ''

  let str: string
  if (typeof content === 'string') {
    str = content
  } else if (typeof content === 'object') {
    try {
      str = JSON.stringify(content)
    } catch {
      str = '[Complex Object]'
    }
  } else {
    str = String(content)
  }

  if (str.length <= maxLength) return str

  return str.substring(0, maxLength - 3) + '...'
}

/**
 * Calculate content size in bytes
 */
export function calculateSize(content: unknown): number {
  if (content === null || content === undefined) return 0

  if (typeof content === 'string') {
    return new TextEncoder().encode(content).length
  }

  try {
    return new TextEncoder().encode(JSON.stringify(content)).length
  } catch {
    return 0
  }
}

/**
 * Estimate token count (rough approximation)
 */
export function estimateTokenCount(content: unknown): number {
  const size = calculateSize(content)
  // Rough estimate: ~4 characters per token on average
  return Math.ceil(size / 4)
}

/**
 * Apply filter to execution records
 */
export function filterRecords(records: ExecutionRecord[], filter: HistoryFilter): ExecutionRecord[] {
  let result = [...records]

  if (filter.agentId) {
    result = result.filter((r) => r.agentId === filter.agentId)
  }

  if (filter.agentName) {
    result = result.filter((r) =>
      r.agentName.toLowerCase().includes(filter.agentName!.toLowerCase())
    )
  }

  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
    result = result.filter((r) => statuses.includes(r.status))
  }

  if (filter.startTimeAfter) {
    result = result.filter((r) => r.startTime >= filter.startTimeAfter!)
  }

  if (filter.startTimeBefore) {
    result = result.filter((r) => r.startTime <= filter.startTimeBefore!)
  }

  if (filter.sessionId) {
    result = result.filter((r) => r.context.sessionId === filter.sessionId)
  }

  if (filter.userId) {
    result = result.filter((r) => r.context.userId === filter.userId)
  }

  if (filter.chainId) {
    result = result.filter((r) => r.context.chainId === filter.chainId)
  }

  if (filter.minDuration !== undefined) {
    result = result.filter((r) => (r.duration || 0) >= filter.minDuration!)
  }

  if (filter.maxDuration !== undefined) {
    result = result.filter((r) => (r.duration || 0) <= filter.maxDuration!)
  }

  if (filter.hasError !== undefined) {
    result = result.filter((r) => (r.error !== undefined) === filter.hasError)
  }

  if (filter.tags && filter.tags.length > 0) {
    result = result.filter((r) =>
      filter.tags!.every((tag) => r.context.tags?.includes(tag))
    )
  }

  if (filter.offset) {
    result = result.slice(filter.offset)
  }

  if (filter.limit) {
    result = result.slice(0, filter.limit)
  }

  return result
}

/**
 * Sort execution records
 */
export function sortRecords(records: ExecutionRecord[], sort: HistorySort): ExecutionRecord[] {
  const sorted = [...records]

  sorted.sort((a, b) => {
    let comparison = 0

    switch (sort.field) {
      case 'startTime':
        comparison = a.startTime.getTime() - b.startTime.getTime()
        break
      case 'endTime':
        comparison = (a.endTime?.getTime() || 0) - (b.endTime?.getTime() || 0)
        break
      case 'duration':
        comparison = (a.duration || 0) - (b.duration || 0)
        break
      case 'agentName':
        comparison = a.agentName.localeCompare(b.agentName)
        break
      case 'status':
        comparison = a.status.localeCompare(b.status)
        break
    }

    return sort.order === 'desc' ? -comparison : comparison
  })

  return sorted
}

/**
 * Calculate statistics from execution records
 */
export function calculateStatistics(records: ExecutionRecord[]): ExecutionStatistics {
  const stats: ExecutionStatistics = {
    totalExecutions: records.length,
    successfulExecutions: 0,
    failedExecutions: 0,
    cancelledExecutions: 0,
    timeoutExecutions: 0,
    successRate: 0,
    averageDuration: 0,
    totalDuration: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    executionsByAgent: new Map(),
    executionsByStatus: new Map(),
    hourlyDistribution: new Map(),
  }

  if (records.length === 0) return stats

  for (const record of records) {
    // Status counts
    const statusCount = stats.executionsByStatus.get(record.status) || 0
    stats.executionsByStatus.set(record.status, statusCount + 1)

    switch (record.status) {
      case 'completed':
        stats.successfulExecutions++
        break
      case 'failed':
        stats.failedExecutions++
        break
      case 'cancelled':
        stats.cancelledExecutions++
        break
      case 'timeout':
        stats.timeoutExecutions++
        break
    }

    // Duration
    if (record.duration) {
      stats.totalDuration += record.duration
    }

    // Token usage
    if (record.tokenUsage) {
      stats.totalInputTokens += record.tokenUsage.inputTokens
      stats.totalOutputTokens += record.tokenUsage.outputTokens
      if (record.tokenUsage.estimatedCost) {
        stats.totalCost += record.tokenUsage.estimatedCost
      }
    }

    // Agent stats
    if (!stats.executionsByAgent.has(record.agentId)) {
      stats.executionsByAgent.set(record.agentId, {
        agentId: record.agentId,
        agentName: record.agentName,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
        averageDuration: 0,
        totalTokens: 0,
        totalCost: 0,
      })
    }

    const agentStats = stats.executionsByAgent.get(record.agentId)!
    agentStats.totalExecutions++
    if (record.status === 'completed') agentStats.successfulExecutions++
    if (record.status === 'failed') agentStats.failedExecutions++
    if (record.tokenUsage) {
      agentStats.totalTokens += record.tokenUsage.totalTokens
      if (record.tokenUsage.estimatedCost) {
        agentStats.totalCost += record.tokenUsage.estimatedCost
      }
    }

    // Hourly distribution
    const hour = record.startTime.getHours()
    stats.hourlyDistribution.set(hour, (stats.hourlyDistribution.get(hour) || 0) + 1)
  }

  // Calculate rates and averages
  stats.successRate = (stats.successfulExecutions / stats.totalExecutions) * 100
  stats.averageDuration = stats.totalDuration / stats.totalExecutions

  // Calculate agent averages
  for (const agentStats of stats.executionsByAgent.values()) {
    agentStats.successRate = (agentStats.successfulExecutions / agentStats.totalExecutions) * 100
  }

  return stats
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
}

/**
 * Execution History Manager
 */
export class ExecutionHistoryManager {
  private records: ExecutionRecord[] = []
  private maxRecords: number
  private onRecordAdded?: (record: ExecutionRecord) => void
  private onRecordUpdated?: (record: ExecutionRecord) => void

  constructor(options: {
    maxRecords?: number
    onRecordAdded?: (record: ExecutionRecord) => void
    onRecordUpdated?: (record: ExecutionRecord) => void
  } = {}) {
    this.maxRecords = options.maxRecords || 10000
    this.onRecordAdded = options.onRecordAdded
    this.onRecordUpdated = options.onRecordUpdated

    log.info('ExecutionHistoryManager initialized', { maxRecords: this.maxRecords })
  }

  /**
   * Start tracking an execution
   */
  startExecution(
    agentId: string,
    agentName: string,
    options: {
      agentType?: string
      context?: Partial<ExecutionContext>
      input?: unknown
      metadata?: Record<string, unknown>
    } = {}
  ): string {
    const id = generateExecutionId()
    const now = new Date()

    const record: ExecutionRecord = {
      id,
      agentId,
      agentName,
      agentType: options.agentType,
      status: 'running',
      startTime: now,
      context: {
        ...options.context,
      },
      input: {
        raw: options.input,
        summary: summarizeContent(options.input),
        size: calculateSize(options.input),
        tokenCount: estimateTokenCount(options.input),
      },
      metadata: options.metadata,
    }

    this.addRecord(record)

    log.debug('Execution started', { id, agentId, agentName })
    return id
  }

  /**
   * Complete an execution
   */
  completeExecution(
    executionId: string,
    output: unknown,
    tokenUsage?: TokenUsage
  ): ExecutionRecord | null {
    const record = this.getRecord(executionId)
    if (!record) {
      log.warn('Execution not found', { executionId })
      return null
    }

    const now = new Date()
    record.status = 'completed'
    record.endTime = now
    record.duration = now.getTime() - record.startTime.getTime()
    record.output = {
      raw: output,
      summary: summarizeContent(output),
      size: calculateSize(output),
      tokenCount: estimateTokenCount(output),
    }
    record.tokenUsage = tokenUsage

    this.onRecordUpdated?.(record)

    log.debug('Execution completed', {
      id: executionId,
      duration: record.duration,
      status: 'completed',
    })

    return record
  }

  /**
   * Fail an execution
   */
  failExecution(
    executionId: string,
    error: string | Error | ExecutionError,
    tokenUsage?: TokenUsage
  ): ExecutionRecord | null {
    const record = this.getRecord(executionId)
    if (!record) {
      log.warn('Execution not found', { executionId })
      return null
    }

    const now = new Date()
    record.status = 'failed'
    record.endTime = now
    record.duration = now.getTime() - record.startTime.getTime()
    record.tokenUsage = tokenUsage

    if (typeof error === 'string') {
      record.error = { message: error }
    } else if (error instanceof Error) {
      record.error = {
        message: error.message,
        stack: error.stack,
      }
    } else {
      record.error = error
    }

    this.onRecordUpdated?.(record)

    log.debug('Execution failed', {
      id: executionId,
      error: record.error.message,
      duration: record.duration,
    })

    return record
  }

  /**
   * Cancel an execution
   */
  cancelExecution(executionId: string, reason?: string): ExecutionRecord | null {
    const record = this.getRecord(executionId)
    if (!record) return null

    const now = new Date()
    record.status = 'cancelled'
    record.endTime = now
    record.duration = now.getTime() - record.startTime.getTime()
    if (reason) {
      record.error = { message: reason, code: 'CANCELLED' }
    }

    this.onRecordUpdated?.(record)

    log.debug('Execution cancelled', { id: executionId, reason })
    return record
  }

  /**
   * Mark execution as timeout
   */
  timeoutExecution(executionId: string): ExecutionRecord | null {
    const record = this.getRecord(executionId)
    if (!record) return null

    const now = new Date()
    record.status = 'timeout'
    record.endTime = now
    record.duration = now.getTime() - record.startTime.getTime()
    record.error = { message: 'Execution timed out', code: 'TIMEOUT' }

    this.onRecordUpdated?.(record)

    log.debug('Execution timed out', { id: executionId, duration: record.duration })
    return record
  }

  /**
   * Add a record
   */
  private addRecord(record: ExecutionRecord): void {
    this.records.push(record)

    // Trim if over max
    if (this.records.length > this.maxRecords) {
      const removed = this.records.shift()
      log.debug('Removed old execution record', { id: removed?.id })
    }

    this.onRecordAdded?.(record)
  }

  /**
   * Get a record by ID
   */
  getRecord(executionId: string): ExecutionRecord | undefined {
    return this.records.find((r) => r.id === executionId)
  }

  /**
   * Get all records
   */
  getAllRecords(): ExecutionRecord[] {
    return [...this.records]
  }

  /**
   * Query records with filter and sort
   */
  query(filter?: HistoryFilter, sort?: HistorySort): ExecutionRecord[] {
    let result = this.getAllRecords()

    if (filter) {
      result = filterRecords(result, filter)
    }

    if (sort) {
      result = sortRecords(result, sort)
    }

    return result
  }

  /**
   * Get recent executions
   */
  getRecent(count: number = 10): ExecutionRecord[] {
    return this.records.slice(-count).reverse()
  }

  /**
   * Get executions for an agent
   */
  getByAgent(agentId: string): ExecutionRecord[] {
    return this.records.filter((r) => r.agentId === agentId)
  }

  /**
   * Get executions for a session
   */
  getBySession(sessionId: string): ExecutionRecord[] {
    return this.records.filter((r) => r.context.sessionId === sessionId)
  }

  /**
   * Get executions for a chain
   */
  getByChain(chainId: string): ExecutionRecord[] {
    return this.records
      .filter((r) => r.context.chainId === chainId)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  }

  /**
   * Get failed executions
   */
  getFailed(): ExecutionRecord[] {
    return this.records.filter((r) => r.status === 'failed')
  }

  /**
   * Get statistics
   */
  getStatistics(filter?: HistoryFilter): ExecutionStatistics {
    const records = filter ? filterRecords(this.records, filter) : this.records
    return calculateStatistics(records)
  }

  /**
   * Get statistics for a time range
   */
  getStatisticsForRange(start: Date, end: Date): ExecutionStatistics {
    return this.getStatistics({
      startTimeAfter: start,
      startTimeBefore: end,
    })
  }

  /**
   * Get count
   */
  getCount(): number {
    return this.records.length
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = []
    log.info('Execution history cleared')
  }

  /**
   * Clear old records
   */
  clearOlderThan(date: Date): number {
    const originalCount = this.records.length
    this.records = this.records.filter((r) => r.startTime >= date)
    const removed = originalCount - this.records.length
    log.info('Cleared old execution records', { removed, cutoffDate: date })
    return removed
  }

  /**
   * Export to JSON
   */
  exportToJson(filter?: HistoryFilter): string {
    const records = filter ? filterRecords(this.records, filter) : this.records
    const stats = calculateStatistics(records)

    return JSON.stringify(
      {
        records,
        statistics: {
          totalExecutions: stats.totalExecutions,
          successfulExecutions: stats.successfulExecutions,
          failedExecutions: stats.failedExecutions,
          successRate: stats.successRate,
          averageDuration: stats.averageDuration,
          totalInputTokens: stats.totalInputTokens,
          totalOutputTokens: stats.totalOutputTokens,
          totalCost: stats.totalCost,
        },
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    )
  }

  /**
   * Import from JSON
   */
  importFromJson(json: string): number {
    try {
      const data = JSON.parse(json)
      if (!Array.isArray(data.records)) {
        throw new Error('Invalid format: records array not found')
      }

      let imported = 0
      for (const record of data.records) {
        // Restore dates
        record.startTime = new Date(record.startTime)
        if (record.endTime) record.endTime = new Date(record.endTime)

        this.records.push(record as ExecutionRecord)
        imported++
      }

      log.info('Imported execution records', { imported })
      return imported
    } catch (error) {
      log.error('Failed to import execution records', { error })
      throw error
    }
  }
}

/**
 * Create a simple execution tracker for one-off tracking
 */
export function createExecutionTracker(
  manager: ExecutionHistoryManager,
  agentId: string,
  agentName: string,
  options?: {
    agentType?: string
    context?: Partial<ExecutionContext>
    input?: unknown
  }
): {
  executionId: string
  complete: (output: unknown, tokenUsage?: TokenUsage) => ExecutionRecord | null
  fail: (error: string | Error | ExecutionError, tokenUsage?: TokenUsage) => ExecutionRecord | null
  cancel: (reason?: string) => ExecutionRecord | null
  timeout: () => ExecutionRecord | null
} {
  const executionId = manager.startExecution(agentId, agentName, options)

  return {
    executionId,
    complete: (output, tokenUsage) => manager.completeExecution(executionId, output, tokenUsage),
    fail: (error, tokenUsage) => manager.failExecution(executionId, error, tokenUsage),
    cancel: (reason) => manager.cancelExecution(executionId, reason),
    timeout: () => manager.timeoutExecution(executionId),
  }
}
