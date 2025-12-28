/**
 * Agent Cost Tracking Library
 *
 * Provides token usage monitoring, cost estimation, and optimization suggestions
 * for AI agent operations.
 */

import { logger as log } from './logger'

// Model pricing (per 1M tokens, USD)
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4': { input: 15.0, output: 75.0, contextWindow: 200000 },
  'claude-sonnet-4': { input: 3.0, output: 15.0, contextWindow: 200000 },
  'claude-3.5-sonnet': { input: 3.0, output: 15.0, contextWindow: 200000 },
  'claude-3.5-haiku': { input: 0.8, output: 4.0, contextWindow: 200000 },
  'claude-3-opus': { input: 15.0, output: 75.0, contextWindow: 200000 },
  'claude-3-sonnet': { input: 3.0, output: 15.0, contextWindow: 200000 },
  'claude-3-haiku': { input: 0.25, output: 1.25, contextWindow: 200000 },
  'gpt-4o': { input: 2.5, output: 10.0, contextWindow: 128000 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, contextWindow: 128000 },
  'gpt-4-turbo': { input: 10.0, output: 30.0, contextWindow: 128000 },
  'gpt-4': { input: 30.0, output: 60.0, contextWindow: 8192 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5, contextWindow: 16385 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0, contextWindow: 2000000 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3, contextWindow: 1000000 },
}

export interface ModelPricing {
  input: number // per 1M tokens
  output: number // per 1M tokens
  contextWindow: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  model: string
  timestamp: Date
  operationType?: string
  agentName?: string
}

export interface CostEstimate {
  inputCost: number
  outputCost: number
  totalCost: number
  currency: 'USD'
}

export interface UsageSummary {
  model: string
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  operationCount: number
  averageInputTokens: number
  averageOutputTokens: number
  averageCostPerOperation: number
}

export interface CostAlert {
  id: string
  type: 'threshold' | 'spike' | 'budget'
  threshold: number
  currentValue: number
  message: string
  severity: 'info' | 'warning' | 'critical'
  triggeredAt: Date
}

export interface CostOptimizationSuggestion {
  id: string
  title: string
  description: string
  potentialSavings: number // percentage
  effort: 'low' | 'medium' | 'high'
  category: 'model' | 'prompt' | 'caching' | 'batching' | 'context'
}

export interface BudgetConfig {
  daily?: number
  weekly?: number
  monthly?: number
  alertThresholds: number[] // percentages, e.g., [50, 75, 90, 100]
}

export interface CostTrackerConfig {
  budget?: BudgetConfig
  alertsEnabled: boolean
  optimizationSuggestionsEnabled: boolean
  trackingGranularity: 'operation' | 'session' | 'daily'
}

/**
 * Calculate cost for a single token usage
 */
export function calculateCost(usage: TokenUsage): CostEstimate {
  const pricing = MODEL_PRICING[usage.model]

  if (!pricing) {
    log.warn('Unknown model for cost calculation', { model: usage.model })
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: 'USD',
    }
  }

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output

  return {
    inputCost: Math.round(inputCost * 1_000_000) / 1_000_000, // 6 decimal places
    outputCost: Math.round(outputCost * 1_000_000) / 1_000_000,
    totalCost: Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000,
    currency: 'USD',
  }
}

/**
 * Calculate total cost for multiple usages
 */
export function calculateTotalCost(usages: TokenUsage[]): CostEstimate {
  const result: CostEstimate = {
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
    currency: 'USD',
  }

  for (const usage of usages) {
    const cost = calculateCost(usage)
    result.inputCost += cost.inputCost
    result.outputCost += cost.outputCost
    result.totalCost += cost.totalCost
  }

  // Round to 6 decimal places
  result.inputCost = Math.round(result.inputCost * 1_000_000) / 1_000_000
  result.outputCost = Math.round(result.outputCost * 1_000_000) / 1_000_000
  result.totalCost = Math.round(result.totalCost * 1_000_000) / 1_000_000

  return result
}

/**
 * Get usage summary grouped by model
 */
