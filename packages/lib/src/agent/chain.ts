/**
 * Agent Chain Configuration Library
 *
 * Provides a pipeline system for connecting multiple agents sequentially
 * with result passing, conditional branching, and chain templates.
 */

import { logger as log } from '../core/logger'

// Agent types
export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface AgentResult {
  success: boolean
  output: unknown
  error?: string
  metadata?: Record<string, unknown>
  duration?: number
}

export interface AgentNode {
  id: string
  name: string
  type: string
  config?: Record<string, unknown>
  description?: string
}

// Chain step configuration
export interface ChainStep {
  id: string
  agent: AgentNode
  inputMapping?: InputMapping
  outputMapping?: OutputMapping
  condition?: StepCondition
  onSuccess?: string // next step id
  onFailure?: string // step id or 'abort'
  timeout?: number // ms
  retries?: number
  retryDelay?: number // ms
}

// Input mapping rules
export interface InputMapping {
  type: 'passthrough' | 'select' | 'transform' | 'merge'
  source?: string // step id or 'input' for initial input
  fields?: string[]
  transform?: string // transform expression
  mergeWith?: string[] // step ids to merge
}

// Output mapping rules
export interface OutputMapping {
  type: 'passthrough' | 'select' | 'transform'
  fields?: string[]
  rename?: Record<string, string>
  transform?: string
}

// Condition for conditional branching
export interface StepCondition {
  type: 'always' | 'success' | 'failure' | 'expression' | 'output'
  expression?: string
  field?: string
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists'
  value?: unknown
}

