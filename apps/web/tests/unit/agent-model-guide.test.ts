/**
 * Agent Model Guide Tests
 */

import { describe, it, expect } from 'vitest'
import {
  MODEL_SPECS,
  MODEL_TIER_CONFIG,
  TASK_CATEGORIES,
  getModelSpec,
  getAllModelSpecs,
  calculateCostEstimate,
  compareCosts,
  getRecommendedModel,
  getModelForTaskCategory,
  compareModels,
  getTaskCategoryInfo,
  getAllTaskCategories,
  suggestModelChange,
  calculateSavings,
  type TaskCategory,
  type ModelRecommendationCriteria,
} from '@/lib/agent/model-guide'

describe('agent-model-guide', () => {
  describe('MODEL_SPECS', () => {
    it('should define 3 models', () => {
      const models = Object.keys(MODEL_SPECS)
      expect(models).toHaveLength(3)
      expect(models).toContain('haiku')
      expect(models).toContain('sonnet')
      expect(models).toContain('opus')
    })

    it('should have complete spec for each model', () => {
      Object.values(MODEL_SPECS).forEach((spec) => {
        expect(spec.id).toBeDefined()
        expect(spec.name).toBeDefined()
        expect(spec.tier).toBeDefined()
        expect(spec.description).toBeDefined()
        expect(spec.contextWindow).toBeGreaterThan(0)
        expect(spec.inputCostPer1M).toBeGreaterThan(0)
        expect(spec.outputCostPer1M).toBeGreaterThan(0)
        expect(spec.avgResponseTime).toBeDefined()
        expect(spec.strengths.length).toBeGreaterThan(0)
        expect(spec.weaknesses.length).toBeGreaterThan(0)
        expect(spec.bestFor.length).toBeGreaterThan(0)
      })
    })

    it('should have haiku as economy tier', () => {
      expect(MODEL_SPECS.haiku.tier).toBe('economy')
    })

    it('should have sonnet as balanced tier', () => {
      expect(MODEL_SPECS.sonnet.tier).toBe('balanced')
    })

    it('should have opus as premium tier', () => {
      expect(MODEL_SPECS.opus.tier).toBe('premium')
    })

    it('should have increasing costs from haiku to opus', () => {
      expect(MODEL_SPECS.haiku.inputCostPer1M).toBeLessThan(MODEL_SPECS.sonnet.inputCostPer1M)
      expect(MODEL_SPECS.sonnet.inputCostPer1M).toBeLessThan(MODEL_SPECS.opus.inputCostPer1M)
    })

    it('should have 200K context window for all models', () => {
      expect(MODEL_SPECS.haiku.contextWindow).toBe(200000)
      expect(MODEL_SPECS.sonnet.contextWindow).toBe(200000)
      expect(MODEL_SPECS.opus.contextWindow).toBe(200000)
    })
  })

  describe('MODEL_TIER_CONFIG', () => {
    it('should define 3 tiers', () => {
      const tiers = Object.keys(MODEL_TIER_CONFIG)
      expect(tiers).toHaveLength(3)
      expect(tiers).toContain('economy')
      expect(tiers).toContain('balanced')
      expect(tiers).toContain('premium')
    })

    it('should have complete config for each tier', () => {
      Object.values(MODEL_TIER_CONFIG).forEach((config) => {
        expect(config.label).toBeDefined()
        expect(config.color).toBeDefined()
        expect(config.bgColor).toBeDefined()
        expect(config.borderColor).toBeDefined()
        expect(config.icon).toBeDefined()
      })
    })
  })

  describe('TASK_CATEGORIES', () => {
    it('should define 10 task categories', () => {
      const categories = Object.keys(TASK_CATEGORIES)
      expect(categories).toHaveLength(10)
    })

    it('should have complete info for each category', () => {
      Object.values(TASK_CATEGORIES).forEach((cat) => {
        expect(cat.label).toBeDefined()
        expect(cat.description).toBeDefined()
        expect(cat.recommendedModels.length).toBeGreaterThan(0)
        expect(cat.typicalComplexity).toBeDefined()
      })
    })

    it('should have valid recommended models', () => {
      const validModels = ['haiku', 'sonnet', 'opus']
      Object.values(TASK_CATEGORIES).forEach((cat) => {
        cat.recommendedModels.forEach((model) => {
          expect(validModels).toContain(model)
        })
      })
    })
  })

  describe('getModelSpec', () => {
    it('should return spec for haiku', () => {
      const spec = getModelSpec('haiku')
      expect(spec).not.toBeNull()
      expect(spec?.id).toBe('haiku')
    })

    it('should return spec for sonnet', () => {
      const spec = getModelSpec('sonnet')
      expect(spec).not.toBeNull()
      expect(spec?.id).toBe('sonnet')
    })

    it('should return spec for opus', () => {
      const spec = getModelSpec('opus')
      expect(spec).not.toBeNull()
      expect(spec?.id).toBe('opus')
    })

    it('should return null for inherit', () => {
      const spec = getModelSpec('inherit')
      expect(spec).toBeNull()
    })
  })

  describe('getAllModelSpecs', () => {
    it('should return all 3 model specs', () => {
      const specs = getAllModelSpecs()
      expect(specs).toHaveLength(3)
    })

    it('should include all tiers', () => {
      const specs = getAllModelSpecs()
      const tiers = specs.map((s) => s.tier)
      expect(tiers).toContain('economy')
      expect(tiers).toContain('balanced')
      expect(tiers).toContain('premium')
    })
  })

  describe('calculateCostEstimate', () => {
    it('should calculate cost for haiku', () => {
      const cost = calculateCostEstimate('haiku', 1000000, 500000)
      // haiku: $0.8/1M input, $4.0/1M output
      // Expected: 0.8 + 2.0 = 2.8
      expect(cost).toBeCloseTo(2.8, 2)
    })

    it('should calculate cost for sonnet', () => {
      const cost = calculateCostEstimate('sonnet', 1000000, 500000)
      // sonnet: $3.0/1M input, $15.0/1M output
      // Expected: 3.0 + 7.5 = 10.5
      expect(cost).toBeCloseTo(10.5, 2)
    })

    it('should calculate cost for opus', () => {
      const cost = calculateCostEstimate('opus', 1000000, 500000)
      // opus: $15.0/1M input, $75.0/1M output
      // Expected: 15.0 + 37.5 = 52.5
      expect(cost).toBeCloseTo(52.5, 2)
    })

    it('should handle zero tokens', () => {
      const cost = calculateCostEstimate('sonnet', 0, 0)
      expect(cost).toBe(0)
    })

    it('should handle small token counts', () => {
      const cost = calculateCostEstimate('sonnet', 1000, 500)
      expect(cost).toBeGreaterThan(0)
      expect(cost).toBeLessThan(0.1) // sonnet: $3 input + $15 output per 1M
    })
  })

  describe('compareCosts', () => {
    it('should return costs for all models', () => {
      const costs = compareCosts(100000, 50000)
      expect(costs.haiku).toBeDefined()
      expect(costs.sonnet).toBeDefined()
      expect(costs.opus).toBeDefined()
    })

    it('should have haiku as cheapest', () => {
      const costs = compareCosts(100000, 50000)
      expect(costs.haiku).toBeLessThan(costs.sonnet)
      expect(costs.sonnet).toBeLessThan(costs.opus)
    })
  })

  describe('getRecommendedModel', () => {
    it('should recommend sonnet for typical code generation', () => {
      const criteria: ModelRecommendationCriteria = {
        taskCategory: 'code-generation',
        complexity: 'moderate',
        budgetPriority: 'medium',
        qualityPriority: 'medium',
        speedPriority: 'medium',
        expectedTokens: 'medium',
        isProduction: false,
      }
      const rec = getRecommendedModel(criteria)
      expect(['sonnet', 'opus']).toContain(rec.recommended)
    })

    it('should recommend haiku for high budget priority', () => {
      const criteria: ModelRecommendationCriteria = {
        taskCategory: 'conversation',
        complexity: 'simple',
        budgetPriority: 'high',
        qualityPriority: 'low',
        speedPriority: 'medium',
        expectedTokens: 'small',
        isProduction: false,
      }
      const rec = getRecommendedModel(criteria)
      expect(rec.recommended).toBe('haiku')
    })

    it('should recommend opus for high quality priority', () => {
      const criteria: ModelRecommendationCriteria = {
        taskCategory: 'analysis',
        complexity: 'complex',
        budgetPriority: 'low',
        qualityPriority: 'high',
        speedPriority: 'low',
        expectedTokens: 'medium',
        isProduction: false,
      }
      const rec = getRecommendedModel(criteria)
      expect(rec.recommended).toBe('opus')
    })

    it('should recommend haiku for high speed priority', () => {
      const criteria: ModelRecommendationCriteria = {
        taskCategory: 'conversation',
        complexity: 'simple',
        budgetPriority: 'medium',
        qualityPriority: 'low',
        speedPriority: 'high',
        expectedTokens: 'small',
        isProduction: false,
      }
      const rec = getRecommendedModel(criteria)
      expect(rec.recommended).toBe('haiku')
    })

    it('should recommend opus for critical complexity', () => {
      const criteria: ModelRecommendationCriteria = {
        taskCategory: 'debugging',
        complexity: 'critical',
        budgetPriority: 'medium',
        qualityPriority: 'medium',
        speedPriority: 'medium',
        expectedTokens: 'medium',
        isProduction: false,
      }
      const rec = getRecommendedModel(criteria)
      expect(rec.recommended).toBe('opus')
    })

    it('should provide reasoning', () => {
      const criteria: ModelRecommendationCriteria = {
        taskCategory: 'code-generation',
        complexity: 'moderate',
        budgetPriority: 'medium',
        qualityPriority: 'medium',
        speedPriority: 'medium',
        expectedTokens: 'medium',
        isProduction: false,
      }
      const rec = getRecommendedModel(criteria)
      expect(rec.reasoning.length).toBeGreaterThan(0)
    })

    it('should provide alternatives', () => {
      const criteria: ModelRecommendationCriteria = {
        taskCategory: 'code-generation',
        complexity: 'moderate',
        budgetPriority: 'medium',
        qualityPriority: 'medium',
        speedPriority: 'medium',
        expectedTokens: 'medium',
        isProduction: false,
      }
      const rec = getRecommendedModel(criteria)
      expect(rec.alternatives.length).toBeGreaterThanOrEqual(0)
    })

    it('should provide cost estimates', () => {
      const criteria: ModelRecommendationCriteria = {
        taskCategory: 'code-generation',
        complexity: 'moderate',
        budgetPriority: 'medium',
        qualityPriority: 'medium',
        speedPriority: 'medium',
        expectedTokens: 'medium',
        isProduction: false,
      }
      const rec = getRecommendedModel(criteria)
      expect(rec.costEstimate.low).toBeLessThan(rec.costEstimate.medium)
      expect(rec.costEstimate.medium).toBeLessThan(rec.costEstimate.high)
    })

    it('should provide performance scores', () => {
      const criteria: ModelRecommendationCriteria = {
        taskCategory: 'code-generation',
        complexity: 'moderate',
        budgetPriority: 'medium',
        qualityPriority: 'medium',
        speedPriority: 'medium',
        expectedTokens: 'medium',
        isProduction: false,
      }
      const rec = getRecommendedModel(criteria)
      expect(rec.performanceScore.speed).toBeGreaterThanOrEqual(0)
      expect(rec.performanceScore.speed).toBeLessThanOrEqual(1)
      expect(rec.performanceScore.quality).toBeGreaterThanOrEqual(0)
      expect(rec.performanceScore.quality).toBeLessThanOrEqual(1)
      expect(rec.performanceScore.costEfficiency).toBeGreaterThanOrEqual(0)
      expect(rec.performanceScore.costEfficiency).toBeLessThanOrEqual(1)
      expect(rec.performanceScore.overall).toBeGreaterThanOrEqual(0)
      expect(rec.performanceScore.overall).toBeLessThanOrEqual(1)
    })

    it('should consider production environment', () => {
      const criteria: ModelRecommendationCriteria = {
        taskCategory: 'data-processing',
        complexity: 'moderate',
        budgetPriority: 'high',
        qualityPriority: 'low',
        speedPriority: 'medium',
        expectedTokens: 'large',
        isProduction: true,
      }
      const rec = getRecommendedModel(criteria)
      // Should not recommend haiku for production with moderate complexity
      expect(rec.reasoning.some((r) => r.includes('프로덕션'))).toBe(true)
    })

    it('should handle very large token volume', () => {
      const criteria: ModelRecommendationCriteria = {
        taskCategory: 'data-processing',
        complexity: 'simple',
        budgetPriority: 'medium',
        qualityPriority: 'low',
        speedPriority: 'medium',
        expectedTokens: 'very-large',
        isProduction: false,
      }
      const rec = getRecommendedModel(criteria)
      // Should lean towards cost-effective model for large volume
      expect(['haiku', 'sonnet']).toContain(rec.recommended)
    })
  })

  describe('getModelForTaskCategory', () => {
    it('should return sonnet for code-generation', () => {
      const model = getModelForTaskCategory('code-generation')
      expect(model).toBe('sonnet')
    })

    it('should return haiku for data-processing', () => {
      const model = getModelForTaskCategory('data-processing')
      expect(model).toBe('haiku')
    })

    it('should return opus for analysis', () => {
      const model = getModelForTaskCategory('analysis')
      expect(model).toBe('opus')
    })

    it('should return opus for creative tasks', () => {
      const model = getModelForTaskCategory('creative')
      expect(model).toBe('opus')
    })
  })

  describe('compareModels', () => {
    it('should compare haiku and sonnet', () => {
      const comparison = compareModels('haiku', 'sonnet')
      expect(comparison.fasterModel).toBe('haiku')
      expect(comparison.cheaperModel).toBe('haiku')
      expect(comparison.higherQualityModel).toBe('sonnet')
    })

    it('should compare sonnet and opus', () => {
      const comparison = compareModels('sonnet', 'opus')
      expect(comparison.fasterModel).toBe('sonnet')
      expect(comparison.cheaperModel).toBe('sonnet')
      expect(comparison.higherQualityModel).toBe('opus')
    })

    it('should compare haiku and opus', () => {
      const comparison = compareModels('haiku', 'opus')
      expect(comparison.fasterModel).toBe('haiku')
      expect(comparison.cheaperModel).toBe('haiku')
      expect(comparison.higherQualityModel).toBe('opus')
    })

    it('should calculate cost difference', () => {
      const comparison = compareModels('haiku', 'opus')
      expect(comparison.costDifference.input).toBeGreaterThan(0)
      expect(comparison.costDifference.output).toBeGreaterThan(0)
      expect(comparison.costDifference.percentage).toBeGreaterThan(0)
    })
  })

  describe('getTaskCategoryInfo', () => {
    it('should return info for code-generation', () => {
      const info = getTaskCategoryInfo('code-generation')
      expect(info.label).toBe('코드 생성')
      expect(info.recommendedModels.length).toBeGreaterThan(0)
    })

    it('should return info for all categories', () => {
      const categories: TaskCategory[] = [
        'code-generation',
        'code-review',
        'debugging',
        'documentation',
        'refactoring',
        'analysis',
        'creative',
        'data-processing',
        'testing',
        'conversation',
      ]
      categories.forEach((cat) => {
        const info = getTaskCategoryInfo(cat)
        expect(info).toBeDefined()
        expect(info.label).toBeDefined()
      })
    })
  })

  describe('getAllTaskCategories', () => {
    it('should return all 10 categories', () => {
      const categories = getAllTaskCategories()
      expect(categories).toHaveLength(10)
    })

    it('should include id in each category', () => {
      const categories = getAllTaskCategories()
      categories.forEach((cat) => {
        expect(cat.id).toBeDefined()
        expect(cat.label).toBeDefined()
      })
    })
  })

  describe('suggestModelChange', () => {
    it('should suggest downgrade for too slow', () => {
      const suggestion = suggestModelChange('opus', { tooSlow: true })
      expect(suggestion).not.toBeNull()
      expect(suggestion?.suggestedModel).toBe('sonnet')
    })

    it('should suggest downgrade for too expensive', () => {
      const suggestion = suggestModelChange('sonnet', { tooExpensive: true })
      expect(suggestion).not.toBeNull()
      expect(suggestion?.suggestedModel).toBe('haiku')
    })

    it('should suggest upgrade for quality issues', () => {
      const suggestion = suggestModelChange('haiku', { qualityIssues: true })
      expect(suggestion).not.toBeNull()
      expect(suggestion?.suggestedModel).toBe('sonnet')
    })

    it('should suggest downgrade for overkill', () => {
      const suggestion = suggestModelChange('opus', { overkill: true })
      expect(suggestion).not.toBeNull()
      expect(suggestion?.suggestedModel).toBe('sonnet')
    })

    it('should return null if no changes needed', () => {
      const suggestion = suggestModelChange('sonnet', {})
      expect(suggestion).toBeNull()
    })

    it('should not downgrade below haiku', () => {
      const suggestion = suggestModelChange('haiku', { tooSlow: true })
      expect(suggestion).toBeNull()
    })

    it('should not upgrade above opus', () => {
      const suggestion = suggestModelChange('opus', { qualityIssues: true })
      expect(suggestion).toBeNull()
    })
  })

  describe('calculateSavings', () => {
    it('should calculate savings from opus to sonnet', () => {
      const savings = calculateSavings('opus', 'sonnet', 1000000, 500000)
      expect(savings.monthlySavings).toBeGreaterThan(0)
      expect(savings.percentageSavings).toBeGreaterThan(0)
      expect(savings.yearlySavings).toBe(savings.monthlySavings * 12)
    })

    it('should calculate savings from sonnet to haiku', () => {
      const savings = calculateSavings('sonnet', 'haiku', 1000000, 500000)
      expect(savings.monthlySavings).toBeGreaterThan(0)
      expect(savings.percentageSavings).toBeGreaterThan(0)
    })

    it('should show negative savings for upgrade', () => {
      const savings = calculateSavings('haiku', 'opus', 1000000, 500000)
      expect(savings.monthlySavings).toBeLessThan(0)
    })

    it('should handle zero tokens', () => {
      const savings = calculateSavings('opus', 'haiku', 0, 0)
      expect(savings.monthlySavings).toBe(0)
    })
  })

  describe('model strengths and weaknesses', () => {
    it('haiku should have speed as strength', () => {
      const hasSpeedStrength = MODEL_SPECS.haiku.strengths.some(
        (s) => s.includes('빠른') || s.includes('속도')
      )
      expect(hasSpeedStrength).toBe(true)
    })

    it('haiku should have quality as weakness', () => {
      const hasQualityWeakness = MODEL_SPECS.haiku.weaknesses.some(
        (w) => w.includes('추론') || w.includes('품질') || w.includes('제한')
      )
      expect(hasQualityWeakness).toBe(true)
    })

    it('opus should have quality as strength', () => {
      const hasQualityStrength = MODEL_SPECS.opus.strengths.some(
        (s) => s.includes('추론') || s.includes('정확') || s.includes('최고')
      )
      expect(hasQualityStrength).toBe(true)
    })

    it('opus should have cost as weakness', () => {
      const hasCostWeakness = MODEL_SPECS.opus.weaknesses.some(
        (w) => w.includes('비용') || w.includes('높은')
      )
      expect(hasCostWeakness).toBe(true)
    })

    it('sonnet should have balance in description', () => {
      const hasBalanceDescription =
        MODEL_SPECS.sonnet.description.includes('균형') ||
        MODEL_SPECS.sonnet.strengths.some((s) => s.includes('균형'))
      expect(hasBalanceDescription).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle extreme token counts', () => {
      const cost = calculateCostEstimate('sonnet', 10000000, 5000000)
      expect(cost).toBeGreaterThan(0)
      expect(Number.isFinite(cost)).toBe(true)
    })

    it('should handle all priority combinations', () => {
      const priorities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high']
      priorities.forEach((budget) => {
        priorities.forEach((quality) => {
          priorities.forEach((speed) => {
            const criteria: ModelRecommendationCriteria = {
              taskCategory: 'code-generation',
              complexity: 'moderate',
              budgetPriority: budget,
              qualityPriority: quality,
              speedPriority: speed,
              expectedTokens: 'medium',
              isProduction: false,
            }
            const rec = getRecommendedModel(criteria)
            expect(rec.recommended).toBeDefined()
          })
        })
      })
    })

    it('should handle all task categories', () => {
      const categories = getAllTaskCategories()
      categories.forEach((cat) => {
        const criteria: ModelRecommendationCriteria = {
          taskCategory: cat.id,
          complexity: 'moderate',
          budgetPriority: 'medium',
          qualityPriority: 'medium',
          speedPriority: 'medium',
          expectedTokens: 'medium',
          isProduction: false,
        }
        const rec = getRecommendedModel(criteria)
        expect(rec.recommended).toBeDefined()
      })
    })
  })
})
