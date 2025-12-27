/**
 * Performance Monitoring System
 *
 * Collects and aggregates performance metrics for API routes,
 * hooks, and system operations.
 */

export interface PerformanceMetric {
  name: string
  type: 'api' | 'hook' | 'db' | 'external' | 'system'
  duration: number // milliseconds
  timestamp: number
  success: boolean
  metadata?: Record<string, unknown>
}

export interface AggregatedMetrics {
  name: string
  type: string
  count: number
  successCount: number
  failureCount: number
  avgDuration: number
  minDuration: number
  maxDuration: number
  p50Duration: number
  p95Duration: number
  p99Duration: number
  lastUpdated: number
}

// In-memory metrics storage (for development/simple deployments)
// In production, consider using Redis or a time-series database
class MetricsStore {
  private metrics: PerformanceMetric[] = []
  private maxSize = 10000 // Keep last 10k metrics
  private aggregationCache: Map<string, AggregatedMetrics> = new Map()
  private cacheExpiry = 5000 // 5 seconds cache

  record(metric: PerformanceMetric): void {
    this.metrics.push(metric)

    // Trim old metrics
    if (this.metrics.length > this.maxSize) {
      this.metrics = this.metrics.slice(-this.maxSize)
    }

    // Invalidate aggregation cache for this metric type
    this.aggregationCache.delete(`${metric.type}:${metric.name}`)
    this.aggregationCache.delete(`all:${metric.name}`)
  }

  getMetrics(filter?: {
    type?: string
    name?: string
    since?: number
    limit?: number
  }): PerformanceMetric[] {
    let result = this.metrics

    if (filter?.type) {
      result = result.filter((m) => m.type === filter.type)
    }
    if (filter?.name) {
      result = result.filter((m) => m.name === filter.name)
    }
    if (filter?.since !== undefined) {
      const since = filter.since
      result = result.filter((m) => m.timestamp >= since)
    }
    if (filter?.limit !== undefined) {
      result = result.slice(-filter.limit)
    }

    return result
  }

  getAggregated(filter?: { type?: string; name?: string; since?: number }): AggregatedMetrics[] {
    const metrics = this.getMetrics(filter)
    const groups = new Map<string, PerformanceMetric[]>()

    // Group by name
    for (const metric of metrics) {
      const key = metric.name
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(metric)
    }

    // Calculate aggregations
    const result: AggregatedMetrics[] = []
    for (const [name, group] of groups) {
      if (group.length === 0) continue

      const durations = group.map((m) => m.duration).sort((a, b) => a - b)
      const successCount = group.filter((m) => m.success).length

      result.push({
        name,
        type: group[0].type,
        count: group.length,
        successCount,
        failureCount: group.length - successCount,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: durations[0],
        maxDuration: durations[durations.length - 1],
        p50Duration: this.percentile(durations, 50),
        p95Duration: this.percentile(durations, 95),
        p99Duration: this.percentile(durations, 99),
        lastUpdated: Math.max(...group.map((m) => m.timestamp)),
      })
    }

    return result.sort((a, b) => b.count - a.count)
  }

  private percentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) return 0
    const index = Math.ceil((p / 100) * sortedArr.length) - 1
    return sortedArr[Math.max(0, index)]
  }

  getSummary(): {
    totalRequests: number
    successRate: number
    avgResponseTime: number
    byType: Record<string, { count: number; avgDuration: number }>
  } {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    const recentMetrics = this.getMetrics({ since: oneHourAgo })

    if (recentMetrics.length === 0) {
      return {
        totalRequests: 0,
        successRate: 0,
        avgResponseTime: 0,
        byType: {},
      }
    }

    const successCount = recentMetrics.filter((m) => m.success).length
    const totalDuration = recentMetrics.reduce((a, b) => a + b.duration, 0)

    const byType: Record<string, { count: number; avgDuration: number }> = {}
    const typeGroups = new Map<string, PerformanceMetric[]>()

    for (const metric of recentMetrics) {
      if (!typeGroups.has(metric.type)) {
        typeGroups.set(metric.type, [])
      }
      typeGroups.get(metric.type)!.push(metric)
    }

    for (const [type, group] of typeGroups) {
      byType[type] = {
        count: group.length,
        avgDuration: group.reduce((a, b) => a + b.duration, 0) / group.length,
      }
    }

    return {
      totalRequests: recentMetrics.length,
      successRate: (successCount / recentMetrics.length) * 100,
      avgResponseTime: totalDuration / recentMetrics.length,
      byType,
    }
  }

  clear(): void {
    this.metrics = []
    this.aggregationCache.clear()
  }
}

// Singleton instance
const metricsStore = new MetricsStore()

/**
 * Record a performance metric
 */
export function recordMetric(metric: Omit<PerformanceMetric, 'timestamp'>): void {
  metricsStore.record({
    ...metric,
    timestamp: Date.now(),
  })
}

/**
 * High-resolution timer for measuring operations
 */
export class Timer {
  private startTime: number
  private name: string
  private type: PerformanceMetric['type']
  private metadata?: Record<string, unknown>

  constructor(name: string, type: PerformanceMetric['type'], metadata?: Record<string, unknown>) {
    this.startTime = performance.now()
    this.name = name
    this.type = type
    this.metadata = metadata
  }

  stop(success = true): number {
    const duration = performance.now() - this.startTime
    recordMetric({
      name: this.name,
      type: this.type,
      duration,
      success,
      metadata: this.metadata,
    })
    return duration
  }

  elapsed(): number {
    return performance.now() - this.startTime
  }
}

/**
 * Start a timer for an operation
 */
export function startTimer(
  name: string,
  type: PerformanceMetric['type'],
  metadata?: Record<string, unknown>
): Timer {
  return new Timer(name, type, metadata)
}

/**
 * Decorator/wrapper for timing async functions
 */
export function withTiming<T>(
  name: string,
  type: PerformanceMetric['type'],
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const timer = startTimer(name, type, metadata)
  return fn()
    .then((result) => {
      timer.stop(true)
      return result
    })
    .catch((error) => {
      timer.stop(false)
      throw error
    })
}

/**
 * Get performance metrics
 */
export function getMetrics(filter?: {
  type?: string
  name?: string
  since?: number
  limit?: number
}): PerformanceMetric[] {
  return metricsStore.getMetrics(filter)
}

/**
 * Get aggregated metrics
 */
export function getAggregatedMetrics(filter?: {
  type?: string
  name?: string
  since?: number
}): AggregatedMetrics[] {
  return metricsStore.getAggregated(filter)
}

/**
 * Get performance summary
 */
export function getPerformanceSummary() {
  return metricsStore.getSummary()
}

/**
 * Clear all metrics (useful for testing)
 */
export function clearMetrics(): void {
  metricsStore.clear()
}

/**
 * Middleware helper for API routes
 */
export function createApiTimer(route: string, method: string): Timer {
  return startTimer(`${method} ${route}`, 'api', { route, method })
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}