export function getUsageSummaryByModel(usages: TokenUsage[]): UsageSummary[] {
  const byModel = new Map<string, TokenUsage[]>()

  for (const usage of usages) {
    const existing = byModel.get(usage.model) || []
    existing.push(usage)
    byModel.set(usage.model, existing)
  }

  const summaries: UsageSummary[] = []

  for (const [model, modelUsages] of byModel) {
    const totalInputTokens = modelUsages.reduce((sum, u) => sum + u.inputTokens, 0)
    const totalOutputTokens = modelUsages.reduce((sum, u) => sum + u.outputTokens, 0)
    const totalCost = calculateTotalCost(modelUsages).totalCost

    summaries.push({
      model,
      totalInputTokens,
      totalOutputTokens,
      totalCost,
      operationCount: modelUsages.length,
      averageInputTokens: Math.round(totalInputTokens / modelUsages.length),
      averageOutputTokens: Math.round(totalOutputTokens / modelUsages.length),
      averageCostPerOperation:
        Math.round((totalCost / modelUsages.length) * 1_000_000) / 1_000_000,
    })
  }

  // Sort by total cost descending
  return summaries.sort((a, b) => b.totalCost - a.totalCost)
}

/**
 * Get usage summary grouped by agent
 */
export function getUsageSummaryByAgent(usages: TokenUsage[]): UsageSummary[] {
  const byAgent = new Map<string, TokenUsage[]>()

  for (const usage of usages) {
    const agentName = usage.agentName || 'unknown'
    const existing = byAgent.get(agentName) || []
    existing.push(usage)
    byAgent.set(agentName, existing)
  }

  const summaries: UsageSummary[] = []

  for (const [agent, agentUsages] of byAgent) {
    const totalInputTokens = agentUsages.reduce((sum, u) => sum + u.inputTokens, 0)
    const totalOutputTokens = agentUsages.reduce((sum, u) => sum + u.outputTokens, 0)
    const totalCost = calculateTotalCost(agentUsages).totalCost

    summaries.push({
      model: agent, // reusing model field for agent name
      totalInputTokens,
      totalOutputTokens,
      totalCost,
      operationCount: agentUsages.length,
      averageInputTokens: Math.round(totalInputTokens / agentUsages.length),
      averageOutputTokens: Math.round(totalOutputTokens / agentUsages.length),
      averageCostPerOperation:
        Math.round((totalCost / agentUsages.length) * 1_000_000) / 1_000_000,
    })
  }

  return summaries.sort((a, b) => b.totalCost - a.totalCost)
}

/**
 * Check budget and generate alerts
 */
export function checkBudgetAlerts(
  currentCost: number,
  budget: BudgetConfig,
  period: 'daily' | 'weekly' | 'monthly'
): CostAlert[] {
  const alerts: CostAlert[] = []
  const budgetAmount = budget[period]

  if (!budgetAmount) {
    return alerts
  }

  const usagePercentage = (currentCost / budgetAmount) * 100

  for (const threshold of budget.alertThresholds) {
    if (usagePercentage >= threshold) {
      let severity: CostAlert['severity'] = 'info'
      if (threshold >= 90) severity = 'critical'
      else if (threshold >= 75) severity = 'warning'

      alerts.push({
        id: `budget-${period}-${threshold}`,
        type: 'budget',
        threshold,
        currentValue: usagePercentage,
        message: `${period.charAt(0).toUpperCase() + period.slice(1)} budget usage at ${usagePercentage.toFixed(1)}% ($${currentCost.toFixed(4)} of $${budgetAmount})`,
        severity,
        triggeredAt: new Date(),
      })
    }
  }

  // Return only the highest threshold alert
  return alerts.length > 0 ? [alerts[alerts.length - 1]] : []
}

/**
 * Detect cost spikes
 */
