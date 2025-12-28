/**
 * Agent Model Selection Guide
 *
 * Provides guidance for selecting the optimal Claude model for agents:
 * - Model comparison (sonnet/opus/haiku)
 * - Task type recommendations
 * - Cost vs performance analysis
 * - Automatic model recommendations
 */

import { AgentModel } from './types'

/**
 * Model tier for categorization
 */
export type ModelTier = 'economy' | 'balanced' | 'premium'

/**
 * Task complexity level
 */
export type TaskComplexity = 'simple' | 'moderate' | 'complex' | 'critical'

/**
 * Task category
 */
export type TaskCategory =
  | 'code-generation'
  | 'code-review'
  | 'debugging'
  | 'documentation'
  | 'refactoring'
  | 'analysis'
  | 'creative'
  | 'data-processing'
  | 'testing'
  | 'conversation'

/**
 * Model specifications
 */
export interface ModelSpec {
  id: AgentModel
  name: string
  tier: ModelTier
  description: string
  contextWindow: number
  inputCostPer1M: number
  outputCostPer1M: number
  avgResponseTime: string
  strengths: string[]
  weaknesses: string[]
  bestFor: TaskCategory[]
  notRecommendedFor: TaskCategory[]
}

/**
 * Model comparison result
 */
export interface ModelComparison {
  recommended: AgentModel
  alternatives: AgentModel[]
  reasoning: string[]
  costEstimate: {
    low: number
    medium: number
    high: number
  }
  performanceScore: {
    speed: number
    quality: number
    costEfficiency: number
    overall: number
  }
}

/**
 * Recommendation criteria
 */
export interface ModelRecommendationCriteria {
  taskCategory: TaskCategory
  complexity: TaskComplexity
  budgetPriority: 'low' | 'medium' | 'high'
  qualityPriority: 'low' | 'medium' | 'high'
  speedPriority: 'low' | 'medium' | 'high'
  expectedTokens: 'small' | 'medium' | 'large' | 'very-large'
  isProduction: boolean
}

/**
 * Claude model specifications
 */
export const MODEL_SPECS: Record<Exclude<AgentModel, 'inherit'>, ModelSpec> = {
  haiku: {
    id: 'haiku',
    name: 'Claude 3.5 Haiku',
    tier: 'economy',
    description:
      '가장 빠르고 경제적인 모델. 간단한 작업과 대량 처리에 적합합니다.',
    contextWindow: 200000,
    inputCostPer1M: 0.8,
    outputCostPer1M: 4.0,
    avgResponseTime: '< 1초',
    strengths: [
      '매우 빠른 응답 속도',
      '가장 낮은 비용',
      '대량 처리에 효율적',
      '간단한 작업에 충분한 성능',
      '낮은 지연 시간',
    ],
    weaknesses: [
      '복잡한 추론 능력 제한',
      '창의적 작업에서 품질 저하',
      '긴 코드 생성 시 일관성 부족',
      '미묘한 뉘앙스 이해 부족',
    ],
    bestFor: ['data-processing', 'conversation', 'testing'],
    notRecommendedFor: ['code-generation', 'creative', 'analysis'],
  },
  sonnet: {
    id: 'sonnet',
    name: 'Claude Sonnet 4',
    tier: 'balanced',
    description:
      '성능과 비용의 균형이 잡힌 모델. 대부분의 작업에 권장됩니다.',
    contextWindow: 200000,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    avgResponseTime: '1-3초',
    strengths: [
      '뛰어난 코딩 능력',
      '비용 대비 우수한 성능',
      '다양한 작업 처리 가능',
      '일관된 품질',
      '합리적인 응답 속도',
    ],
    weaknesses: [
      'Opus 대비 추론 깊이 부족',
      '매우 복잡한 작업에서 한계',
      '창의적 작업에서 Opus보다 다양성 부족',
    ],
    bestFor: [
      'code-generation',
      'code-review',
      'debugging',
      'refactoring',
      'documentation',
      'testing',
    ],
    notRecommendedFor: [],
  },
  opus: {
    id: 'opus',
    name: 'Claude Opus 4',
    tier: 'premium',
    description:
      '가장 강력한 모델. 복잡한 추론과 창의적 작업에 최적화되어 있습니다.',
    contextWindow: 200000,
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
    avgResponseTime: '3-10초',
    strengths: [
      '최고 수준의 추론 능력',
      '복잡한 문제 해결',
      '창의적이고 뉘앙스 있는 출력',
      '긴 문맥 이해력',
      '가장 정확한 결과',
    ],
    weaknesses: [
      '가장 높은 비용',
      '느린 응답 속도',
      '간단한 작업에는 과잉',
      '대량 처리에 비효율적',
    ],
    bestFor: ['analysis', 'creative', 'debugging'],
    notRecommendedFor: ['data-processing', 'conversation'],
  },
}

