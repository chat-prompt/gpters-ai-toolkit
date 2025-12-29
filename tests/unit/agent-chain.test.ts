import { describe, it, expect, vi } from 'vitest'

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
  CHAIN_TEMPLATES,
  evaluateCondition,
  applyInputMapping,
  applyOutputMapping,
  validateChainDefinition,
  createChainFromTemplate,
  ChainBuilder,
  getAvailableTemplates,
  renderAsMermaid,
  renderAsJson,
  renderAsMarkdown,
  type ChainDefinition,
  type StepCondition,
  type InputMapping,
  type OutputMapping,
  type StepExecutionResult,
} from '@/lib/agent/chain'

describe('Agent Chain', () => {
  describe('CHAIN_TEMPLATES', () => {
    it('should have predefined templates', () => {
      expect(CHAIN_TEMPLATES['code-review-pipeline']).toBeDefined()
      expect(CHAIN_TEMPLATES['content-generation-pipeline']).toBeDefined()
      expect(CHAIN_TEMPLATES['data-transformation-pipeline']).toBeDefined()
      expect(CHAIN_TEMPLATES['qa-testing-pipeline']).toBeDefined()
    })

    it('should have valid template structure', () => {
      for (const [_id, template] of Object.entries(CHAIN_TEMPLATES)) {
        expect(template.name).toBeDefined()
        expect(template.steps).toBeDefined()
        expect(template.steps!.length).toBeGreaterThan(0)
        expect(template.entryPoint).toBeDefined()
      }
    })
  })

  describe('evaluateCondition', () => {
    it('should return true for always condition', () => {
      const condition: StepCondition = { type: 'always' }
      expect(evaluateCondition(condition)).toBe(true)
    })

    it('should evaluate success condition', () => {
      const condition: StepCondition = { type: 'success' }
      const successResult: StepExecutionResult = {
        stepId: 'test',
        agentId: 'agent',
        status: 'completed',
        input: {},
        startTime: new Date(),
        retryCount: 0,
      }
      const failResult: StepExecutionResult = {
        stepId: 'test',
        agentId: 'agent',
        status: 'failed',
        input: {},
        startTime: new Date(),
        retryCount: 0,
      }

      expect(evaluateCondition(condition, successResult)).toBe(true)
      expect(evaluateCondition(condition, failResult)).toBe(false)
    })

    it('should evaluate failure condition', () => {
      const condition: StepCondition = { type: 'failure' }
      const failResult: StepExecutionResult = {
        stepId: 'test',
        agentId: 'agent',
        status: 'failed',
        input: {},
        startTime: new Date(),
        retryCount: 0,
      }

      expect(evaluateCondition(condition, failResult)).toBe(true)
    })

    it('should evaluate output eq condition', () => {
      const condition: StepCondition = {
        type: 'output',
        field: 'status',
        operator: 'eq',
        value: 'success',
      }
      const result: StepExecutionResult = {
        stepId: 'test',
        agentId: 'agent',
        status: 'completed',
        input: {},
        output: { status: 'success' },
        startTime: new Date(),
        retryCount: 0,
      }

      expect(evaluateCondition(condition, result)).toBe(true)
    })

    it('should evaluate output neq condition', () => {
      const condition: StepCondition = {
        type: 'output',
        field: 'status',
        operator: 'neq',
        value: 'error',
      }
      const result: StepExecutionResult = {
        stepId: 'test',
        agentId: 'agent',
        status: 'completed',
        input: {},
        output: { status: 'success' },
        startTime: new Date(),
        retryCount: 0,
      }

      expect(evaluateCondition(condition, result)).toBe(true)
    })

    it('should evaluate output gt condition', () => {
      const condition: StepCondition = {
        type: 'output',
        field: 'score',
        operator: 'gt',
        value: 80,
      }
      const result: StepExecutionResult = {
        stepId: 'test',
        agentId: 'agent',
        status: 'completed',
        input: {},
        output: { score: 90 },
        startTime: new Date(),
        retryCount: 0,
      }

      expect(evaluateCondition(condition, result)).toBe(true)
    })

    it('should evaluate output contains condition', () => {
      const condition: StepCondition = {
        type: 'output',
        field: 'message',
        operator: 'contains',
        value: 'success',
      }
      const result: StepExecutionResult = {
        stepId: 'test',
        agentId: 'agent',
        status: 'completed',
        input: {},
        output: { message: 'Operation completed with success' },
        startTime: new Date(),
        retryCount: 0,
      }

      expect(evaluateCondition(condition, result)).toBe(true)
    })

    it('should evaluate output exists condition', () => {
      const condition: StepCondition = {
        type: 'output',
        field: 'data',
        operator: 'exists',
      }
      const resultWithData: StepExecutionResult = {
        stepId: 'test',
        agentId: 'agent',
        status: 'completed',
        input: {},
        output: { data: 'something' },
        startTime: new Date(),
        retryCount: 0,
      }
      const resultWithoutData: StepExecutionResult = {
        stepId: 'test',
        agentId: 'agent',
        status: 'completed',
        input: {},
        output: { other: 'field' },
        startTime: new Date(),
        retryCount: 0,
      }

      expect(evaluateCondition(condition, resultWithData)).toBe(true)
      expect(evaluateCondition(condition, resultWithoutData)).toBe(false)
    })

    it('should handle nested fields', () => {
      const condition: StepCondition = {
        type: 'output',
        field: 'data.nested.value',
        operator: 'eq',
        value: 42,
      }
      const result: StepExecutionResult = {
        stepId: 'test',
        agentId: 'agent',
        status: 'completed',
        input: {},
        output: { data: { nested: { value: 42 } } },
        startTime: new Date(),
        retryCount: 0,
      }

      expect(evaluateCondition(condition, result)).toBe(true)
    })

    it('should evaluate simple expression condition', () => {
      const conditionTrue: StepCondition = { type: 'expression', expression: 'true' }
      const conditionFalse: StepCondition = { type: 'expression', expression: 'false' }

      expect(evaluateCondition(conditionTrue)).toBe(true)
      expect(evaluateCondition(conditionFalse)).toBe(false)
    })
  })

  describe('applyInputMapping', () => {
    const stepResults = new Map<string, StepExecutionResult>()

    beforeAll(() => {
      stepResults.set('step1', {
        stepId: 'step1',
        agentId: 'agent1',
        status: 'completed',
        input: {},
        output: { data: 'from step1', value: 100 },
        startTime: new Date(),
        retryCount: 0,
      })
      stepResults.set('step2', {
        stepId: 'step2',
        agentId: 'agent2',
        status: 'completed',
        input: {},
        output: { extra: 'from step2', score: 90 },
        startTime: new Date(),
        retryCount: 0,
      })
    })

    it('should passthrough initial input when no source', () => {
      const mapping: InputMapping = { type: 'passthrough' }
      const result = applyInputMapping(mapping, stepResults, { initial: 'data' })

      expect(result).toEqual({ initial: 'data' })
    })

    it('should passthrough from source step', () => {
      const mapping: InputMapping = { type: 'passthrough', source: 'step1' }
      const result = applyInputMapping(mapping, stepResults, {})

      expect(result).toEqual({ data: 'from step1', value: 100 })
    })

    it('should select specific fields', () => {
      const mapping: InputMapping = {
        type: 'select',
        source: 'step1',
        fields: ['data'],
      }
      const result = applyInputMapping(mapping, stepResults, {})

      expect(result).toEqual({ data: 'from step1' })
    })

    it('should merge outputs from multiple steps', () => {
      const mapping: InputMapping = {
        type: 'merge',
        mergeWith: ['step1', 'step2'],
      }
      const result = applyInputMapping(mapping, stepResults, {})

      expect(result).toEqual({
        data: 'from step1',
        value: 100,
        extra: 'from step2',
        score: 90,
      })
    })

    it('should return initial input when mapping is undefined', () => {
      const result = applyInputMapping(undefined, stepResults, { initial: 'data' })

      expect(result).toEqual({ initial: 'data' })
    })
  })

  describe('applyOutputMapping', () => {
    it('should passthrough output', () => {
      const mapping: OutputMapping = { type: 'passthrough' }
      const output = { data: 'test', value: 42 }
      const result = applyOutputMapping(mapping, output)

      expect(result).toEqual(output)
    })

    it('should select specific fields', () => {
      const mapping: OutputMapping = {
        type: 'select',
        fields: ['data'],
      }
      const output = { data: 'test', value: 42, extra: 'ignored' }
      const result = applyOutputMapping(mapping, output)

      expect(result).toEqual({ data: 'test' })
    })

    it('should rename fields', () => {
      const mapping: OutputMapping = {
        type: 'transform',
        rename: { data: 'result' },
      }
      const output = { data: 'test', value: 42 }
      const result = applyOutputMapping(mapping, output)

      expect(result).toEqual({ result: 'test', value: 42 })
    })

    it('should return output when mapping is undefined', () => {
      const output = { data: 'test' }
      const result = applyOutputMapping(undefined, output)

      expect(result).toEqual(output)
    })
  })

  describe('validateChainDefinition', () => {
    it('should validate correct chain', () => {
      const chain: ChainDefinition = {
        id: 'test-chain',
        name: 'Test Chain',
        description: 'A test chain',
        steps: [
          {
            id: 'step1',
            agent: { id: 'agent1', name: 'Agent 1', type: 'analyzer' },
            onSuccess: 'step2',
          },
          {
            id: 'step2',
            agent: { id: 'agent2', name: 'Agent 2', type: 'writer' },
          },
        ],
        entryPoint: 'step1',
      }

      const result = validateChainDefinition(chain)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect missing ID', () => {
      const chain = {
        id: '',
        name: 'Test',
        steps: [{ id: 'step1', agent: { id: 'a1', name: 'A', type: 't' } }],
        entryPoint: 'step1',
      } as ChainDefinition

      const result = validateChainDefinition(chain)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Chain ID is required')
    })

    it('should detect missing steps', () => {
      const chain = {
        id: 'test',
        name: 'Test',
        steps: [],
        entryPoint: 'step1',
      } as ChainDefinition

      const result = validateChainDefinition(chain)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Chain must have at least one step')
    })

    it('should detect duplicate step IDs', () => {
      const chain: ChainDefinition = {
        id: 'test',
        name: 'Test',
        steps: [
          { id: 'step1', agent: { id: 'a1', name: 'A', type: 't' } },
          { id: 'step1', agent: { id: 'a2', name: 'B', type: 't' } },
        ],
        entryPoint: 'step1',
      }

      const result = validateChainDefinition(chain)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Duplicate step ID: step1')
    })

    it('should detect invalid entry point', () => {
      const chain: ChainDefinition = {
        id: 'test',
        name: 'Test',
        steps: [{ id: 'step1', agent: { id: 'a1', name: 'A', type: 't' } }],
        entryPoint: 'nonexistent',
      }

      const result = validateChainDefinition(chain)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Entry point'))).toBe(true)
    })

    it('should detect invalid step references', () => {
      const chain: ChainDefinition = {
        id: 'test',
        name: 'Test',
        steps: [
          { id: 'step1', agent: { id: 'a1', name: 'A', type: 't' }, onSuccess: 'nonexistent' },
        ],
        entryPoint: 'step1',
      }

      const result = validateChainDefinition(chain)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('onSuccess'))).toBe(true)
    })

    it('should warn about missing description', () => {
      const chain: ChainDefinition = {
        id: 'test',
        name: 'Test',
        steps: [{ id: 'step1', agent: { id: 'a1', name: 'A', type: 't' } }],
        entryPoint: 'step1',
      }

      const result = validateChainDefinition(chain)

      expect(result.warnings).toContain('Chain description is recommended')
    })

    it('should warn about unreachable steps', () => {
      const chain: ChainDefinition = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        steps: [
          { id: 'step1', agent: { id: 'a1', name: 'A', type: 't' } },
          { id: 'step2', agent: { id: 'a2', name: 'B', type: 't' } },
        ],
        entryPoint: 'step1',
      }

      const result = validateChainDefinition(chain)

      expect(result.warnings.some((w) => w.includes('Unreachable'))).toBe(true)
    })
  })

  describe('createChainFromTemplate', () => {
    it('should create chain from valid template', () => {
      const chain = createChainFromTemplate('code-review-pipeline', {
        id: 'my-review-chain',
        name: 'My Review Chain',
      })

      expect(chain).not.toBeNull()
      expect(chain?.id).toBe('my-review-chain')
      expect(chain?.name).toBe('My Review Chain')
      expect(chain?.steps.length).toBeGreaterThan(0)
    })

    it('should return null for invalid template', () => {
      const chain = createChainFromTemplate('nonexistent-template', {
        id: 'test',
      })

      expect(chain).toBeNull()
    })

    it('should apply overrides', () => {
      const chain = createChainFromTemplate('code-review-pipeline', {
        id: 'custom-chain',
        overrides: [{ id: 'analyze', timeout: 5000 }],
      })

      expect(chain).not.toBeNull()
      const analyzeStep = chain?.steps.find((s) => s.id === 'analyze')
      expect(analyzeStep?.timeout).toBe(5000)
    })
  })

  describe('ChainBuilder', () => {
    it('should build simple chain', () => {
      const chain = ChainBuilder.create('test-chain')
        .name('Test Chain')
        .description('A test chain')
        .addAgent('step1', { id: 'agent1', name: 'Agent 1', type: 'analyzer' })
        .addAgent('step2', { id: 'agent2', name: 'Agent 2', type: 'writer' })
        .connect('step1', 'step2')
        .build()

      expect(chain.id).toBe('test-chain')
      expect(chain.name).toBe('Test Chain')
      expect(chain.steps).toHaveLength(2)
      expect(chain.entryPoint).toBe('step1')
    })

    it('should build from template', () => {
      const chain = ChainBuilder.fromTemplate('content-generation-pipeline', 'my-content')
        .name('My Content Pipeline')
        .build()

      expect(chain.id).toBe('my-content')
      expect(chain.name).toBe('My Content Pipeline')
    })

    it('should throw for invalid template', () => {
      expect(() => {
        ChainBuilder.fromTemplate('invalid', 'test')
      }).toThrow()
    })

    it('should add conditions', () => {
      const chain = ChainBuilder.create('conditional')
        .name('Conditional Chain')
        .addAgent('step1', { id: 'a1', name: 'A', type: 't' })
        .withCondition('step1', { type: 'always' })
        .build()

      expect(chain.steps[0].condition?.type).toBe('always')
    })

    it('should add input/output mappings', () => {
      const chain = ChainBuilder.create('mapped')
        .name('Mapped Chain')
        .addAgent('step1', { id: 'a1', name: 'A', type: 't' })
        .withInputMapping('step1', { type: 'passthrough' })
        .withOutputMapping('step1', { type: 'select', fields: ['data'] })
        .build()

      expect(chain.steps[0].inputMapping?.type).toBe('passthrough')
      expect(chain.steps[0].outputMapping?.type).toBe('select')
    })

    it('should add retry configuration', () => {
      const chain = ChainBuilder.create('retry')
        .name('Retry Chain')
        .addAgent('step1', { id: 'a1', name: 'A', type: 't' })
        .withRetry('step1', 3, 2000)
        .build()

      expect(chain.steps[0].retries).toBe(3)
      expect(chain.steps[0].retryDelay).toBe(2000)
    })

    it('should add timeout', () => {
      const chain = ChainBuilder.create('timeout')
        .name('Timeout Chain')
        .addAgent('step1', { id: 'a1', name: 'A', type: 't' })
        .withTimeout('step1', 30000)
        .build()

      expect(chain.steps[0].timeout).toBe(30000)
    })

    it('should set variables', () => {
      const chain = ChainBuilder.create('vars')
        .name('Vars Chain')
        .addAgent('step1', { id: 'a1', name: 'A', type: 't' })
        .setVariable('key', 'value')
        .build()

      expect(chain.variables?.key).toBe('value')
    })

    it('should set version', () => {
      const chain = ChainBuilder.create('versioned')
        .name('Versioned Chain')
        .version('1.0.0')
        .addAgent('step1', { id: 'a1', name: 'A', type: 't' })
        .build()

      expect(chain.version).toBe('1.0.0')
    })

    it('should throw on validation error', () => {
      expect(() => {
        ChainBuilder.create('').name('No ID').build()
      }).toThrow()
    })

    it('should validate before building', () => {
      const builder = ChainBuilder.create('test')
        .name('Test')
        .addAgent('step1', { id: 'a1', name: 'A', type: 't' })

      const validation = builder.validate()

      expect(validation.valid).toBe(true)
    })
  })

  describe('getAvailableTemplates', () => {
    it('should return list of templates', () => {
      const templates = getAvailableTemplates()

      expect(templates.length).toBeGreaterThan(0)
      expect(templates[0].id).toBeDefined()
      expect(templates[0].name).toBeDefined()
    })

    it('should include step counts', () => {
      const templates = getAvailableTemplates()

      for (const template of templates) {
        expect(template.stepCount).toBeGreaterThan(0)
      }
    })
  })

  describe('renderAsMermaid', () => {
    it('should render chain as mermaid diagram', () => {
      const chain = ChainBuilder.create('mermaid-test')
        .name('Test')
        .addAgent('step1', { id: 'a1', name: 'Analyzer', type: 't' })
        .addAgent('step2', { id: 'a2', name: 'Writer', type: 't' })
        .connect('step1', 'step2')
        .build()

      const mermaid = renderAsMermaid(chain)

      expect(mermaid).toContain('flowchart TD')
      expect(mermaid).toContain('step1')
      expect(mermaid).toContain('step2')
      expect(mermaid).toContain('Analyzer')
      expect(mermaid).toContain('-->')
    })

    it('should mark entry point', () => {
      const chain = ChainBuilder.create('test')
        .name('Test')
        .addAgent('entry', { id: 'a1', name: 'Entry', type: 't' })
        .build()

      const mermaid = renderAsMermaid(chain)

      expect(mermaid).toContain('style entry')
    })
  })

  describe('renderAsJson', () => {
    it('should render chain as JSON', () => {
      const chain = ChainBuilder.create('json-test')
        .name('Test')
        .addAgent('step1', { id: 'a1', name: 'A', type: 't' })
        .build()

      const json = renderAsJson(chain)
      const parsed = JSON.parse(json)

      expect(parsed.id).toBe('json-test')
      expect(parsed.steps).toHaveLength(1)
    })
  })

  describe('renderAsMarkdown', () => {
    it('should render chain as Markdown', () => {
      const chain = ChainBuilder.create('md-test')
        .name('Markdown Chain')
        .description('A chain rendered as markdown')
        .version('1.0.0')
        .addAgent(
          'step1',
          { id: 'a1', name: 'Analyzer', type: 'analyzer' },
          { onSuccess: 'step2', timeout: 5000 }
        )
        .addAgent('step2', { id: 'a2', name: 'Writer', type: 'writer' })
        .build()

      const md = renderAsMarkdown(chain)

      expect(md).toContain('# Markdown Chain')
      expect(md).toContain('A chain rendered as markdown')
      expect(md).toContain('**Version:** 1.0.0')
      expect(md).toContain('## Steps')
      expect(md).toContain('[Entry]')
      expect(md).toContain('Analyzer')
      expect(md).toContain('**Timeout:** 5000ms')
    })
  })
})

function beforeAll(fn: () => void) {
  fn()
}
