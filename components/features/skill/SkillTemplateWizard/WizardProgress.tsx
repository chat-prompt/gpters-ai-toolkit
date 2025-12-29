import type { WizardStep } from './types'

interface WizardProgressProps {
  steps: WizardStep[]
  currentStep: number
  onStepClick: (step: number) => void
}

export function WizardProgress({ steps, currentStep, onStepClick }: WizardProgressProps) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((step, index) => (
        <div key={step.id} className="flex-1 flex items-center">
          <button
            onClick={() => index < currentStep && onStepClick(index)}
            disabled={index > currentStep}
            className="w-full flex flex-col items-center gap-2 group"
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                index < currentStep
                  ? 'bg-green-500 text-white'
                  : index === currentStep
                    ? 'bg-[var(--accent-cyan)] text-black'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
              }`}
            >
              {index < currentStep ? '✓' : index + 1}
            </div>
            <div className="text-center">
              <span
                className={`text-xs font-medium block transition-colors ${
                  index === currentStep
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                {step.label}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] hidden sm:block">
                {step.description}
              </span>
            </div>
          </button>
          {index < steps.length - 1 && (
            <div
              className={`h-0.5 flex-1 mx-2 transition-colors ${
                index < currentStep ? 'bg-green-500' : 'bg-[var(--border-subtle)]'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}