/**
 * Task category specifications
 */
export const TASK_CATEGORIES: Record<
  TaskCategory,
  {
    label: string
    description: string
    recommendedModels: AgentModel[]
    typicalComplexity: TaskComplexity
  }
> = {
  'code-generation': {
    label: '코드 생성',
    description: '새로운 기능, 컴포넌트, API 엔드포인트 생성',
    recommendedModels: ['sonnet', 'opus'],
    typicalComplexity: 'moderate',
  },
  'code-review': {
    label: '코드 리뷰',
    description: '코드 품질, 버그, 보안 취약점 검토',
    recommendedModels: ['sonnet'],
    typicalComplexity: 'moderate',
  },
  debugging: {
    label: '디버깅',
    description: '버그 원인 분석 및 수정',
    recommendedModels: ['sonnet', 'opus'],
    typicalComplexity: 'complex',
  },
  documentation: {
    label: '문서화',
    description: 'README, API 문서, 주석 작성',
    recommendedModels: ['sonnet', 'haiku'],
    typicalComplexity: 'simple',
  },
  refactoring: {
    label: '리팩토링',
    description: '코드 구조 개선, 패턴 적용',
    recommendedModels: ['sonnet'],
    typicalComplexity: 'moderate',
  },
  analysis: {
    label: '분석',
    description: '아키텍처, 성능, 보안 분석',
    recommendedModels: ['opus', 'sonnet'],
    typicalComplexity: 'complex',
  },
  creative: {
    label: '창의적 작업',
    description: '새로운 아이디어, 설계, 솔루션 제안',
    recommendedModels: ['opus'],
    typicalComplexity: 'complex',
  },
  'data-processing': {
    label: '데이터 처리',
    description: '대량 데이터 변환, 포맷팅',
    recommendedModels: ['haiku', 'sonnet'],
    typicalComplexity: 'simple',
  },
  testing: {
    label: '테스트 작성',
    description: '단위 테스트, 통합 테스트 생성',
    recommendedModels: ['sonnet'],
    typicalComplexity: 'moderate',
  },
  conversation: {
    label: '대화',
    description: '질문 응답, 설명, 가이드',
    recommendedModels: ['haiku', 'sonnet'],
    typicalComplexity: 'simple',
  },
}

/**
 * Get model spec
 */
export function getModelSpec(model: AgentModel): ModelSpec | null {
  if (model === 'inherit') return null
  return MODEL_SPECS[model]
}

/**
 * Get all model specs
 */
export function getAllModelSpecs(): ModelSpec[] {
  return Object.values(MODEL_SPECS)
}

/**
 * Calculate cost estimate for a task
 */
export function calculateCostEstimate(
  model: Exclude<AgentModel, 'inherit'>,
  inputTokens: number,
  outputTokens: number
): number {
  const spec = MODEL_SPECS[model]
  const inputCost = (inputTokens / 1000000) * spec.inputCostPer1M
  const outputCost = (outputTokens / 1000000) * spec.outputCostPer1M
  return inputCost + outputCost
}

/**
 * Compare costs between models
 */
export function compareCosts(
  inputTokens: number,
  outputTokens: number
): Record<Exclude<AgentModel, 'inherit'>, number> {
  return {
    haiku: calculateCostEstimate('haiku', inputTokens, outputTokens),
    sonnet: calculateCostEstimate('sonnet', inputTokens, outputTokens),
    opus: calculateCostEstimate('opus', inputTokens, outputTokens),
  }
}

/**
 * Get recommended model based on criteria
 */
