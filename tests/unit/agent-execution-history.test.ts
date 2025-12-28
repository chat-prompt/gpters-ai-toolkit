import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import {
  generateExecutionId,
  summarizeContent,
  calculateSize,
  estimateTokenCount,
  filterRecords,
  sortRecords,
  calculateStatistics,
  formatDuration,
  ExecutionHistoryManager,
  createExecutionTracker,
  type ExecutionRecord,
  type HistoryFilter,
  type HistorySort,
} from '@/lib/agent-execution-history'

describe('Agent Execution History', () => {
  describe('generateExecutionId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateExecutionId())
      }
      expect(ids.size).toBe(100)
    })

    it('should have correct format', () => {
      const id = generateExecutionId()
      expect(id).toMatch(/^exec_[a-z0-9]+_[a-z0-9]+$/)
    })
  })

  describe('summarizeContent', () => {
    it('should summarize string content', () => {
      const short = 'Short text'
      expect(summarizeContent(short)).toBe(short)

      const long = 'A'.repeat(300)
      const summary = summarizeContent(long, 100)
      expect(summary.length).toBe(100)
      expect(summary.endsWith('...')).toBe(true)
    })

    it('should summarize object content', () => {
      const obj = { key: 'value', nested: { data: 123 } }
      const summary = summarizeContent(obj)
      expect(summary).toContain('key')
      expect(summary).toContain('value')
    })

    it('should handle null/undefined', () => {
      expect(summarizeContent(null)).toBe('')
      expect(summarizeContent(undefined)).toBe('')
    })

    it('should handle primitive types', () => {
      expect(summarizeContent(123)).toBe('123')
      expect(summarizeContent(true)).toBe('true')
    })
  })

  describe('calculateSize', () => {
    it('should calculate string size', () => {
      expect(calculateSize('hello')).toBe(5)
      expect(calculateSize('')).toBe(0)
    })

    it('should calculate object size', () => {
      const obj = { key: 'value' }
      const size = calculateSize(obj)
      expect(size).toBeGreaterThan(0)
    })

    it('should handle null/undefined', () => {
      expect(calculateSize(null)).toBe(0)
      expect(calculateSize(undefined)).toBe(0)
    })
  })

  describe('estimateTokenCount', () => {
    it('should estimate tokens for string', () => {
      const text = 'This is a sample text for token estimation'
      const tokens = estimateTokenCount(text)
      expect(tokens).toBeGreaterThan(0)
    })

    it('should estimate tokens for object', () => {
      const obj = { key: 'value', number: 123 }
      const tokens = estimateTokenCount(obj)
      expect(tokens).toBeGreaterThan(0)
    })
  })

  describe('filterRecords', () => {
    const records: ExecutionRecord[] = [
      {
        id: 'exec_1',
        agentId: 'agent-a',
        agentName: 'Agent A',
        status: 'completed',
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T10:01:00'),
        duration: 60000,
        context: { sessionId: 'session-1', tags: ['tag1', 'tag2'] },
        input: { summary: 'input 1' },
      },
      {
        id: 'exec_2',
        agentId: 'agent-b',
        agentName: 'Agent B',
        status: 'failed',
        startTime: new Date('2025-01-01T11:00:00'),
        duration: 30000,
        context: { sessionId: 'session-1' },
        input: { summary: 'input 2' },
        error: { message: 'Error' },
      },
      {
        id: 'exec_3',
        agentId: 'agent-a',
        agentName: 'Agent A',
        status: 'completed',
        startTime: new Date('2025-01-01T12:00:00'),
        duration: 45000,
        context: { sessionId: 'session-2', chainId: 'chain-1' },
        input: { summary: 'input 3' },
      },
    ]

    it('should filter by agentId', () => {
      const result = filterRecords(records, { agentId: 'agent-a' })
      expect(result).toHaveLength(2)
      expect(result.every((r) => r.agentId === 'agent-a')).toBe(true)
    })

    it('should filter by agentName (partial match)', () => {
      const result = filterRecords(records, { agentName: 'agent' })
      expect(result).toHaveLength(3)
    })

    it('should filter by status', () => {
      const result = filterRecords(records, { status: 'failed' })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('exec_2')
    })

    it('should filter by multiple statuses', () => {
      const result = filterRecords(records, { status: ['completed', 'failed'] })
      expect(result).toHaveLength(3)
    })

    it('should filter by time range', () => {
      const result = filterRecords(records, {
        startTimeAfter: new Date('2025-01-01T10:30:00'),
        startTimeBefore: new Date('2025-01-01T11:30:00'),
      })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('exec_2')
    })

    it('should filter by sessionId', () => {
      const result = filterRecords(records, { sessionId: 'session-1' })
      expect(result).toHaveLength(2)
    })

    it('should filter by chainId', () => {
      const result = filterRecords(records, { chainId: 'chain-1' })
      expect(result).toHaveLength(1)
    })

    it('should filter by duration', () => {
      const result = filterRecords(records, { minDuration: 50000 })
      expect(result).toHaveLength(1)
      expect(result[0].duration).toBe(60000)
    })

    it('should filter by hasError', () => {
      const withError = filterRecords(records, { hasError: true })
      expect(withError).toHaveLength(1)

      const withoutError = filterRecords(records, { hasError: false })
      expect(withoutError).toHaveLength(2)
    })

    it('should filter by tags', () => {
      const result = filterRecords(records, { tags: ['tag1'] })
      expect(result).toHaveLength(1)
    })

    it('should apply limit and offset', () => {
      const result = filterRecords(records, { limit: 1, offset: 1 })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('exec_2')
    })
  })

  describe('sortRecords', () => {
    const records: ExecutionRecord[] = [
      {
        id: 'exec_1',
        agentId: 'agent-a',
        agentName: 'Zebra',
        status: 'completed',
        startTime: new Date('2025-01-01T10:00:00'),
        duration: 100,
        context: {},
        input: {},
      },
      {
        id: 'exec_2',
        agentId: 'agent-b',
        agentName: 'Alpha',
        status: 'failed',
        startTime: new Date('2025-01-01T12:00:00'),
        duration: 300,
        context: {},
        input: {},
      },
      {
        id: 'exec_3',
        agentId: 'agent-c',
        agentName: 'Beta',
        status: 'running',
        startTime: new Date('2025-01-01T11:00:00'),
        duration: 200,
        context: {},
        input: {},
      },
    ]

    it('should sort by startTime ascending', () => {
      const result = sortRecords(records, { field: 'startTime', order: 'asc' })
      expect(result[0].id).toBe('exec_1')
      expect(result[2].id).toBe('exec_2')
    })

    it('should sort by startTime descending', () => {
      const result = sortRecords(records, { field: 'startTime', order: 'desc' })
      expect(result[0].id).toBe('exec_2')
      expect(result[2].id).toBe('exec_1')
    })

    it('should sort by duration', () => {
      const result = sortRecords(records, { field: 'duration', order: 'desc' })
      expect(result[0].duration).toBe(300)
      expect(result[2].duration).toBe(100)
    })

    it('should sort by agentName', () => {
      const result = sortRecords(records, { field: 'agentName', order: 'asc' })
      expect(result[0].agentName).toBe('Alpha')
      expect(result[2].agentName).toBe('Zebra')
    })

    it('should sort by status', () => {
      const result = sortRecords(records, { field: 'status', order: 'asc' })
      expect(result[0].status).toBe('completed')
    })
  })

  describe('calculateStatistics', () => {
    const records: ExecutionRecord[] = [
      {
        id: 'exec_1',
        agentId: 'agent-a',
        agentName: 'Agent A',
        status: 'completed',
        startTime: new Date('2025-01-01T10:00:00'),
        duration: 1000,
        context: {},
        input: {},
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.01 },
      },
      {
        id: 'exec_2',
        agentId: 'agent-a',
        agentName: 'Agent A',
        status: 'completed',
        startTime: new Date('2025-01-01T14:00:00'),
        duration: 2000,
        context: {},
        input: {},
        tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300, estimatedCost: 0.02 },
      },
      {
        id: 'exec_3',
        agentId: 'agent-b',
        agentName: 'Agent B',
        status: 'failed',
        startTime: new Date('2025-01-01T10:30:00'),
        duration: 500,
        context: {},
        input: {},
        error: { message: 'Error' },
      },
    ]

    it('should calculate total executions', () => {
      const stats = calculateStatistics(records)
      expect(stats.totalExecutions).toBe(3)
    })

    it('should calculate success/failure counts', () => {
      const stats = calculateStatistics(records)
      expect(stats.successfulExecutions).toBe(2)
      expect(stats.failedExecutions).toBe(1)
    })

    it('should calculate success rate', () => {
      const stats = calculateStatistics(records)
      expect(stats.successRate).toBeCloseTo(66.67, 1)
    })

    it('should calculate duration stats', () => {
      const stats = calculateStatistics(records)
      expect(stats.totalDuration).toBe(3500)
      expect(stats.averageDuration).toBeCloseTo(1166.67, 0)
    })

    it('should calculate token usage', () => {
      const stats = calculateStatistics(records)
      expect(stats.totalInputTokens).toBe(300)
      expect(stats.totalOutputTokens).toBe(150)
      expect(stats.totalCost).toBeCloseTo(0.03, 4)
    })

    it('should group by agent', () => {
      const stats = calculateStatistics(records)
      expect(stats.executionsByAgent.size).toBe(2)

      const agentAStats = stats.executionsByAgent.get('agent-a')
      expect(agentAStats?.totalExecutions).toBe(2)
      expect(agentAStats?.successfulExecutions).toBe(2)
    })

    it('should calculate hourly distribution', () => {
      const stats = calculateStatistics(records)
      expect(stats.hourlyDistribution.get(10)).toBe(2) // 10:00 and 10:30
      expect(stats.hourlyDistribution.get(14)).toBe(1) // 14:00
    })

    it('should handle empty records', () => {
      const stats = calculateStatistics([])
      expect(stats.totalExecutions).toBe(0)
      expect(stats.successRate).toBe(0)
    })
  })

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms')
    })

    it('should format seconds', () => {
      expect(formatDuration(5500)).toBe('5.50s')
    })

    it('should format minutes', () => {
      expect(formatDuration(125000)).toBe('2m 5s')
    })

    it('should format hours', () => {
      expect(formatDuration(3725000)).toBe('1h 2m')
    })
  })

  describe('ExecutionHistoryManager', () => {
    let manager: ExecutionHistoryManager

    beforeEach(() => {
      manager = new ExecutionHistoryManager({ maxRecords: 100 })
    })

    it('should start and complete execution', () => {
      const execId = manager.startExecution('agent-1', 'Test Agent', {
        input: { data: 'test' },
      })

      expect(execId).toBeDefined()

      const record = manager.completeExecution(execId, { result: 'success' })

      expect(record).not.toBeNull()
      expect(record?.status).toBe('completed')
      expect(record?.output?.raw).toEqual({ result: 'success' })
      expect(record?.duration).toBeGreaterThanOrEqual(0)
    })

    it('should start and fail execution', () => {
      const execId = manager.startExecution('agent-1', 'Test Agent')

      const record = manager.failExecution(execId, 'Something went wrong')

      expect(record?.status).toBe('failed')
      expect(record?.error?.message).toBe('Something went wrong')
    })

    it('should fail with Error object', () => {
      const execId = manager.startExecution('agent-1', 'Test Agent')

      const record = manager.failExecution(execId, new Error('Error message'))

      expect(record?.error?.message).toBe('Error message')
      expect(record?.error?.stack).toBeDefined()
    })

    it('should cancel execution', () => {
      const execId = manager.startExecution('agent-1', 'Test Agent')

      const record = manager.cancelExecution(execId, 'User cancelled')

      expect(record?.status).toBe('cancelled')
      expect(record?.error?.message).toBe('User cancelled')
    })

    it('should timeout execution', () => {
      const execId = manager.startExecution('agent-1', 'Test Agent')

      const record = manager.timeoutExecution(execId)

      expect(record?.status).toBe('timeout')
      expect(record?.error?.code).toBe('TIMEOUT')
    })

    it('should get record by ID', () => {
      const execId = manager.startExecution('agent-1', 'Test Agent')

      const record = manager.getRecord(execId)

      expect(record).toBeDefined()
      expect(record?.id).toBe(execId)
    })

    it('should get all records', () => {
      manager.startExecution('agent-1', 'Agent 1')
      manager.startExecution('agent-2', 'Agent 2')

      expect(manager.getAllRecords()).toHaveLength(2)
    })

    it('should query with filter', () => {
      const exec1 = manager.startExecution('agent-1', 'Agent 1')
      manager.completeExecution(exec1, {})

      const exec2 = manager.startExecution('agent-2', 'Agent 2')
      manager.failExecution(exec2, 'Error')

      const completed = manager.query({ status: 'completed' })
      expect(completed).toHaveLength(1)

      const failed = manager.query({ status: 'failed' })
      expect(failed).toHaveLength(1)
    })

    it('should get recent executions', () => {
      for (let i = 0; i < 5; i++) {
        manager.startExecution(`agent-${i}`, `Agent ${i}`)
      }

      const recent = manager.getRecent(3)
      expect(recent).toHaveLength(3)
      expect(recent[0].agentId).toBe('agent-4')
    })

    it('should get executions by agent', () => {
      manager.startExecution('agent-1', 'Agent 1')
      manager.startExecution('agent-2', 'Agent 2')
      manager.startExecution('agent-1', 'Agent 1')

      const byAgent = manager.getByAgent('agent-1')
      expect(byAgent).toHaveLength(2)
    })

    it('should get executions by session', () => {
      manager.startExecution('agent-1', 'Agent 1', { context: { sessionId: 'session-a' } })
      manager.startExecution('agent-2', 'Agent 2', { context: { sessionId: 'session-b' } })
      manager.startExecution('agent-3', 'Agent 3', { context: { sessionId: 'session-a' } })

      const bySession = manager.getBySession('session-a')
      expect(bySession).toHaveLength(2)
    })

    it('should get failed executions', () => {
      const exec1 = manager.startExecution('agent-1', 'Agent 1')
      manager.completeExecution(exec1, {})

      const exec2 = manager.startExecution('agent-2', 'Agent 2')
      manager.failExecution(exec2, 'Error')

      const failed = manager.getFailed()
      expect(failed).toHaveLength(1)
    })

    it('should get statistics', () => {
      const exec1 = manager.startExecution('agent-1', 'Agent 1')
      manager.completeExecution(exec1, {}, { inputTokens: 100, outputTokens: 50, totalTokens: 150 })

      const exec2 = manager.startExecution('agent-2', 'Agent 2')
      manager.failExecution(exec2, 'Error')

      const stats = manager.getStatistics()
      expect(stats.totalExecutions).toBe(2)
      expect(stats.successfulExecutions).toBe(1)
      expect(stats.failedExecutions).toBe(1)
    })

    it('should clear all records', () => {
      manager.startExecution('agent-1', 'Agent 1')
      manager.startExecution('agent-2', 'Agent 2')

      manager.clear()

      expect(manager.getCount()).toBe(0)
    })

    it('should clear old records', () => {
      // Add a record with old date (by modifying after creation)
      const execId = manager.startExecution('agent-1', 'Old Agent')
      const record = manager.getRecord(execId)
      if (record) {
        record.startTime = new Date('2020-01-01')
      }

      manager.startExecution('agent-2', 'New Agent')

      const removed = manager.clearOlderThan(new Date('2024-01-01'))
      expect(removed).toBe(1)
      expect(manager.getCount()).toBe(1)
    })

    it('should export to JSON', () => {
      const execId = manager.startExecution('agent-1', 'Agent 1')
      manager.completeExecution(execId, { result: 'done' })

      const json = manager.exportToJson()
      const parsed = JSON.parse(json)

      expect(parsed.records).toHaveLength(1)
      expect(parsed.statistics).toBeDefined()
      expect(parsed.exportedAt).toBeDefined()
    })

    it('should import from JSON', () => {
      const json = JSON.stringify({
        records: [
          {
            id: 'exec_imported',
            agentId: 'agent-x',
            agentName: 'Imported Agent',
            status: 'completed',
            startTime: '2025-01-01T10:00:00.000Z',
            duration: 1000,
            context: {},
            input: {},
          },
        ],
      })

      const imported = manager.importFromJson(json)

      expect(imported).toBe(1)
      expect(manager.getCount()).toBe(1)

      const record = manager.getRecord('exec_imported')
      expect(record?.agentName).toBe('Imported Agent')
      expect(record?.startTime instanceof Date).toBe(true)
    })

    it('should enforce max records', () => {
      const smallManager = new ExecutionHistoryManager({ maxRecords: 3 })

      for (let i = 0; i < 5; i++) {
        smallManager.startExecution(`agent-${i}`, `Agent ${i}`)
      }

      expect(smallManager.getCount()).toBe(3)
    })

    it('should call callbacks', () => {
      const onAdded = vi.fn()
      const onUpdated = vi.fn()

      const callbackManager = new ExecutionHistoryManager({
        onRecordAdded: onAdded,
        onRecordUpdated: onUpdated,
      })

      const execId = callbackManager.startExecution('agent-1', 'Agent 1')
      expect(onAdded).toHaveBeenCalledTimes(1)

      callbackManager.completeExecution(execId, {})
      expect(onUpdated).toHaveBeenCalledTimes(1)
    })
  })

  describe('createExecutionTracker', () => {
    let manager: ExecutionHistoryManager

    beforeEach(() => {
      manager = new ExecutionHistoryManager()
    })

    it('should create tracker with complete function', () => {
      const tracker = createExecutionTracker(manager, 'agent-1', 'Test Agent')

      expect(tracker.executionId).toBeDefined()

      const record = tracker.complete({ result: 'success' })
      expect(record?.status).toBe('completed')
    })

    it('should create tracker with fail function', () => {
      const tracker = createExecutionTracker(manager, 'agent-1', 'Test Agent')

      const record = tracker.fail('Error message')
      expect(record?.status).toBe('failed')
    })

    it('should create tracker with cancel function', () => {
      const tracker = createExecutionTracker(manager, 'agent-1', 'Test Agent')

      const record = tracker.cancel('Cancelled by user')
      expect(record?.status).toBe('cancelled')
    })

    it('should create tracker with timeout function', () => {
      const tracker = createExecutionTracker(manager, 'agent-1', 'Test Agent')

      const record = tracker.timeout()
      expect(record?.status).toBe('timeout')
    })
  })
})
