import { getRollbackStatusLabel, ROLLBACK_STEPS } from '@/lib/plugin/rollback'
import type { RollbackProgressProps } from './types'

/**
 * Display rollback operation progress
 */
export function RollbackProgress({
  currentStep,
  completedSteps,
  totalSteps,
  percentage,
  status,
  className = '',
}: RollbackProgressProps) {
  const currentStepInfo = ROLLBACK_STEPS.find((s) => s.id === currentStep)

  const statusColors = {
    pending: 'bg-[var(--bg-tertiary)]',
    in_progress: 'bg-blue-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    cancelled: 'bg-gray-500',
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {getRollbackStatusLabel(status)}
        </span>
        <span className="text-sm text-[var(--text-muted)]">
          {completedSteps}/{totalSteps} 단계
        </span>
      </div>

      <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${statusColors[status]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {currentStepInfo && status === 'in_progress' && (
        <div className="flex items-center gap-2 text-sm">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-[var(--text-secondary)]">
            {currentStepInfo.label}: {currentStepInfo.description}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ROLLBACK_STEPS.map((step, index) => {
          const isCompleted = index < completedSteps
          const isCurrent = step.id === currentStep
          const isPending = index > completedSteps

          return (
            <div
              key={step.id}
              className={`
                px-2 py-1 text-xs rounded-lg
                ${isCompleted ? 'bg-green-500/20 text-green-400' : ''}
                ${isCurrent ? 'bg-blue-500/20 text-blue-400' : ''}
                ${isPending ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]' : ''}
              `}
              title={step.description}
            >
              {step.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}