// Chain definition
export interface ChainDefinition {
  id: string
  name: string
  description?: string
  version?: string
  steps: ChainStep[]
  entryPoint: string // first step id
  variables?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

// Chain execution state
export interface ChainExecutionState {
  chainId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted'
  currentStep?: string
  stepResults: Map<string, StepExecutionResult>
  variables: Record<string, unknown>
  startTime?: Date
  endTime?: Date
  error?: string
}

export interface StepExecutionResult {
  stepId: string
  agentId: string
  status: AgentStatus
  input: unknown
  output?: unknown
  error?: string
  startTime: Date
  endTime?: Date
  duration?: number
  retryCount: number
}

// Chain template categories
export type ChainTemplateCategory =
  | 'analysis'
  | 'generation'
  | 'review'
  | 'transformation'
  | 'workflow'
  | 'custom'

// Predefined chain templates
export const CHAIN_TEMPLATES: Record<string, Partial<ChainDefinition>> = {
  'code-review-pipeline': {
    name: 'Code Review Pipeline',
    description: 'Analyze code, review for issues, and generate report',
    steps: [
      {
        id: 'analyze',
        agent: { id: 'code-analyzer', name: 'Code Analyzer', type: 'analyzer' },
        outputMapping: { type: 'passthrough' },
        onSuccess: 'review',
        onFailure: 'abort',
      },
      {
        id: 'review',
        agent: { id: 'code-reviewer', name: 'Code Reviewer', type: 'reviewer' },
        inputMapping: { type: 'passthrough', source: 'analyze' },
        onSuccess: 'report',
        onFailure: 'report',
      },
      {
        id: 'report',
        agent: { id: 'report-generator', name: 'Report Generator', type: 'writer' },
        inputMapping: { type: 'merge', mergeWith: ['analyze', 'review'] },
      },
    ],
    entryPoint: 'analyze',
  },
  'content-generation-pipeline': {
    name: 'Content Generation Pipeline',
    description: 'Research, outline, draft, and refine content',
    steps: [
      {
        id: 'research',
        agent: { id: 'researcher', name: 'Researcher', type: 'researcher' },
        onSuccess: 'outline',
      },
      {
        id: 'outline',
        agent: { id: 'outliner', name: 'Outliner', type: 'writer' },
        inputMapping: { type: 'passthrough', source: 'research' },
        onSuccess: 'draft',
      },
      {
        id: 'draft',
        agent: { id: 'drafter', name: 'Drafter', type: 'writer' },
        inputMapping: { type: 'passthrough', source: 'outline' },
        onSuccess: 'refine',
      },
      {
        id: 'refine',
        agent: { id: 'refiner', name: 'Refiner', type: 'writer' },
        inputMapping: { type: 'passthrough', source: 'draft' },
      },
    ],
    entryPoint: 'research',
  },
  'data-transformation-pipeline': {
    name: 'Data Transformation Pipeline',
    description: 'Extract, validate, transform, and load data',
    steps: [
      {
        id: 'extract',
        agent: { id: 'extractor', name: 'Data Extractor', type: 'transformer' },
        onSuccess: 'validate',
      },
      {
        id: 'validate',
        agent: { id: 'validator', name: 'Data Validator', type: 'validator' },
        inputMapping: { type: 'passthrough', source: 'extract' },
        onSuccess: 'transform',
        onFailure: 'handle-error',
      },
      {
        id: 'transform',
        agent: { id: 'transformer', name: 'Data Transformer', type: 'transformer' },
        inputMapping: { type: 'passthrough', source: 'validate' },
        onSuccess: 'load',
      },
      {
        id: 'load',
        agent: { id: 'loader', name: 'Data Loader', type: 'loader' },
        inputMapping: { type: 'passthrough', source: 'transform' },
      },
      {
        id: 'handle-error',
        agent: { id: 'error-handler', name: 'Error Handler', type: 'handler' },
        inputMapping: { type: 'merge', mergeWith: ['extract', 'validate'] },
        condition: { type: 'failure' },
      },
    ],
    entryPoint: 'extract',
  },
  'qa-testing-pipeline': {
    name: 'QA Testing Pipeline',
    description: 'Test planning, execution, and reporting',
    steps: [
      {
        id: 'plan',
        agent: { id: 'test-planner', name: 'Test Planner', type: 'analyst' },
        onSuccess: 'execute',
      },
      {
        id: 'execute',
        agent: { id: 'test-executor', name: 'Test Executor', type: 'tester' },
        inputMapping: { type: 'passthrough', source: 'plan' },
        onSuccess: 'analyze',
        onFailure: 'analyze',
      },
      {
        id: 'analyze',
        agent: { id: 'result-analyzer', name: 'Result Analyzer', type: 'analyst' },
        inputMapping: { type: 'passthrough', source: 'execute' },
        onSuccess: 'report',
      },
      {
        id: 'report',
        agent: { id: 'qa-reporter', name: 'QA Reporter', type: 'writer' },
        inputMapping: { type: 'merge', mergeWith: ['plan', 'execute', 'analyze'] },
      },
    ],
    entryPoint: 'plan',
  },
}

/**
 * Evaluate a condition
 */
export function evaluateCondition(
  condition: StepCondition,
  previousResult?: StepExecutionResult,
  context?: Record<string, unknown>
): boolean {
  switch (condition.type) {
    case 'always':
      return true

    case 'success':
      return previousResult?.status === 'completed'

    case 'failure':
      return previousResult?.status === 'failed'

    case 'output':
      if (!previousResult?.output || !condition.field) return false
      const output = previousResult.output as Record<string, unknown>
      const fieldValue = getNestedValue(output, condition.field)

      switch (condition.operator) {
        case 'eq':
          return fieldValue === condition.value
        case 'neq':
          return fieldValue !== condition.value
        case 'gt':
          return Number(fieldValue) > Number(condition.value)
        case 'gte':
          return Number(fieldValue) >= Number(condition.value)
        case 'lt':
          return Number(fieldValue) < Number(condition.value)
        case 'lte':
          return Number(fieldValue) <= Number(condition.value)
        case 'contains':
          return String(fieldValue).includes(String(condition.value))
        case 'exists':
          return fieldValue !== undefined && fieldValue !== null
        default:
          return false
      }

    case 'expression':
      // Simple expression evaluation (for demo purposes)
      if (!condition.expression) return false
      try {
        // Replace context variables
        let expr = condition.expression
        if (context) {
          for (const [key, value] of Object.entries(context)) {
            expr = expr.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(value))
          }
        }
        // Very basic expression support
        if (expr === 'true') return true
        if (expr === 'false') return false
        return false
      } catch {
        return false
      }

    default:
      return true
  }
}

/**
 * Get nested value from object
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.')
  let current: unknown = obj

  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }

  return current
}

/**
 * Apply input mapping
 */
