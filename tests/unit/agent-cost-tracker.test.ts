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
  MODEL_PRICING,
  calculateCost,
  calculateTotalCost,
  getUsageSummaryByModel,
  getUsageSummaryByAgent,
  checkBudgetAlerts,
  detectCostSpike,
  generateOptimizationSuggestions,
  formatCost,
  formatTokens,
  estimateCost,
  compareCosts,
  getMostCostEffectiveModel,
  CostTracker,
  type TokenUsage,
  type BudgetConfig,
} from '@/lib/agent/cost-tracker'

describe('Agent Cost Tracker', () => {
  describe('MODEL_PRICING', () => {
    it('should have pricing for common models', () => {
      expect(MODEL_PRICING['claude-opus-4']).toBeDefined()
      expect(MODEL_PRICING['claude-sonnet-4']).toBeDefined()
      expect(MODEL_PRICING['gpt-4o']).toBeDefined()
      expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined()
    })

    it('should have input and output prices', () => {
      for (const [_model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.input).toBeGreaterThan(0)
        expect(pricing.output).toBeGreaterThan(0)
        expect(pricing.contextWindow).toBeGreaterThan(0)
      }
    })

    it('should have output price >= input price', () => {
      for (const [_model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.output).toBeGreaterThanOrEqual(pricing.input)
      }
    })
  })

  describe('calculateCost', () => {
    it('should calculate cost for known model', () => {
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-sonnet-4',
        timestamp: new Date(),
      }

      const cost = calculateCost(usage)

      // claude-sonnet-4: $3/1M input, $15/1M output
      expect(cost.inputCost).toBeCloseTo(0.003, 6)
      expect(cost.outputCost).toBeCloseTo(0.0075, 6)
      expect(cost.totalCost).toBeCloseTo(0.0105, 6)
      expect(cost.currency).toBe('USD')
    })

    it('should handle large token counts', () => {
      const usage: TokenUsage = {
        inputTokens: 100000,
        outputTokens: 50000,
        model: 'gpt-4o',
        timestamp: new Date(),
      }

      const cost = calculateCost(usage)

      // gpt-4o: $2.5/1M input, $10/1M output
      expect(cost.inputCost).toBeCloseTo(0.25, 4)
      expect(cost.outputCost).toBeCloseTo(0.5, 4)
      expect(cost.totalCost).toBeCloseTo(0.75, 4)
    })

    it('should return zero cost for unknown model', () => {
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        model: 'unknown-model',
        timestamp: new Date(),
      }

      const cost = calculateCost(usage)

      expect(cost.inputCost).toBe(0)
      expect(cost.outputCost).toBe(0)
      expect(cost.totalCost).toBe(0)
    })

    it('should handle zero tokens', () => {
      const usage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        model: 'claude-sonnet-4',
        timestamp: new Date(),
      }

      const cost = calculateCost(usage)

      expect(cost.totalCost).toBe(0)
    })
  })

  describe('calculateTotalCost', () => {
    it('should sum costs for multiple usages', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 1000, outputTokens: 500, model: 'claude-sonnet-4', timestamp: new Date() },
        { inputTokens: 2000, outputTokens: 1000, model: 'claude-sonnet-4', timestamp: new Date() },
      ]

      const total = calculateTotalCost(usages)

      // Total: 3000 input, 1500 output
      expect(total.inputCost).toBeCloseTo(0.009, 6)
      expect(total.outputCost).toBeCloseTo(0.0225, 6)
      expect(total.totalCost).toBeCloseTo(0.0315, 6)
    })

    it('should handle mixed models', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 1000, outputTokens: 500, model: 'claude-sonnet-4', timestamp: new Date() },
        { inputTokens: 1000, outputTokens: 500, model: 'gpt-4o', timestamp: new Date() },
      ]

      const total = calculateTotalCost(usages)

      // claude-sonnet-4: 0.003 + 0.0075 = 0.0105
      // gpt-4o: 0.0025 + 0.005 = 0.0075
      expect(total.totalCost).toBeCloseTo(0.018, 4)
    })

    it('should handle empty array', () => {
      const total = calculateTotalCost([])

      expect(total.totalCost).toBe(0)
    })
  })

  describe('getUsageSummaryByModel', () => {
    it('should group usages by model', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 1000, outputTokens: 500, model: 'claude-sonnet-4', timestamp: new Date() },
        { inputTokens: 2000, outputTokens: 1000, model: 'claude-sonnet-4', timestamp: new Date() },
        { inputTokens: 1000, outputTokens: 500, model: 'gpt-4o', timestamp: new Date() },
      ]

      const summary = getUsageSummaryByModel(usages)

      expect(summary).toHaveLength(2)
      expect(summary[0].operationCount).toBe(2) // claude-sonnet-4 (higher cost)
      expect(summary[1].operationCount).toBe(1) // gpt-4o
    })

    it('should calculate averages correctly', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 1000, outputTokens: 500, model: 'claude-sonnet-4', timestamp: new Date() },
        { inputTokens: 3000, outputTokens: 1500, model: 'claude-sonnet-4', timestamp: new Date() },
      ]

      const summary = getUsageSummaryByModel(usages)

      expect(summary[0].averageInputTokens).toBe(2000)
      expect(summary[0].averageOutputTokens).toBe(1000)
    })

    it('should sort by total cost descending', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 1000, outputTokens: 500, model: 'gpt-4o-mini', timestamp: new Date() },
        { inputTokens: 1000, outputTokens: 500, model: 'claude-opus-4', timestamp: new Date() },
      ]

      const summary = getUsageSummaryByModel(usages)

      expect(summary[0].model).toBe('claude-opus-4') // More expensive
      expect(summary[1].model).toBe('gpt-4o-mini') // Cheaper
    })
  })

  describe('getUsageSummaryByAgent', () => {
    it('should group usages by agent name', () => {
      const usages: TokenUsage[] = [
        {
          inputTokens: 1000,
          outputTokens: 500,
          model: 'claude-sonnet-4',
          timestamp: new Date(),
          agentName: 'code-reviewer',
        },
        {
          inputTokens: 2000,
          outputTokens: 1000,
          model: 'claude-sonnet-4',
          timestamp: new Date(),
          agentName: 'code-reviewer',
        },
        {
          inputTokens: 1000,
          outputTokens: 500,
          model: 'gpt-4o',
          timestamp: new Date(),
          agentName: 'doc-writer',
        },
      ]

      const summary = getUsageSummaryByAgent(usages)

      expect(summary).toHaveLength(2)
      const reviewer = summary.find((s) => s.model === 'code-reviewer')
      expect(reviewer?.operationCount).toBe(2)
    })

    it('should handle missing agent names', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 1000, outputTokens: 500, model: 'claude-sonnet-4', timestamp: new Date() },
      ]

      const summary = getUsageSummaryByAgent(usages)

      expect(summary[0].model).toBe('unknown')
    })
  })

  describe('checkBudgetAlerts', () => {
    const budget: BudgetConfig = {
      daily: 10,
      weekly: 50,
      monthly: 200,
      alertThresholds: [50, 75, 90, 100],
    }

    it('should return no alerts under threshold', () => {
      const alerts = checkBudgetAlerts(4, budget, 'daily') // 40%

      expect(alerts).toHaveLength(0)
    })

    it('should return info alert at 50%', () => {
      const alerts = checkBudgetAlerts(5, budget, 'daily') // 50%

      expect(alerts).toHaveLength(1)
      expect(alerts[0].severity).toBe('info')
      expect(alerts[0].threshold).toBe(50)
    })

    it('should return warning alert at 75%', () => {
      const alerts = checkBudgetAlerts(7.5, budget, 'daily') // 75%

      expect(alerts).toHaveLength(1)
      expect(alerts[0].severity).toBe('warning')
    })

    it('should return critical alert at 90%', () => {
      const alerts = checkBudgetAlerts(9, budget, 'daily') // 90%

      expect(alerts).toHaveLength(1)
      expect(alerts[0].severity).toBe('critical')
    })

    it('should handle missing budget period', () => {
      const partialBudget: BudgetConfig = {
        alertThresholds: [50, 75, 90],
      }

      const alerts = checkBudgetAlerts(5, partialBudget, 'daily')

      expect(alerts).toHaveLength(0)
    })
  })

  describe('detectCostSpike', () => {
    it('should detect cost spike', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 10000, outputTokens: 5000, model: 'claude-opus-4', timestamp: new Date() },
      ]

      const alert = detectCostSpike(usages, 0.01, 2.0) // Historical avg is 1 cent

      expect(alert).not.toBeNull()
      expect(alert?.type).toBe('spike')
    })

    it('should not trigger for normal usage', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 1000, outputTokens: 500, model: 'gpt-4o-mini', timestamp: new Date() },
      ]

      const alert = detectCostSpike(usages, 0.01, 2.0)

      expect(alert).toBeNull()
    })

    it('should handle empty usages', () => {
      const alert = detectCostSpike([], 0.01, 2.0)

      expect(alert).toBeNull()
    })

    it('should handle zero historical average', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 1000, outputTokens: 500, model: 'gpt-4o-mini', timestamp: new Date() },
      ]

      const alert = detectCostSpike(usages, 0, 2.0)

      expect(alert).toBeNull()
    })
  })

  describe('generateOptimizationSuggestions', () => {
    it('should suggest model downgrade for expensive models', () => {
      const usages: TokenUsage[] = Array.from({ length: 15 }, () => ({
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-opus-4',
        timestamp: new Date(),
      }))

      const suggestions = generateOptimizationSuggestions(usages)

      const modelSuggestion = suggestions.find((s) => s.category === 'model')
      expect(modelSuggestion).toBeDefined()
      expect(modelSuggestion?.title).toContain('claude-opus-4')
    })

    it('should suggest context reduction for high token usage', () => {
      const usages: TokenUsage[] = [
        { inputTokens: 100000, outputTokens: 10000, model: 'claude-sonnet-4', timestamp: new Date() },
      ]

      const suggestions = generateOptimizationSuggestions(usages)

      const contextSuggestion = suggestions.find((s) => s.category === 'context')
      expect(contextSuggestion).toBeDefined()
    })

    it('should suggest caching for repeated operations', () => {
      const usages: TokenUsage[] = Array.from({ length: 25 }, () => ({
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-sonnet-4',
        timestamp: new Date(),
        operationType: 'code-review',
      }))

      const suggestions = generateOptimizationSuggestions(usages)

      const cacheSuggestion = suggestions.find((s) => s.category === 'caching')
      expect(cacheSuggestion).toBeDefined()
    })

    it('should suggest batching for small operations', () => {
      const usages: TokenUsage[] = Array.from({ length: 60 }, () => ({
        inputTokens: 50,
        outputTokens: 50,
        model: 'claude-sonnet-4',
        timestamp: new Date(),
      }))

      const suggestions = generateOptimizationSuggestions(usages)

      const batchSuggestion = suggestions.find((s) => s.category === 'batching')
      expect(batchSuggestion).toBeDefined()
    })

    it('should sort suggestions by potential savings', () => {
      const usages: TokenUsage[] = [
        ...Array.from({ length: 15 }, () => ({
          inputTokens: 100000,
          outputTokens: 50000,
          model: 'claude-opus-4',
          timestamp: new Date(),
        })),
      ]

      const suggestions = generateOptimizationSuggestions(usages)

      if (suggestions.length >= 2) {
        expect(suggestions[0].potentialSavings).toBeGreaterThanOrEqual(suggestions[1].potentialSavings)
      }
    })
  })

  describe('formatCost', () => {
    it('should format regular costs', () => {
      expect(formatCost(0.0105)).toBe('$0.0105')
      expect(formatCost(1.5)).toBe('$1.5000')
    })

    it('should format small costs with more decimals', () => {
      expect(formatCost(0.00001)).toBe('$0.000010')
    })

    it('should respect custom decimals', () => {
      expect(formatCost(1.234567, 2)).toBe('$1.23')
    })
  })

  describe('formatTokens', () => {
    it('should format millions', () => {
      expect(formatTokens(1500000)).toBe('1.50M')
    })

    it('should format thousands', () => {
      expect(formatTokens(1500)).toBe('1.5K')
    })

    it('should format small numbers', () => {
      expect(formatTokens(500)).toBe('500')
    })
  })

  describe('estimateCost', () => {
    it('should estimate cost for planned operation', () => {
      const estimate = estimateCost('claude-sonnet-4', 5000, 2000)

      expect(estimate.inputCost).toBeCloseTo(0.015, 5)
      expect(estimate.outputCost).toBeCloseTo(0.03, 5)
      expect(estimate.totalCost).toBeCloseTo(0.045, 5)
    })
  })

  describe('compareCosts', () => {
    it('should compare costs across models', () => {
      const comparison = compareCosts(10000, 5000, ['claude-opus-4', 'claude-sonnet-4', 'gpt-4o-mini'])

      expect(comparison).toHaveLength(3)
      expect(comparison[0].model).toBe('gpt-4o-mini') // Cheapest
      expect(comparison[2].model).toBe('claude-opus-4') // Most expensive
    })

    it('should sort by total cost ascending', () => {
      const comparison = compareCosts(1000, 500, Object.keys(MODEL_PRICING))

      for (let i = 1; i < comparison.length; i++) {
        expect(comparison[i].cost.totalCost).toBeGreaterThanOrEqual(comparison[i - 1].cost.totalCost)
      }
    })
  })

  describe('getMostCostEffectiveModel', () => {
    it('should return cheapest model', () => {
      const result = getMostCostEffectiveModel(10000, 5000)

      expect(result).not.toBeNull()
      expect(result?.model).toBeDefined()
    })

    it('should filter by eligible models', () => {
      const result = getMostCostEffectiveModel(10000, 5000, ['claude-opus-4', 'claude-sonnet-4'])

      expect(result?.model).toBe('claude-sonnet-4')
    })
  })

  describe('CostTracker class', () => {
    let tracker: CostTracker

    beforeEach(() => {
      tracker = new CostTracker({
        budget: {
          daily: 10,
          alertThresholds: [50, 75, 90],
        },
      })
    })

    it('should record usage and return cost', () => {
      const cost = tracker.recordUsage({
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-sonnet-4',
      })

      expect(cost.totalCost).toBeGreaterThan(0)
      expect(tracker.getUsages()).toHaveLength(1)
    })

    it('should track multiple usages', () => {
      tracker.recordUsage({ inputTokens: 1000, outputTokens: 500, model: 'claude-sonnet-4' })
      tracker.recordUsage({ inputTokens: 2000, outputTokens: 1000, model: 'gpt-4o' })

      expect(tracker.getUsages()).toHaveLength(2)
    })

    it('should calculate total cost', () => {
      tracker.recordUsage({ inputTokens: 1000, outputTokens: 500, model: 'claude-sonnet-4' })
      tracker.recordUsage({ inputTokens: 1000, outputTokens: 500, model: 'claude-sonnet-4' })

      const total = tracker.getTotalCost()

      expect(total.totalCost).toBeCloseTo(0.021, 4)
    })

    it('should get summary by model', () => {
      tracker.recordUsage({ inputTokens: 1000, outputTokens: 500, model: 'claude-sonnet-4' })
      tracker.recordUsage({ inputTokens: 1000, outputTokens: 500, model: 'gpt-4o' })

      const summary = tracker.getSummaryByModel()

      expect(summary).toHaveLength(2)
    })

    it('should get summary by agent', () => {
      tracker.recordUsage({
        inputTokens: 1000,
        outputTokens: 500,
        model: 'claude-sonnet-4',
        agentName: 'reviewer',
      })
      tracker.recordUsage({
        inputTokens: 1000,
        outputTokens: 500,
        model: 'gpt-4o',
        agentName: 'writer',
      })

      const summary = tracker.getSummaryByAgent()

      expect(summary).toHaveLength(2)
    })

    it('should clear all data', () => {
      tracker.recordUsage({ inputTokens: 1000, outputTokens: 500, model: 'claude-sonnet-4' })
      tracker.clear()

      expect(tracker.getUsages()).toHaveLength(0)
      expect(tracker.getAlerts()).toHaveLength(0)
    })

    it('should export to JSON', () => {
      tracker.recordUsage({ inputTokens: 1000, outputTokens: 500, model: 'claude-sonnet-4' })

      const json = tracker.exportToJson()
      const parsed = JSON.parse(json)

      expect(parsed.usages).toHaveLength(1)
      expect(parsed.summary).toBeDefined()
      expect(parsed.exportedAt).toBeDefined()
    })

    it('should get optimization suggestions', () => {
      // Add many usages of expensive model
      for (let i = 0; i < 15; i++) {
        tracker.recordUsage({ inputTokens: 1000, outputTokens: 500, model: 'claude-opus-4' })
      }

      const suggestions = tracker.getOptimizationSuggestions()

      expect(suggestions.length).toBeGreaterThan(0)
    })

    it('should not get suggestions when disabled', () => {
      const disabledTracker = new CostTracker({
        optimizationSuggestionsEnabled: false,
      })

      for (let i = 0; i < 15; i++) {
        disabledTracker.recordUsage({ inputTokens: 1000, outputTokens: 500, model: 'claude-opus-4' })
      }

      const suggestions = disabledTracker.getOptimizationSuggestions()

      expect(suggestions).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('should handle very small token counts', () => {
      const cost = calculateCost({
        inputTokens: 1,
        outputTokens: 1,
        model: 'claude-sonnet-4',
        timestamp: new Date(),
      })

      expect(cost.totalCost).toBeGreaterThan(0)
    })

    it('should handle very large token counts', () => {
      const cost = calculateCost({
        inputTokens: 1000000,
        outputTokens: 500000,
        model: 'claude-sonnet-4',
        timestamp: new Date(),
      })

      // 1M input: $3, 0.5M output: $7.5 = $10.5
      expect(cost.totalCost).toBeCloseTo(10.5, 2)
    })
  })
})