export function getRecommendedModel(criteria: ModelRecommendationCriteria): ModelComparison {
  const reasoning: string[] = []
  let recommended: AgentModel = 'sonnet'
  const alternatives: AgentModel[] = []

  // Task category weight
  const categoryInfo = TASK_CATEGORIES[criteria.taskCategory]
  reasoning.push(`작업 유형: ${categoryInfo.label}`)

  // Complexity weight
  if (criteria.complexity === 'critical' || criteria.complexity === 'complex') {
    if (!alternatives.includes('opus')) alternatives.push('opus')
    if (criteria.complexity === 'critical') {
      recommended = 'opus'
      reasoning.push('높은 복잡도로 인해 Opus 권장')
    }
  }

  if (criteria.complexity === 'simple') {
    if (!alternatives.includes('haiku')) alternatives.push('haiku')
    reasoning.push('간단한 작업으로 Haiku도 고려 가능')
  }

  // Budget priority
  if (criteria.budgetPriority === 'high') {
    if (criteria.complexity !== 'critical') {
      recommended = 'haiku'
      reasoning.push('비용 우선으로 Haiku 권장')
    } else {
      reasoning.push('비용 우선이지만 복잡도로 인해 Opus 유지')
    }
  }

  // Quality priority
  if (criteria.qualityPriority === 'high') {
    if (recommended !== 'opus') {
      alternatives.unshift(recommended)
      recommended = 'opus'
      reasoning.push('품질 우선으로 Opus 권장')
    }
  }

  // Speed priority
  if (criteria.speedPriority === 'high') {
    if (criteria.qualityPriority !== 'high') {
      if (recommended !== 'haiku') {
        alternatives.unshift(recommended)
        recommended = 'haiku'
        reasoning.push('속도 우선으로 Haiku 권장')
      }
    } else {
      reasoning.push('속도 우선이지만 품질 요구로 인해 현재 모델 유지')
    }
  }

  // Production environment
  if (criteria.isProduction) {
    if (recommended === 'haiku' && criteria.complexity !== 'simple') {
      recommended = 'sonnet'
      reasoning.push('프로덕션 환경에서 안정성을 위해 Sonnet 권장')
    }
    reasoning.push('프로덕션 환경 고려')
  }

  // Token volume
  if (criteria.expectedTokens === 'very-large') {
    if (criteria.qualityPriority !== 'high' && recommended !== 'haiku') {
      alternatives.unshift(recommended)
      recommended = 'haiku'
      reasoning.push('대량 토큰 처리로 비용 효율적인 Haiku 권장')
    }
  }

  // Calculate performance scores
  const performanceScore = calculatePerformanceScore(recommended, criteria)

  // Cost estimate based on expected tokens
  const tokenEstimates = {
    small: { input: 2000, output: 1000 },
    medium: { input: 10000, output: 5000 },
    large: { input: 50000, output: 20000 },
    'very-large': { input: 150000, output: 50000 },
  }

  const tokens = tokenEstimates[criteria.expectedTokens]
  const costs = compareCosts(tokens.input, tokens.output)

  // Ensure recommended is not in alternatives
  const filteredAlternatives = alternatives.filter((a) => a !== recommended)

  // Add default alternatives if needed
  if (filteredAlternatives.length === 0) {
    if (recommended !== 'sonnet') filteredAlternatives.push('sonnet')
    if (recommended !== 'opus' && criteria.complexity !== 'simple')
      filteredAlternatives.push('opus')
    if (recommended !== 'haiku' && criteria.complexity === 'simple')
      filteredAlternatives.push('haiku')
  }

  return {
    recommended,
    alternatives: filteredAlternatives.slice(0, 2),
    reasoning,
    costEstimate: {
      low: costs.haiku,
      medium: costs.sonnet,
      high: costs.opus,
    },
    performanceScore,
  }
}

/**
 * Calculate performance score for a model given criteria
 */
function calculatePerformanceScore(
  model: AgentModel,
  criteria: ModelRecommendationCriteria
): ModelComparison['performanceScore'] {
  if (model === 'inherit') {
    return { speed: 0.5, quality: 0.5, costEfficiency: 0.5, overall: 0.5 }
  }

  const spec = MODEL_SPECS[model]

  // Base scores by tier
  const tierScores = {
    economy: { speed: 1.0, quality: 0.6, costEfficiency: 1.0 },
    balanced: { speed: 0.7, quality: 0.8, costEfficiency: 0.7 },
    premium: { speed: 0.4, quality: 1.0, costEfficiency: 0.3 },
  }

  const base = tierScores[spec.tier]

  // Adjust for task category fit
  let qualityAdjustment = 0
  if (spec.bestFor.includes(criteria.taskCategory)) {
    qualityAdjustment = 0.1
  }
  if (spec.notRecommendedFor.includes(criteria.taskCategory)) {
    qualityAdjustment = -0.2
  }

  const speed = base.speed
  const quality = Math.min(1, Math.max(0, base.quality + qualityAdjustment))
  const costEfficiency = base.costEfficiency

  // Calculate overall based on priorities
  const priorityWeights = { low: 0.2, medium: 0.35, high: 0.5 }
  const speedWeight = priorityWeights[criteria.speedPriority]
  const qualityWeight = priorityWeights[criteria.qualityPriority]
  const costWeight = priorityWeights[criteria.budgetPriority]
  const totalWeight = speedWeight + qualityWeight + costWeight

  const overall =
    (speed * speedWeight + quality * qualityWeight + costEfficiency * costWeight) / totalWeight

  return {
    speed: Math.round(speed * 100) / 100,
    quality: Math.round(quality * 100) / 100,
    costEfficiency: Math.round(costEfficiency * 100) / 100,
    overall: Math.round(overall * 100) / 100,
  }
}

/**
 * Get model for task category
 */
export function getModelForTaskCategory(category: TaskCategory): AgentModel {
  const categoryInfo = TASK_CATEGORIES[category]
  return categoryInfo.recommendedModels[0] || 'sonnet'
}