export function applyInputMapping(
  mapping: InputMapping | undefined,
  stepResults: Map<string, StepExecutionResult>,
  initialInput: unknown
): unknown {
  if (!mapping) return initialInput

  switch (mapping.type) {
    case 'passthrough':
      if (mapping.source === 'input' || !mapping.source) {
        return initialInput
      }
      return stepResults.get(mapping.source)?.output

    case 'select':
      const source =
        mapping.source === 'input' || !mapping.source
          ? initialInput
          : stepResults.get(mapping.source)?.output

      if (!source || typeof source !== 'object' || !mapping.fields) {
        return source
      }

      const result: Record<string, unknown> = {}
      for (const field of mapping.fields) {
        result[field] = getNestedValue(source as Record<string, unknown>, field)
      }
      return result

    case 'merge':
      const merged: Record<string, unknown> = {}

      if (mapping.mergeWith) {
        for (const stepId of mapping.mergeWith) {
          const stepOutput = stepResults.get(stepId)?.output
          if (stepOutput && typeof stepOutput === 'object') {
            Object.assign(merged, stepOutput)
          }
        }
      }

      return merged

    case 'transform':
      // For simplicity, transform just passes through
      // In production, this would evaluate a transform expression
      return stepResults.get(mapping.source || '')?.output || initialInput

    default:
      return initialInput
  }
}

/**
 * Apply output mapping
 */
export function applyOutputMapping(
  mapping: OutputMapping | undefined,
  output: unknown
): unknown {
  if (!mapping || !output) return output

  switch (mapping.type) {
    case 'passthrough':
      return output

    case 'select':
      if (typeof output !== 'object' || !mapping.fields) return output

      const selected: Record<string, unknown> = {}
      for (const field of mapping.fields) {
        selected[field] = getNestedValue(output as Record<string, unknown>, field)
      }
      return selected

    case 'transform':
      // Rename fields if specified
      if (mapping.rename && typeof output === 'object') {
        const transformed: Record<string, unknown> = { ...(output as Record<string, unknown>) }
        for (const [oldKey, newKey] of Object.entries(mapping.rename)) {
          if (oldKey in transformed) {
            transformed[newKey] = transformed[oldKey]
            delete transformed[oldKey]
          }
        }
        return transformed
      }
      return output

    default:
      return output
  }
}

/**
 * Validate chain definition
 */
