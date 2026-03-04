/**
 * Agent model guide section component
 *
 * Collapsible guide section showing Claude model comparison,
 * task-based recommendations, and cost visualization.
 */
'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  MODEL_SPECS,
  MODEL_TIER_CONFIG,
  TASK_CATEGORIES,
  type TaskCategory,
} from '@/lib/agent/model-guide'
import { AgentModel } from '@/lib/core/types'

/** Props for AgentModelGuideSection component */
interface AgentModelGuideSectionProps {
  /** Currently selected model */
  currentModel?: AgentModel
  /** Whether to expand the section by default */
  defaultExpanded?: boolean
}

/**
 * Collapsible Agent Model Guide Section
 * Shows model comparison table and recommendations in a glass card
 */
export function AgentModelGuideSection({
  currentModel,
  defaultExpanded = false,
}: AgentModelGuideSectionProps) {
  const t = useTranslations('detail')
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // Auto-recommend based on current model
  const recommendation = useMemo(() => {
    if (!currentModel || currentModel === 'inherit') return null
    const spec = MODEL_SPECS[currentModel]
    return {
      model: currentModel,
      tier: spec.tier,
      tierConfig: MODEL_TIER_CONFIG[spec.tier],
      bestFor: spec.bestFor.slice(0, 3),
    }
  }, [currentModel])

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-[var(--bg-tertiary)]/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🤖</span>
          <div className="text-left">
            <h2 className="text-lg font-medium text-[var(--text-primary)]">
              {t('agentGuide.modelGuide.title')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {t('agentGuide.modelGuide.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Current model badge */}
          {recommendation && (
            <span
              className={`hidden sm:inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${recommendation.tierConfig.bgColor} ${recommendation.tierConfig.color}`}
            >
              {recommendation.tierConfig.icon} {MODEL_SPECS[recommendation.model].name}
            </span>
          )}

          {/* Expand/collapse icon */}
          <svg
            className={`w-5 h-5 text-[var(--text-muted)] transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="border-t border-[var(--border-subtle)] p-6 space-y-6">
          {/* Quick recommendation */}
          {recommendation && (
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{recommendation.tierConfig.icon}</span>
                <div className="flex-1">
                  <h3 className="font-medium text-[var(--text-primary)]">
                    {t('agentGuide.modelGuide.currentSelection')} {MODEL_SPECS[recommendation.model].name}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    {MODEL_SPECS[recommendation.model].description}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {recommendation.bestFor.map((task) => (
                      <span
                        key={task}
                        className="text-xs px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                      >
                        {TASK_CATEGORIES[task].label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Model comparison table */}
          <ModelComparisonTable currentModel={currentModel} />

          {/* Task recommendations */}
          <TaskRecommendations />

          {/* Cost comparison visualization */}
          <CostComparisonChart />
        </div>
      )}
    </div>
  )
}

/**
 * Model comparison table component
 */
function ModelComparisonTable({ currentModel }: { currentModel?: AgentModel }) {
  const t = useTranslations('detail')
  const models = Object.values(MODEL_SPECS)

  return (
    <div>
      <h3 className="text-base font-medium text-[var(--text-primary)] mb-4">
        {t('agentGuide.modelGuide.comparisonTable')}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                {t('agentGuide.modelGuide.colModel')}
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                {t('agentGuide.modelGuide.colPerformance')}
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                {t('agentGuide.modelGuide.colCost')}
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                {t('agentGuide.modelGuide.colSpeed')}
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                {t('agentGuide.modelGuide.colRecommended')}
              </th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => {
              const tierConfig = MODEL_TIER_CONFIG[model.tier]
              const isSelected = currentModel === model.id
              return (
                <tr
                  key={model.id}
                  className={`border-b border-[var(--border-subtle)] last:border-0 ${
                    isSelected ? 'bg-[var(--accent-purple)]/10' : ''
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{tierConfig.icon}</span>
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">{model.name}</p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${tierConfig.bgColor} ${tierConfig.color}`}
                        >
                          {tierConfig.label}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <PerformanceBar level={model.tier === 'premium' ? 100 : model.tier === 'balanced' ? 75 : 50} />
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm">
                      <span className="text-[var(--text-primary)] font-mono">
                        ${model.inputCostPer1M}
                      </span>
                      <span className="text-[var(--text-muted)]"> {t('agentGuide.modelGuide.inputPer1M')}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-[var(--text-primary)] font-mono">
                        ${model.outputCostPer1M}
                      </span>
                      <span className="text-[var(--text-muted)]"> {t('agentGuide.modelGuide.outputPer1M')}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">
                    {model.avgResponseTime}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {model.bestFor.slice(0, 2).map((task) => (
                        <span
                          key={task}
                          className="text-xs px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                        >
                          {TASK_CATEGORIES[task].label}
                        </span>
                      ))}
                    </div>
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

/**
 * Performance bar visualization
 */
function PerformanceBar({ level }: { level: number }) {
  return (
    <div className="w-20 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${
          level >= 100
            ? 'bg-purple-500'
            : level >= 75
              ? 'bg-blue-500'
              : 'bg-green-500'
        }`}
        style={{ width: `${level}%` }}
      />
    </div>
  )
}

/**
 * Task-based recommendations component
 */
function TaskRecommendations() {
  const t = useTranslations('detail')

  const taskGroups: { titleKey: string; icon: string; categories: TaskCategory[] }[] = [
    {
      titleKey: 'agentGuide.modelGuide.taskGroupCoding',
      icon: '💻',
      categories: ['code-generation', 'code-review', 'debugging', 'refactoring'],
    },
    {
      titleKey: 'agentGuide.modelGuide.taskGroupAnalysis',
      icon: '🔍',
      categories: ['analysis', 'testing'],
    },
    {
      titleKey: 'agentGuide.modelGuide.taskGroupCreative',
      icon: '🎨',
      categories: ['creative', 'documentation'],
    },
    {
      titleKey: 'agentGuide.modelGuide.taskGroupSimple',
      icon: '⚡',
      categories: ['data-processing', 'conversation'],
    },
  ]

  return (
    <div>
      <h3 className="text-base font-medium text-[var(--text-primary)] mb-4">
        {t('agentGuide.modelGuide.taskRecommendations')}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {taskGroups.map((group) => (
          <div
            key={group.titleKey}
            className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{group.icon}</span>
              <h4 className="font-medium text-[var(--text-primary)]">{t(group.titleKey as Parameters<typeof t>[0])}</h4>
            </div>
            <div className="space-y-2">
              {group.categories.map((cat) => {
                const catInfo = TASK_CATEGORIES[cat]
                const primaryModel = catInfo.recommendedModels[0]
                const modelSpec = MODEL_SPECS[primaryModel as keyof typeof MODEL_SPECS]
                const tierConfig = modelSpec ? MODEL_TIER_CONFIG[modelSpec.tier] : null

                return (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">{catInfo.label}</span>
                    {tierConfig && (
                      <span
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${tierConfig.bgColor} ${tierConfig.color}`}
                      >
                        {tierConfig.icon} {modelSpec.name.split(' ').pop()}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Cost comparison visualization
 */
function CostComparisonChart() {
  const t = useTranslations('detail')
  const models = Object.values(MODEL_SPECS)
  const maxCost = Math.max(...models.map((m) => m.outputCostPer1M))

  return (
    <div>
      <h3 className="text-base font-medium text-[var(--text-primary)] mb-4">
        {t('agentGuide.modelGuide.costVsPerformance')}
      </h3>
      <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
        <div className="space-y-4">
          {models.map((model) => {
            const tierConfig = MODEL_TIER_CONFIG[model.tier]
            const costWidth = (model.outputCostPer1M / maxCost) * 100

            return (
              <div key={model.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span>{tierConfig.icon}</span>
                    <span className="text-[var(--text-primary)]">{model.name}</span>
                  </span>
                  <span className="font-mono text-[var(--text-muted)]">
                    ${model.outputCostPer1M}/1M
                  </span>
                </div>
                <div className="h-3 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      model.tier === 'premium'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                        : model.tier === 'balanced'
                          ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                          : 'bg-gradient-to-r from-green-500 to-emerald-500'
                    }`}
                    style={{ width: `${costWidth}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)] mb-2">{t('agentGuide.modelGuide.legendTitle')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-[var(--text-secondary)]">{t('agentGuide.modelGuide.legendHaiku')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-[var(--text-secondary)]">{t('agentGuide.modelGuide.legendSonnet')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-[var(--text-secondary)]">{t('agentGuide.modelGuide.legendOpus')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Simple inline model display (for use elsewhere)
 */
export function ModelBadge({ model }: { model: AgentModel }) {
  const t = useTranslations('detail')

  if (model === 'inherit') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
        🔗 {t('agentGuide.modelGuide.inheritBadge')}
      </span>
    )
  }

  const spec = MODEL_SPECS[model]
  const tierConfig = MODEL_TIER_CONFIG[spec.tier]

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tierConfig.bgColor} ${tierConfig.color}`}
    >
      {tierConfig.icon} {spec.name}
    </span>
  )
}