/**
 * Compare two models
 */
export function compareModels(
  model1: Exclude<AgentModel, 'inherit'>,
  model2: Exclude<AgentModel, 'inherit'>
): {
  fasterModel: AgentModel
  cheaperModel: AgentModel
  higherQualityModel: AgentModel
  costDifference: {
    input: number
    output: number
    percentage: number
  }
} {
  const spec1 = MODEL_SPECS[model1]
  const spec2 = MODEL_SPECS[model2]

  const tierOrder = { economy: 0, balanced: 1, premium: 2 }
  const tier1 = tierOrder[spec1.tier]
  const tier2 = tierOrder[spec2.tier]

  return {
    fasterModel: tier1 < tier2 ? model1 : model2,
    cheaperModel: spec1.inputCostPer1M < spec2.inputCostPer1M ? model1 : model2,
    higherQualityModel: tier1 > tier2 ? model1 : model2,
    costDifference: {
      input: Math.abs(spec1.inputCostPer1M - spec2.inputCostPer1M),
      output: Math.abs(spec1.outputCostPer1M - spec2.outputCostPer1M),
      percentage:
        tier1 > tier2
          ? ((spec1.inputCostPer1M - spec2.inputCostPer1M) / spec2.inputCostPer1M) * 100
          : ((spec2.inputCostPer1M - spec1.inputCostPer1M) / spec1.inputCostPer1M) * 100,
    },
  }
}

/**
 * Get task category info
 */
export function getTaskCategoryInfo(category: TaskCategory) {
  return TASK_CATEGORIES[category]
}

/**
 * Get all task categories
 */
export function getAllTaskCategories() {
  return Object.entries(TASK_CATEGORIES).map(([id, info]) => ({
    id: id as TaskCategory,
    ...info,
  }))
}

/**
 * Suggest model upgrade or downgrade
 */
export function suggestModelChange(
  currentModel: Exclude<AgentModel, 'inherit'>,
  feedback: {
    tooSlow?: boolean
    tooExpensive?: boolean
    qualityIssues?: boolean
    overkill?: boolean
  }
): {
  suggestedModel: AgentModel
  reason: string
} | null {
  const tierOrder: Exclude<AgentModel, 'inherit'>[] = ['haiku', 'sonnet', 'opus']
  const currentIndex = tierOrder.indexOf(currentModel)

  if (feedback.tooSlow && currentIndex > 0) {
    return {
      suggestedModel: tierOrder[currentIndex - 1],
      reason: '더 빠른 응답을 위해 하위 모델로 변경 권장',
    }
  }

  if (feedback.tooExpensive && currentIndex > 0) {
    return {
      suggestedModel: tierOrder[currentIndex - 1],
      reason: '비용 절감을 위해 하위 모델로 변경 권장',
    }
  }

  if (feedback.qualityIssues && currentIndex < 2) {
    return {
      suggestedModel: tierOrder[currentIndex + 1],
      reason: '품질 향상을 위해 상위 모델로 변경 권장',
    }
  }

  if (feedback.overkill && currentIndex > 0) {
    return {
      suggestedModel: tierOrder[currentIndex - 1],
      reason: '현재 작업에 과도한 성능. 하위 모델로도 충분',
    }
  }

  return null
}

/**
 * Get cost savings by downgrading
 */
export function calculateSavings(
  fromModel: Exclude<AgentModel, 'inherit'>,
  toModel: Exclude<AgentModel, 'inherit'>,
  monthlyInputTokens: number,
  monthlyOutputTokens: number
): {
  monthlySavings: number
  percentageSavings: number
  yearlySavings: number
} {
  const fromCost = calculateCostEstimate(fromModel, monthlyInputTokens, monthlyOutputTokens)
  const toCost = calculateCostEstimate(toModel, monthlyInputTokens, monthlyOutputTokens)

  const monthlySavings = fromCost - toCost
  const percentageSavings = fromCost > 0 ? (monthlySavings / fromCost) * 100 : 0
  const yearlySavings = monthlySavings * 12

  return {
    monthlySavings: Math.round(monthlySavings * 100) / 100,
    percentageSavings: Math.round(percentageSavings * 10) / 10,
    yearlySavings: Math.round(yearlySavings * 100) / 100,
  }
}

/**
 * Model tier labels and colors
 */
export const MODEL_TIER_CONFIG: Record<
  ModelTier,
  {
    label: string
    color: string
    bgColor: string
    borderColor: string
    icon: string
  }
> = {
  economy: {
    label: '경제적',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: '💚',
  },
  balanced: {
    label: '균형',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: '💙',
  },
  premium: {
    label: '프리미엄',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    icon: '💜',
  },
}