export function validateChainDefinition(chain: ChainDefinition): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // Check required fields
  if (!chain.id) errors.push('Chain ID is required')
  if (!chain.name) errors.push('Chain name is required')
  if (!chain.steps || chain.steps.length === 0) errors.push('Chain must have at least one step')
  if (!chain.entryPoint) errors.push('Entry point is required')

  // Validate steps
  const stepIds = new Set<string>()
  for (const step of chain.steps) {
    // Check for duplicate IDs
    if (stepIds.has(step.id)) {
      errors.push(`Duplicate step ID: ${step.id}`)
    }
    stepIds.add(step.id)

    // Check agent
    if (!step.agent || !step.agent.id) {
      errors.push(`Step ${step.id}: Agent ID is required`)
    }
  }

  // Validate entry point
  if (!stepIds.has(chain.entryPoint)) {
    errors.push(`Entry point '${chain.entryPoint}' does not exist in steps`)
  }

  // Validate step references
  for (const step of chain.steps) {
    if (step.onSuccess && step.onSuccess !== 'abort' && !stepIds.has(step.onSuccess)) {
      errors.push(`Step ${step.id}: onSuccess references non-existent step '${step.onSuccess}'`)
    }
    if (step.onFailure && step.onFailure !== 'abort' && !stepIds.has(step.onFailure)) {
      errors.push(`Step ${step.id}: onFailure references non-existent step '${step.onFailure}'`)
    }
    if (step.inputMapping?.source && step.inputMapping.source !== 'input') {
      if (!stepIds.has(step.inputMapping.source)) {
        errors.push(
          `Step ${step.id}: inputMapping.source references non-existent step '${step.inputMapping.source}'`
        )
      }
    }
    if (step.inputMapping?.mergeWith) {
      for (const mergeId of step.inputMapping.mergeWith) {
        if (!stepIds.has(mergeId)) {
          errors.push(
            `Step ${step.id}: inputMapping.mergeWith references non-existent step '${mergeId}'`
          )
        }
      }
    }
  }

  // Warnings
  if (!chain.description) {
    warnings.push('Chain description is recommended')
  }

  const unreachableSteps = findUnreachableSteps(chain)
  if (unreachableSteps.length > 0) {
    warnings.push(`Unreachable steps: ${unreachableSteps.join(', ')}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Find unreachable steps in chain
 */
function findUnreachableSteps(chain: ChainDefinition): string[] {
  const reachable = new Set<string>()
  const toVisit = [chain.entryPoint]

  while (toVisit.length > 0) {
    const stepId = toVisit.pop()!
    if (reachable.has(stepId)) continue

    const step = chain.steps.find((s) => s.id === stepId)
    if (!step) continue

    reachable.add(stepId)

    if (step.onSuccess && step.onSuccess !== 'abort') {
      toVisit.push(step.onSuccess)
    }
    if (step.onFailure && step.onFailure !== 'abort') {
      toVisit.push(step.onFailure)
    }
  }

  return chain.steps.filter((s) => !reachable.has(s.id)).map((s) => s.id)
}

/**
 * Create a chain from template
 */
export function createChainFromTemplate(
  templateId: string,
  options: {
    id: string
    name?: string
    description?: string
    overrides?: Partial<ChainStep>[]
  }
): ChainDefinition | null {
  const template = CHAIN_TEMPLATES[templateId]
  if (!template) {
    log.warn('Chain template not found', { templateId })
    return null
  }

  const chain: ChainDefinition = {
    id: options.id,
    name: options.name || template.name || templateId,
    description: options.description || template.description,
    steps: [...(template.steps || [])],
    entryPoint: template.entryPoint || (template.steps?.[0]?.id ?? ''),
    metadata: {
      createdFrom: templateId,
      createdAt: new Date().toISOString(),
    },
  }

  // Apply overrides
  if (options.overrides) {
    for (const override of options.overrides) {
      const stepIndex = chain.steps.findIndex((s) => s.id === override.id)
      if (stepIndex >= 0) {
        chain.steps[stepIndex] = { ...chain.steps[stepIndex], ...override }
      }
    }
  }

  log.info('Created chain from template', { chainId: chain.id, templateId })
  return chain
}

/**
 * Chain Builder class
 */
export class ChainBuilder {
  private chain: ChainDefinition

  private constructor(id: string) {
    this.chain = {
      id,
      name: '',
      steps: [],
      entryPoint: '',
    }
  }

  static create(id: string): ChainBuilder {
    return new ChainBuilder(id)
  }

  static fromTemplate(templateId: string, chainId: string): ChainBuilder {
    const chain = createChainFromTemplate(templateId, { id: chainId })
    if (!chain) {
      throw new Error(`Template '${templateId}' not found`)
    }
    const builder = new ChainBuilder(chainId)
    builder.chain = chain
    return builder
  }

  name(name: string): this {
    this.chain.name = name
    return this
  }

  description(description: string): this {
    this.chain.description = description
    return this
  }

  version(version: string): this {
    this.chain.version = version
    return this
  }

  entryPoint(stepId: string): this {
    this.chain.entryPoint = stepId
    return this
  }

  addStep(step: ChainStep): this {
    this.chain.steps.push(step)
    if (!this.chain.entryPoint && this.chain.steps.length === 1) {
      this.chain.entryPoint = step.id
    }
    return this
  }

  addAgent(
    stepId: string,
    agent: AgentNode,
    options?: Partial<Omit<ChainStep, 'id' | 'agent'>>
  ): this {
    return this.addStep({
      id: stepId,
      agent,
      ...options,
    })
  }

  connect(fromStepId: string, toStepId: string, onFailure?: string): this {
    const step = this.chain.steps.find((s) => s.id === fromStepId)
    if (step) {
      step.onSuccess = toStepId
      if (onFailure) {
        step.onFailure = onFailure
      }
    }
    return this
  }

  withCondition(stepId: string, condition: StepCondition): this {
    const step = this.chain.steps.find((s) => s.id === stepId)
    if (step) {
      step.condition = condition
    }
    return this
  }

  withInputMapping(stepId: string, mapping: InputMapping): this {
    const step = this.chain.steps.find((s) => s.id === stepId)
    if (step) {
      step.inputMapping = mapping
    }
    return this
  }

  withOutputMapping(stepId: string, mapping: OutputMapping): this {
    const step = this.chain.steps.find((s) => s.id === stepId)
    if (step) {
      step.outputMapping = mapping
    }
    return this
  }

  withRetry(stepId: string, retries: number, retryDelay: number = 1000): this {
    const step = this.chain.steps.find((s) => s.id === stepId)
    if (step) {
      step.retries = retries
      step.retryDelay = retryDelay
    }
    return this
  }

  withTimeout(stepId: string, timeout: number): this {
    const step = this.chain.steps.find((s) => s.id === stepId)
    if (step) {
      step.timeout = timeout
    }
    return this
  }

  setVariable(key: string, value: unknown): this {
    if (!this.chain.variables) {
      this.chain.variables = {}
    }
    this.chain.variables[key] = value
    return this
  }

  metadata(key: string, value: unknown): this {
    if (!this.chain.metadata) {
      this.chain.metadata = {}
    }
    this.chain.metadata[key] = value
    return this
  }

  validate(): { valid: boolean; errors: string[]; warnings: string[] } {
    return validateChainDefinition(this.chain)
  }

  build(): ChainDefinition {
    const validation = this.validate()
    if (!validation.valid) {
      throw new Error(`Invalid chain: ${validation.errors.join(', ')}`)
    }
    log.info('Built chain', { chainId: this.chain.id, stepCount: this.chain.steps.length })
    return { ...this.chain }
  }
}

/**
 * Get available chain templates
 */
export function getAvailableTemplates(): {
  id: string
  name: string
  description?: string
  stepCount: number
}[] {
  return Object.entries(CHAIN_TEMPLATES).map(([id, template]) => ({
    id,
    name: template.name || id,
    description: template.description,
    stepCount: template.steps?.length || 0,
  }))
}

/**
 * Render chain as Mermaid diagram
 */
export function renderAsMermaid(chain: ChainDefinition): string {
  const lines: string[] = ['flowchart TD']

  // Add steps
  for (const step of chain.steps) {
    const shape = step.condition ? `{${step.agent.name}}` : `[${step.agent.name}]`
    lines.push(`    ${step.id}${shape}`)
  }

  lines.push('')

  // Add connections
  for (const step of chain.steps) {
    if (step.onSuccess) {
      const label = step.condition ? '|success|' : ''
      lines.push(`    ${step.id} -->${label} ${step.onSuccess}`)
    }
    if (step.onFailure && step.onFailure !== 'abort') {
      lines.push(`    ${step.id} -->|failure| ${step.onFailure}`)
    }
  }

  // Mark entry point
  lines.push('')
  lines.push(`    style ${chain.entryPoint} fill:#9f9,stroke:#333`)

  return lines.join('\n')
}

/**
 * Render chain as JSON
 */
export function renderAsJson(chain: ChainDefinition): string {
  return JSON.stringify(chain, null, 2)
}

/**
 * Render chain summary as Markdown
 */
export function renderAsMarkdown(chain: ChainDefinition): string {
  const lines: string[] = []

  lines.push(`# ${chain.name}`)
  lines.push('')

  if (chain.description) {
    lines.push(chain.description)
    lines.push('')
  }

  if (chain.version) {
    lines.push(`**Version:** ${chain.version}`)
    lines.push('')
  }

  lines.push('## Steps')
  lines.push('')

  for (const step of chain.steps) {
    const isEntry = step.id === chain.entryPoint
    const prefix = isEntry ? '**[Entry]** ' : ''
    lines.push(`### ${prefix}${step.id}: ${step.agent.name}`)
    lines.push('')
    lines.push(`- **Agent Type:** ${step.agent.type}`)

    if (step.inputMapping) {
      lines.push(`- **Input:** ${step.inputMapping.type}`)
      if (step.inputMapping.source) {
        lines.push(`  - Source: ${step.inputMapping.source}`)
      }
    }

    if (step.onSuccess) {
      lines.push(`- **On Success:** ${step.onSuccess}`)
    }
    if (step.onFailure) {
      lines.push(`- **On Failure:** ${step.onFailure}`)
    }

    if (step.condition) {
      lines.push(`- **Condition:** ${step.condition.type}`)
    }

    if (step.timeout) {
      lines.push(`- **Timeout:** ${step.timeout}ms`)
    }

    if (step.retries) {
      lines.push(`- **Retries:** ${step.retries}`)
    }

    lines.push('')
  }

  return lines.join('\n')
}
