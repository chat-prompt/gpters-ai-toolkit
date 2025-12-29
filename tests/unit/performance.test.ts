import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  recordMetric,
  getMetrics,
  getAggregatedMetrics,
  getPerformanceSummary,
  clearMetrics,
  startTimer,
  withTiming,
  formatDuration,
  Timer,
} from '@/lib/utils/performance'

describe('Performance Monitoring', () => {
  beforeEach(() => {
    clearMetrics()
  })

  describe('recordMetric', () => {
    it('should record a metric', () => {
      recordMetric({
        name: 'test-operation',
        type: 'api',
        duration: 100,
        success: true,
      })

      const metrics = getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('test-operation')
      expect(metrics[0].type).toBe('api')
      expect(metrics[0].duration).toBe(100)
      expect(metrics[0].success).toBe(true)
      expect(metrics[0].timestamp).toBeDefined()
    })

    it('should record metadata', () => {
      recordMetric({
        name: 'test-operation',
        type: 'api',
        duration: 100,
        success: true,
        metadata: { route: '/api/test', method: 'GET' },
      })

      const metrics = getMetrics()
      expect(metrics[0].metadata).toEqual({ route: '/api/test', method: 'GET' })
    })
  })

  describe('getMetrics', () => {
    beforeEach(() => {
      recordMetric({ name: 'api-1', type: 'api', duration: 50, success: true })
      recordMetric({ name: 'db-1', type: 'db', duration: 20, success: true })
      recordMetric({ name: 'api-2', type: 'api', duration: 100, success: false })
    })

    it('should return all metrics', () => {
      const metrics = getMetrics()
      expect(metrics).toHaveLength(3)
    })

    it('should filter by type', () => {
      const metrics = getMetrics({ type: 'api' })
      expect(metrics).toHaveLength(2)
      expect(metrics.every((m) => m.type === 'api')).toBe(true)
    })

    it('should filter by name', () => {
      const metrics = getMetrics({ name: 'api-1' })
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('api-1')
    })

    it('should limit results', () => {
      const metrics = getMetrics({ limit: 2 })
      expect(metrics).toHaveLength(2)
    })
  })

  describe('getAggregatedMetrics', () => {
    beforeEach(() => {
      recordMetric({ name: 'api-call', type: 'api', duration: 50, success: true })
      recordMetric({ name: 'api-call', type: 'api', duration: 100, success: true })
      recordMetric({ name: 'api-call', type: 'api', duration: 150, success: false })
      recordMetric({ name: 'db-query', type: 'db', duration: 10, success: true })
    })

    it('should aggregate metrics by name', () => {
      const aggregated = getAggregatedMetrics()
      expect(aggregated).toHaveLength(2)

      const apiMetric = aggregated.find((m) => m.name === 'api-call')
      expect(apiMetric).toBeDefined()
      expect(apiMetric!.count).toBe(3)
      expect(apiMetric!.successCount).toBe(2)
      expect(apiMetric!.failureCount).toBe(1)
    })

    it('should calculate average duration', () => {
      const aggregated = getAggregatedMetrics()
      const apiMetric = aggregated.find((m) => m.name === 'api-call')
      expect(apiMetric!.avgDuration).toBe(100) // (50 + 100 + 150) / 3
    })

    it('should calculate min and max duration', () => {
      const aggregated = getAggregatedMetrics()
      const apiMetric = aggregated.find((m) => m.name === 'api-call')
      expect(apiMetric!.minDuration).toBe(50)
      expect(apiMetric!.maxDuration).toBe(150)
    })

    it('should calculate percentiles', () => {
      const aggregated = getAggregatedMetrics()
      const apiMetric = aggregated.find((m) => m.name === 'api-call')
      expect(apiMetric!.p50Duration).toBeDefined()
      expect(apiMetric!.p95Duration).toBeDefined()
      expect(apiMetric!.p99Duration).toBeDefined()
    })

    it('should filter by type', () => {
      const aggregated = getAggregatedMetrics({ type: 'db' })
      expect(aggregated).toHaveLength(1)
      expect(aggregated[0].name).toBe('db-query')
    })
  })

  describe('getPerformanceSummary', () => {
    beforeEach(() => {
      recordMetric({ name: 'api-1', type: 'api', duration: 50, success: true })
      recordMetric({ name: 'api-2', type: 'api', duration: 100, success: true })
      recordMetric({ name: 'db-1', type: 'db', duration: 20, success: false })
    })

    it('should return total requests', () => {
      const summary = getPerformanceSummary()
      expect(summary.totalRequests).toBe(3)
    })

    it('should calculate success rate', () => {
      const summary = getPerformanceSummary()
      expect(summary.successRate).toBeCloseTo(66.67, 1)
    })

    it('should calculate average response time', () => {
      const summary = getPerformanceSummary()
      expect(summary.avgResponseTime).toBeCloseTo(56.67, 1)
    })

    it('should break down by type', () => {
      const summary = getPerformanceSummary()
      expect(summary.byType.api).toBeDefined()
      expect(summary.byType.api.count).toBe(2)
      expect(summary.byType.db.count).toBe(1)
    })
  })

  describe('Timer', () => {
    it('should measure elapsed time', async () => {
      const timer = startTimer('test', 'api')
      await new Promise((resolve) => setTimeout(resolve, 10))
      const elapsed = timer.elapsed()
      expect(elapsed).toBeGreaterThanOrEqual(10)
    })

    it('should record metric on stop', () => {
      const timer = startTimer('test-timer', 'api', { key: 'value' })
      timer.stop(true)

      const metrics = getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('test-timer')
      expect(metrics[0].success).toBe(true)
      expect(metrics[0].metadata).toEqual({ key: 'value' })
    })

    it('should record failure', () => {
      const timer = startTimer('failed-op', 'api')
      timer.stop(false)

      const metrics = getMetrics()
      expect(metrics[0].success).toBe(false)
    })
  })

  describe('withTiming', () => {
    it('should time successful async function', async () => {
      const result = await withTiming('async-op', 'api', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return 'done'
      })

      expect(result).toBe('done')
      const metrics = getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].success).toBe(true)
    })

    it('should time failed async function', async () => {
      await expect(
        withTiming('async-error', 'api', async () => {
          throw new Error('Test error')
        })
      ).rejects.toThrow('Test error')

      const metrics = getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].success).toBe(false)
    })
  })

  describe('formatDuration', () => {
    it('should format microseconds', () => {
      expect(formatDuration(0.5)).toBe('500µs')
    })

    it('should format milliseconds', () => {
      expect(formatDuration(50)).toBe('50.0ms')
      expect(formatDuration(100.5)).toBe('100.5ms')
    })

    it('should format seconds', () => {
      expect(formatDuration(1500)).toBe('1.50s')
      expect(formatDuration(3000)).toBe('3.00s')
    })
  })

  describe('clearMetrics', () => {
    it('should clear all metrics', () => {
      recordMetric({ name: 'test', type: 'api', duration: 10, success: true })
      expect(getMetrics()).toHaveLength(1)

      clearMetrics()
      expect(getMetrics()).toHaveLength(0)
    })
  })
})
