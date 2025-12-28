'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  MODEL_SPECS,
  MODEL_TIER_CONFIG,
  TASK_CATEGORIES,
  getRecommendedModel,
  compareModels,
  calculateSavings,
  getAllTaskCategories,
  type ModelSpec,
  type TaskCategory,
  type TaskComplexity,
  type ModelRecommendationCriteria,
} from '@/lib/agent/model-guide'
import { AgentModel } from '@/lib/types'

interface AgentModelGuideProps {
  onSelect?: (model: AgentModel) => void
  currentModel?: AgentModel
  showComparison?: boolean
  showCalculator?: boolean
}

export function AgentModelGuide({
  onSelect,
  currentModel,
  showComparison = true,
  showCalculator = true,
}: AgentModelGuideProps) {
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | null>(null)
  const [complexity, setComplexity] = useState<TaskComplexity>('moderate')
  const [budgetPriority, setBudgetPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [qualityPriority, setQualityPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [speedPriority, setSpeedPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [expectedTokens, setExpectedTokens] = useState<'small' | 'medium' | 'large' | 'very-large'>(
    'medium'
  )
  const [isProduction, setIsProduction] = useState(false)

  const recommendation = useMemo(() => {
    if (!selectedCategory) return null
    const criteria: ModelRecommendationCriteria = {
      taskCategory: selectedCategory,
      complexity,
      budgetPriority,
      qualityPriority,
      speedPriority,
      expectedTokens,
      isProduction,
    }
    return getRecommendedModel(criteria)
  }, [
    selectedCategory,
    complexity,
    budgetPriority,
    qualityPriority,
    speedPriority,
    expectedTokens,
    isProduction,
  ])

  const handleSelectModel = useCallback(
    (model: AgentModel) => {
      onSelect?.(model)
    },
    [onSelect]
  )

  return (
    <div className="space-y-8">
      {/* Model Comparison Table */}
      {showComparison && <ModelComparisonTable currentModel={currentModel} onSelect={handleSelectModel} />}

      {/* Interactive Recommender */}
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 className="text-xl font-bold text-white mb-6">모델 추천 받기</h2>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Task Category Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">작업 유형</label>
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value as TaskCategory)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">선택하세요</option>
              {getAllTaskCategories().map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Complexity */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">작업 복잡도</label>
            <select
              value={complexity}
              onChange={(e) => setComplexity(e.target.value as TaskComplexity)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="simple">간단</option>
              <option value="moderate">보통</option>
              <option value="complex">복잡</option>
              <option value="critical">매우 중요</option>
            </select>
          </div>

          {/* Priority Sliders */}
          <PrioritySelector
            label="비용 우선순위"
            value={budgetPriority}
            onChange={setBudgetPriority}
            lowLabel="품질 우선"
            highLabel="비용 절감"
          />

          <PrioritySelector
            label="품질 우선순위"
            value={qualityPriority}
            onChange={setQualityPriority}
            lowLabel="적당한 품질"
            highLabel="최고 품질"
          />

          <PrioritySelector
            label="속도 우선순위"
            value={speedPriority}
            onChange={setSpeedPriority}
            lowLabel="느려도 괜찮음"
            highLabel="빠른 응답"
          />

          {/* Expected Tokens */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">예상 토큰 사용량</label>
            <select
              value={expectedTokens}
              onChange={(e) =>
                setExpectedTokens(e.target.value as 'small' | 'medium' | 'large' | 'very-large')
              }
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="small">적음 (~3K)</option>
              <option value="medium">보통 (~15K)</option>
              <option value="large">많음 (~70K)</option>
              <option value="very-large">매우 많음 (~200K)</option>
            </select>
          </div>

          {/* Production Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isProduction"
              checked={isProduction}
              onChange={(e) => setIsProduction(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <label htmlFor="isProduction" className="text-sm text-gray-300">
              프로덕션 환경
            </label>
          </div>
        </div>

        {/* Recommendation Result */}
        {recommendation && (
          <RecommendationResult
            recommendation={recommendation}
            onSelect={handleSelectModel}
          />
        )}
      </div>

      {/* Cost Calculator */}
      {showCalculator && <CostCalculator />}
    </div>
  )
}

// Priority selector component
function PrioritySelector({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  label: string
  value: 'low' | 'medium' | 'high'
  onChange: (value: 'low' | 'medium' | 'high') => void
  lowLabel: string
  highLabel: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{lowLabel}</span>
        <div className="flex flex-1 gap-1">
          {(['low', 'medium', 'high'] as const).map((level) => (
            <button
              key={level}
              onClick={() => onChange(level)}
              className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                value === level
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
              }`}
            >
              {level === 'low' ? '낮음' : level === 'medium' ? '보통' : '높음'}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{highLabel}</span>
      </div>
    </div>
  )
}

// Model comparison table
function ModelComparisonTable({
  currentModel,
  onSelect,
}: {
  currentModel?: AgentModel
  onSelect: (model: AgentModel) => void
}) {
  const models = Object.values(MODEL_SPECS)

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">모델 비교표</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">모델</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">티어</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                입력 비용
                <br />
                <span className="text-xs text-gray-500">(/1M tokens)</span>
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                출력 비용
                <br />
                <span className="text-xs text-gray-500">(/1M tokens)</span>
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">응답 시간</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">추천 작업</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-300"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {models.map((model) => {
              const tierConfig = MODEL_TIER_CONFIG[model.tier]
              const isSelected = currentModel === model.id
              return (
                <tr
                  key={model.id}
                  className={`${isSelected ? 'bg-blue-500/10' : 'hover:bg-gray-700/50'}`}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{tierConfig.icon}</span>
                      <div>
                        <p className="font-medium text-white">{model.name}</p>
                        <p className="text-xs text-gray-400">{model.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${tierConfig.bgColor} ${tierConfig.color}`}
                    >
                      {tierConfig.label}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-white font-mono">${model.inputCostPer1M}</td>
                  <td className="px-4 py-4 text-white font-mono">${model.outputCostPer1M}</td>
                  <td className="px-4 py-4 text-gray-300">{model.avgResponseTime}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {model.bestFor.slice(0, 3).map((task) => (
                        <span
                          key={task}
                          className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300"
                        >
                          {TASK_CATEGORIES[task].label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => onSelect(model.id)}
                      className={`rounded px-3 py-1 text-sm font-medium ${
                        isSelected
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                      }`}
                    >
                      {isSelected ? '선택됨' : '선택'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Recommendation result component
function RecommendationResult({
  recommendation,
  onSelect,
}: {
  recommendation: ReturnType<typeof getRecommendedModel>
  onSelect: (model: AgentModel) => void
}) {
  const recommendedSpec = MODEL_SPECS[recommendation.recommended as keyof typeof MODEL_SPECS]
  const tierConfig = recommendedSpec ? MODEL_TIER_CONFIG[recommendedSpec.tier] : null

  return (
    <div className="mt-6 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        {tierConfig?.icon} 추천 모델: {recommendedSpec?.name}
      </h3>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Reasoning */}
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">추천 이유</h4>
          <ul className="space-y-1 text-sm text-gray-400">
            {recommendation.reasoning.map((reason, i) => (
              <li key={i}>• {reason}</li>
            ))}
          </ul>
        </div>

        {/* Performance Score */}
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">성능 점수</h4>
          <div className="space-y-2">
            <ScoreBar label="속도" value={recommendation.performanceScore.speed} />
            <ScoreBar label="품질" value={recommendation.performanceScore.quality} />
            <ScoreBar label="비용 효율" value={recommendation.performanceScore.costEfficiency} />
            <ScoreBar
              label="종합"
              value={recommendation.performanceScore.overall}
              highlight
            />
          </div>
        </div>
      </div>

      {/* Cost Estimate */}
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-300 mb-2">예상 비용 비교</h4>
        <div className="flex gap-4 text-sm">
          <div className="rounded bg-green-500/20 px-3 py-1 text-green-400">
            Haiku: ${recommendation.costEstimate.low.toFixed(4)}
          </div>
          <div className="rounded bg-blue-500/20 px-3 py-1 text-blue-400">
            Sonnet: ${recommendation.costEstimate.medium.toFixed(4)}
          </div>
          <div className="rounded bg-purple-500/20 px-3 py-1 text-purple-400">
            Opus: ${recommendation.costEstimate.high.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Alternatives */}
      {recommendation.alternatives.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">대안 모델</h4>
          <div className="flex gap-2">
            {recommendation.alternatives.map((alt) => {
              const altSpec = MODEL_SPECS[alt as keyof typeof MODEL_SPECS]
              return (
                <button
                  key={alt}
                  onClick={() => onSelect(alt)}
                  className="rounded bg-gray-600 px-3 py-1 text-sm text-gray-200 hover:bg-gray-500"
                >
                  {altSpec?.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Select Button */}
      <button
        onClick={() => onSelect(recommendation.recommended)}
        className="mt-4 w-full rounded-lg bg-blue-500 py-2 font-medium text-white hover:bg-blue-600"
      >
        {recommendedSpec?.name} 선택하기
      </button>
    </div>
  )
}

// Score bar component
function ScoreBar({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  const percentage = Math.round(value * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-xs text-gray-400">{label}</span>
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${highlight ? 'bg-blue-500' : 'bg-gray-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`w-8 text-xs ${highlight ? 'text-blue-400' : 'text-gray-400'}`}>
        {percentage}%
      </span>
    </div>
  )
}

// Cost calculator component
function CostCalculator() {
  const [inputTokens, setInputTokens] = useState(10000)
  const [outputTokens, setOutputTokens] = useState(5000)
  const [usesPerMonth, setUsesPerMonth] = useState(100)

  const costs = useMemo(() => {
    const totalInput = inputTokens * usesPerMonth
    const totalOutput = outputTokens * usesPerMonth

    return {
      haiku: {
        perUse:
          (inputTokens / 1000000) * MODEL_SPECS.haiku.inputCostPer1M +
          (outputTokens / 1000000) * MODEL_SPECS.haiku.outputCostPer1M,
        monthly:
          (totalInput / 1000000) * MODEL_SPECS.haiku.inputCostPer1M +
          (totalOutput / 1000000) * MODEL_SPECS.haiku.outputCostPer1M,
      },
      sonnet: {
        perUse:
          (inputTokens / 1000000) * MODEL_SPECS.sonnet.inputCostPer1M +
          (outputTokens / 1000000) * MODEL_SPECS.sonnet.outputCostPer1M,
        monthly:
          (totalInput / 1000000) * MODEL_SPECS.sonnet.inputCostPer1M +
          (totalOutput / 1000000) * MODEL_SPECS.sonnet.outputCostPer1M,
      },
      opus: {
        perUse:
          (inputTokens / 1000000) * MODEL_SPECS.opus.inputCostPer1M +
          (outputTokens / 1000000) * MODEL_SPECS.opus.outputCostPer1M,
        monthly:
          (totalInput / 1000000) * MODEL_SPECS.opus.inputCostPer1M +
          (totalOutput / 1000000) * MODEL_SPECS.opus.outputCostPer1M,
      },
    }
  }, [inputTokens, outputTokens, usesPerMonth])

  const savings = useMemo(() => {
    return calculateSavings(
      'opus',
      'sonnet',
      inputTokens * usesPerMonth,
      outputTokens * usesPerMonth
    )
  }, [inputTokens, outputTokens, usesPerMonth])

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
      <h2 className="text-xl font-bold text-white mb-6">비용 계산기</h2>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            입력 토큰 (회당)
          </label>
          <input
            type="number"
            value={inputTokens}
            onChange={(e) => setInputTokens(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            출력 토큰 (회당)
          </label>
          <input
            type="number"
            value={outputTokens}
            onChange={(e) => setOutputTokens(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">월 사용 횟수</label>
          <input
            type="number"
            value={usesPerMonth}
            onChange={(e) => setUsesPerMonth(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Cost Comparison */}
      <div className="grid gap-4 md:grid-cols-3">
        {(['haiku', 'sonnet', 'opus'] as const).map((model) => {
          const spec = MODEL_SPECS[model]
          const tierConfig = MODEL_TIER_CONFIG[spec.tier]
          const cost = costs[model]
          return (
            <div
              key={model}
              className={`rounded-lg border p-4 ${tierConfig.borderColor} ${tierConfig.bgColor}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{tierConfig.icon}</span>
                <span className={`font-semibold ${tierConfig.color}`}>{spec.name}</span>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-gray-600">
                  회당: <span className="font-mono">${cost.perUse.toFixed(4)}</span>
                </p>
                <p className="text-gray-600">
                  월: <span className="font-mono font-bold">${cost.monthly.toFixed(2)}</span>
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Savings Info */}
      <div className="mt-4 rounded bg-green-500/10 p-3 text-sm text-green-400">
        💡 Opus → Sonnet 전환 시 월 ${savings.monthlySavings.toFixed(2)} 절약 (
        {savings.percentageSavings.toFixed(1)}%), 연 ${savings.yearlySavings.toFixed(2)} 절약
      </div>
    </div>
  )
}

// Simple model display component
export function ModelDisplay({ model }: { model: AgentModel }) {
  if (model === 'inherit') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-gray-600 px-2 py-0.5 text-sm text-gray-300">
        상속
      </span>
    )
  }

  const spec = MODEL_SPECS[model]
  const tierConfig = MODEL_TIER_CONFIG[spec.tier]

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm ${tierConfig.bgColor} ${tierConfig.color}`}
    >
      {tierConfig.icon} {spec.name}
    </span>
  )
}

// Export sub-components
export { ModelComparisonTable, CostCalculator }