export function detectCostSpike(
  recentUsages: TokenUsage[],
  historicalAverage: number,
  spikeThreshold: number = 2.0 // 200% of average
): CostAlert | null {
  if (recentUsages.length === 0) return null

  const recentCost = calculateTotalCost(recentUsages).totalCost

  if (historicalAverage === 0) return null

  const ratio = recentCost / historicalAverage

  if (ratio >= spikeThreshold) {
    return {
      id: `spike-${Date.now()}`,
      type: 'spike',
      threshold: spikeThreshold * 100,
      currentValue: ratio * 100,
      message: `Cost spike detected: ${(ratio * 100).toFixed(0)}% of historical average`,
      severity: ratio >= 3 ? 'critical' : 'warning',
      triggeredAt: new Date(),
    }
  }

  return null
}

/**
 * Generate cost optimization suggestions
 */
export function generateOptimizationSuggestions(usages: TokenUsage[]): CostOptimizationSuggestion[] {
  const suggestions: CostOptimizationSuggestion[] = []
  const summaryByModel = getUsageSummaryByModel(usages)

  // Check for expensive model usage
  const expensiveModels = ['claude-opus-4', 'claude-3-opus', 'gpt-4', 'gpt-4-turbo']
  for (const summary of summaryByModel) {
    if (expensiveModels.includes(summary.model) && summary.operationCount > 10) {
      suggestions.push({
        id: `model-downgrade-${summary.model}`,
        title: `Consider using a smaller model instead of ${summary.model}`,
        description: `You have ${summary.operationCount} operations using ${summary.model}. For simpler tasks, consider using a smaller model like claude-3.5-sonnet or gpt-4o-mini.`,
        potentialSavings: 60,
        effort: 'low',
        category: 'model',
      })
    }
  }

  // Check for high token usage
  for (const summary of summaryByModel) {
    if (summary.averageInputTokens > 50000) {
      suggestions.push({
        id: `context-reduction-${summary.model}`,
        title: 'Reduce context size',
        description: `Average input tokens (${summary.averageInputTokens.toLocaleString()}) is high. Consider summarizing context or using retrieval-augmented generation.`,
        potentialSavings: 40,
        effort: 'medium',
        category: 'context',
      })
    }
  }

  // Check for repeated similar operations
  const operationTypes = new Map<string, number>()
  for (const usage of usages) {
    if (usage.operationType) {
      operationTypes.set(usage.operationType, (operationTypes.get(usage.operationType) || 0) + 1)
    }
  }

  for (const [opType, count] of operationTypes) {
    if (count > 20) {
      suggestions.push({
        id: `caching-${opType}`,
        title: `Implement caching for ${opType} operations`,
        description: `You have ${count} similar ${opType} operations. Consider caching results to reduce API calls.`,
        potentialSavings: 50,
        effort: 'medium',
        category: 'caching',
      })
    }
  }

  // Check for small batches
  const smallOperations = usages.filter((u) => u.inputTokens < 100 && u.outputTokens < 100)
  if (smallOperations.length > 50) {
    suggestions.push({
      id: 'batch-small-ops',
      title: 'Batch small operations',
      description: `You have ${smallOperations.length} small operations. Consider batching them to reduce API overhead.`,
      potentialSavings: 30,
      effort: 'high',
      category: 'batching',
    })
  }

  // Sort by potential savings
  return suggestions.sort((a, b) => b.potentialSavings - a.potentialSavings)
}

/**
 * Format cost for display
 */
export function formatCost(cost: number, decimals: number = 4): string {
  if (cost < 0.0001) {
    return `$${cost.toFixed(6)}`
  }
  return `$${cost.toFixed(decimals)}`
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return tokens.toString()
}

/**
 * Estimate cost for a planned operation
 */
export function estimateCost(
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number
): CostEstimate {
  return calculateCost({
    model,
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    timestamp: new Date(),
  })
}

/**
 * Compare costs between models
 */
export function compareCosts(
  inputTokens: number,
  outputTokens: number,
  models: string[]
): { model: string; cost: CostEstimate }[] {
  return models
    .map((model) => ({
      model,
      cost: estimateCost(model, inputTokens, outputTokens),
    }))
    .sort((a, b) => a.cost.totalCost - b.cost.totalCost)
}

/**
 * Get the most cost-effective model for given token counts
 */
export function getMostCostEffectiveModel(
  inputTokens: number,
  outputTokens: number,
  eligibleModels?: string[]
): { model: string; cost: CostEstimate } | null {
  const models = eligibleModels || Object.keys(MODEL_PRICING)
  const comparison = compareCosts(inputTokens, outputTokens, models)

  return comparison.length > 0 ? comparison[0] : null
}

/**
 * Cost Tracker class for managing usage history
 */
export class CostTracker {
  private usages: TokenUsage[] = []
  private config: CostTrackerConfig
  private alerts: CostAlert[] = []

  constructor(config?: Partial<CostTrackerConfig>) {
    this.config = {
      alertsEnabled: true,
      optimizationSuggestionsEnabled: true,
      trackingGranularity: 'operation',
      ...config,
    }

    log.info('CostTracker initialized', { config: this.config })
  }

  /**
   * Record a token usage
   */
  recordUsage(usage: Omit<TokenUsage, 'timestamp'>): CostEstimate {
    const fullUsage: TokenUsage = {
      ...usage,
      timestamp: new Date(),
    }

    this.usages.push(fullUsage)
    const cost = calculateCost(fullUsage)

    log.debug('Recorded token usage', {
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost: cost.totalCost,
    })

    // Check for alerts
    if (this.config.alertsEnabled && this.config.budget) {
      this.checkAlerts()
    }

    return cost
  }

  /**
   * Get all usages
   */
  getUsages(): TokenUsage[] {
    return [...this.usages]
  }

  /**
   * Get usages within a date range
   */
  getUsagesInRange(start: Date, end: Date): TokenUsage[] {
    return this.usages.filter((u) => u.timestamp >= start && u.timestamp <= end)
  }

  /**
   * Get today's usages
   */
  getTodaysUsages(): TokenUsage[] {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    return this.getUsagesInRange(today, tomorrow)
  }

  /**
   * Get total cost
   */
  getTotalCost(): CostEstimate {
    return calculateTotalCost(this.usages)
  }

  /**
   * Get summary by model
   */
  getSummaryByModel(): UsageSummary[] {
    return getUsageSummaryByModel(this.usages)
  }

  /**
   * Get summary by agent
   */
  getSummaryByAgent(): UsageSummary[] {
    return getUsageSummaryByAgent(this.usages)
  }

  /**
   * Check and generate alerts
   */
  checkAlerts(): CostAlert[] {
    if (!this.config.budget) return []

    const newAlerts: CostAlert[] = []

    // Check daily budget
    const todaysCost = calculateTotalCost(this.getTodaysUsages()).totalCost
    newAlerts.push(...checkBudgetAlerts(todaysCost, this.config.budget, 'daily'))

    // Check for cost spikes
    if (this.usages.length > 10) {
      const historicalCost = calculateTotalCost(this.usages.slice(0, -5)).totalCost
      const historicalAvg = historicalCost / Math.max(this.usages.length - 5, 1)
      const spike = detectCostSpike(this.usages.slice(-5), historicalAvg)
      if (spike) newAlerts.push(spike)
    }

    this.alerts = newAlerts

    for (const alert of newAlerts) {
      if (alert.severity === 'critical') {
        log.error('Critical cost alert', { alert })
      } else if (alert.severity === 'warning') {
        log.warn('Cost warning', { alert })
      } else {
        log.info('Cost info', { alert })
      }
    }

    return newAlerts
  }

  /**
   * Get current alerts
   */
  getAlerts(): CostAlert[] {
    return [...this.alerts]
  }

  /**
   * Get optimization suggestions
   */
  getOptimizationSuggestions(): CostOptimizationSuggestion[] {
    if (!this.config.optimizationSuggestionsEnabled) return []
    return generateOptimizationSuggestions(this.usages)
  }

  /**
   * Clear all usages
   */
  clear(): void {
    this.usages = []
    this.alerts = []
    log.info('CostTracker cleared')
  }

  /**
   * Export usages to JSON
   */
  exportToJson(): string {
    return JSON.stringify(
      {
        usages: this.usages,
        summary: {
          totalCost: this.getTotalCost(),
          byModel: this.getSummaryByModel(),
          byAgent: this.getSummaryByAgent(),
        },
        config: this.config,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    )
  }
}
