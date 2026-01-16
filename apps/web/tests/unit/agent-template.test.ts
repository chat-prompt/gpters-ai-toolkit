import { describe, it, expect } from 'vitest'
import {
  createTemplateFromRole,
  ResponsibilityBuilder,
  GuidelineBuilder,
  AgentTemplateBuilder,
  renderAsSystemPrompt,
  renderAsConfig,
  renderAsMarkdown,
  listRoles,
  getRoleTemplate,
  validateTemplate,
  type AgentRole,
  type AgentTemplate,
} from '@/lib/agent/template'

describe('Agent Template Generator', () => {
  describe('createTemplateFromRole', () => {
    it('should create template from reviewer role', () => {
      const template = createTemplateFromRole('code-reviewer', 'reviewer')
      expect(template.name).toBe('code-reviewer')
      expect(template.role).toBe('reviewer')
      expect(template.responsibilities.length).toBeGreaterThan(0)
      expect(template.guidelines.length).toBeGreaterThan(0)
      expect(template.personality).toContain('analytical')
    })

    it('should create template from analyst role', () => {
      const template = createTemplateFromRole('data-analyst', 'analyst')
      expect(template.name).toBe('data-analyst')
      expect(template.role).toBe('analyst')
      expect(template.outputFormat).toBe('structured')
    })

    it('should create template from writer role', () => {
      const template = createTemplateFromRole('doc-writer', 'writer')
      expect(template.name).toBe('doc-writer')
      expect(template.outputFormat).toBe('markdown')
      expect(template.personality).toContain('creative')
    })

    it('should create template from developer role', () => {
      const template = createTemplateFromRole('code-helper', 'developer')
      expect(template.name).toBe('code-helper')
      expect(template.capabilities.some(c => c.name === 'code-review')).toBe(true)
    })

    it('should create template from researcher role', () => {
      const template = createTemplateFromRole('research-agent', 'researcher')
      expect(template.name).toBe('research-agent')
      expect(template.capabilities.some(c => c.name === 'web-search')).toBe(true)
    })

    it('should create template from assistant role', () => {
      const template = createTemplateFromRole('general-assistant', 'assistant')
      expect(template.name).toBe('general-assistant')
      expect(template.outputFormat).toBe('conversational')
      expect(template.personality).toContain('friendly')
    })

    it('should create template from specialist role', () => {
      const template = createTemplateFromRole('db-expert', 'specialist')
      expect(template.name).toBe('db-expert')
      expect(template.personality).toContain('technical')
    })

    it('should create template from coordinator role', () => {
      const template = createTemplateFromRole('task-coordinator', 'coordinator')
      expect(template.name).toBe('task-coordinator')
      expect(template.capabilities.some(c => c.name === 'task-management')).toBe(true)
    })

    it('should apply custom options to role template', () => {
      const template = createTemplateFromRole('custom-reviewer', 'reviewer', {
        description: 'Custom description',
        personality: ['friendly', 'concise'],
        metadata: { version: '2.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      })
      expect(template.description).toBe('Custom description')
      expect(template.personality).toEqual(['friendly', 'concise'])
      expect(template.metadata.version).toBe('2.0.0')
    })

    it('should auto-generate system prompt', () => {
      const template = createTemplateFromRole('test-agent', 'reviewer')
      expect(template.systemPrompt).toContain('test-agent')
      expect(template.systemPrompt).toContain('reviewer')
    })

    it('should auto-generate examples', () => {
      const template = createTemplateFromRole('test-agent', 'analyst')
      expect(template.examples.length).toBeGreaterThan(0)
    })
  })

  describe('ResponsibilityBuilder', () => {
    it('should build basic responsibility', () => {
      const resp = ResponsibilityBuilder.create('Code Review')
        .description('Review code for issues')
        .priority('high')
        .build()

      expect(resp.name).toBe('Code Review')
      expect(resp.description).toBe('Review code for issues')
      expect(resp.priority).toBe('high')
      expect(resp.id).toBeDefined()
    })

    it('should build responsibility with examples', () => {
      const resp = ResponsibilityBuilder.create('Testing')
        .description('Test code')
        .priority('medium')
        .examples('Unit testing', 'Integration testing')
        .build()

      expect(resp.examples).toEqual(['Unit testing', 'Integration testing'])
    })

    it('should use default priority', () => {
      const resp = ResponsibilityBuilder.create('Task')
        .description('Do something')
        .build()

      expect(resp.priority).toBe('medium')
    })

    it('should throw without name', () => {
      expect(() => {
        new ResponsibilityBuilder().description('test').build()
      }).toThrow('Responsibility name is required')
    })
  })

  describe('GuidelineBuilder', () => {
    it('should build basic guideline', () => {
      const guide = GuidelineBuilder.create('Be helpful')
        .category('behavior')
        .rationale('Core mission')
        .build()

      expect(guide.rule).toBe('Be helpful')
      expect(guide.category).toBe('behavior')
      expect(guide.rationale).toBe('Core mission')
      expect(guide.id).toBeDefined()
    })

    it('should build guideline with examples', () => {
      const guide = GuidelineBuilder.create('Use markdown')
        .category('output')
        .example('Formatting lists', '- Item 1\n- Item 2', 'Item 1 Item 2')
        .build()

      expect(guide.examples).toHaveLength(1)
      expect(guide.examples![0].scenario).toBe('Formatting lists')
      expect(guide.examples![0].incorrect).toBe('Item 1 Item 2')
    })

    it('should use default category', () => {
      const guide = GuidelineBuilder.create('Do something')
        .build()

      expect(guide.category).toBe('behavior')
    })

    it('should throw without rule', () => {
      expect(() => {
        new GuidelineBuilder().category('output').build()
      }).toThrow('Guideline rule is required')
    })
  })

  describe('AgentTemplateBuilder', () => {
    it('should build complete template', () => {
      const template = AgentTemplateBuilder.create('my-agent')
        .role('reviewer')
        .description('A custom reviewer')
        .addResponsibility(
          ResponsibilityBuilder.create('Review')
            .description('Review things')
            .priority('high')
        )
        .addGuideline(
          GuidelineBuilder.create('Be thorough')
            .category('quality')
        )
        .personality('analytical', 'detailed')
        .outputFormat('structured')
        .version('1.0.0')
        .author('test')
        .build()

      expect(template.name).toBe('my-agent')
      expect(template.role).toBe('reviewer')
      expect(template.responsibilities).toHaveLength(1)
      expect(template.guidelines).toHaveLength(1)
      expect(template.personality).toEqual(['analytical', 'detailed'])
      expect(template.metadata.author).toBe('test')
    })

    it('should build template from role', () => {
      const template = AgentTemplateBuilder.fromRole('analyzer', 'analyst')
        .description('Custom analyzer')
        .build()

      expect(template.name).toBe('analyzer')
      expect(template.role).toBe('analyst')
      expect(template.description).toBe('Custom analyzer')
    })

    it('should add capabilities', () => {
      const template = AgentTemplateBuilder.create('capable-agent')
        .role('developer')
        .description('Developer agent')
        .addCapability({ name: 'code-exec', description: 'Execute code', enabled: true })
        .addCapability({ name: 'file-write', description: 'Write files', enabled: false })
        .build()

      expect(template.capabilities).toHaveLength(2)
      expect(template.capabilities[0].enabled).toBe(true)
      expect(template.capabilities[1].enabled).toBe(false)
    })

    it('should add examples', () => {
      const template = AgentTemplateBuilder.create('example-agent')
        .role('assistant')
        .description('Assistant agent')
        .addExample({
          title: 'Greeting',
          userInput: 'Hello',
          agentResponse: 'Hi there!',
        })
        .build()

      expect(template.examples).toHaveLength(1)
      expect(template.examples[0].title).toBe('Greeting')
    })

    it('should set model preferences', () => {
      const template = AgentTemplateBuilder.create('model-agent')
        .role('analyst')
        .description('Analyst')
        .modelPreference('claude-3-opus')
        .temperature(0.7)
        .build()

      expect(template.metadata.modelPreference).toBe('claude-3-opus')
      expect(template.metadata.temperature).toBe(0.7)
    })

    it('should set tags', () => {
      const template = AgentTemplateBuilder.create('tagged-agent')
        .role('writer')
        .description('Writer')
        .tags('content', 'documentation', 'writing')
        .build()

      expect(template.metadata.tags).toEqual(['content', 'documentation', 'writing'])
    })

    it('should throw without name', () => {
      expect(() => {
        new AgentTemplateBuilder().role('reviewer').build()
      }).toThrow('Agent name is required')
    })

    it('should throw without role', () => {
      expect(() => {
        AgentTemplateBuilder.create('test').build()
      }).toThrow('Agent role is required')
    })
  })

  describe('renderAsSystemPrompt', () => {
    it('should return the system prompt', () => {
      const template = createTemplateFromRole('test', 'reviewer')
      const prompt = renderAsSystemPrompt(template)
      expect(prompt).toBe(template.systemPrompt)
    })
  })

  describe('renderAsConfig', () => {
    it('should render template as config object', () => {
      const template = createTemplateFromRole('config-test', 'analyst')
      const config = renderAsConfig(template)

      expect(config.name).toBe('config-test')
      expect(config.role).toBe('analyst')
      expect(config.systemPrompt).toBeDefined()
      expect(config.responsibilities).toBeDefined()
      expect(config.guidelines).toBeDefined()
    })
  })

  describe('renderAsMarkdown', () => {
    it('should render template as Markdown', () => {
      const template = AgentTemplateBuilder.create('md-test')
        .role('writer')
        .description('A test writer agent')
        .addResponsibility(
          ResponsibilityBuilder.create('Writing')
            .description('Write content')
            .priority('high')
            .examples('Blog posts', 'Documentation')
        )
        .addGuideline(
          GuidelineBuilder.create('Use clear language')
            .category('communication')
            .rationale('Improves readability')
        )
        .addCapability({ name: 'formatting', description: 'Format text', enabled: true })
        .addExample({
          title: 'Writing Request',
          userInput: 'Write a summary',
          agentResponse: 'Here is the summary...',
        })
        .personality('professional', 'detail-oriented')
        .version('1.0.0')
        .author('developer')
        .tags('writing', 'content')
        .build()

      const md = renderAsMarkdown(template)

      expect(md).toContain('# md-test')
      expect(md).toContain('**Role:** writer')
      expect(md).toContain('## Personality')
      expect(md).toContain('## Responsibilities')
      expect(md).toContain('### Writing')
      expect(md).toContain('**Priority:** high')
      expect(md).toContain('## Guidelines')
      expect(md).toContain('## Capabilities')
      expect(md).toContain('| formatting |')
      expect(md).toContain('## Examples')
      expect(md).toContain('### Writing Request')
      expect(md).toContain('## Metadata')
      expect(md).toContain('**Author:** developer')
    })

    it('should handle minimal template', () => {
      const template = AgentTemplateBuilder.create('minimal')
        .role('custom')
        .description('Minimal agent')
        .build()

      const md = renderAsMarkdown(template)
      expect(md).toContain('# minimal')
      expect(md).toContain('custom')
    })
  })

  describe('listRoles', () => {
    it('should list all roles', () => {
      const roles = listRoles()
      expect(roles.length).toBe(9)
      expect(roles.map(r => r.role)).toContain('reviewer')
      expect(roles.map(r => r.role)).toContain('analyst')
      expect(roles.map(r => r.role)).toContain('writer')
      expect(roles.map(r => r.role)).toContain('developer')
      expect(roles.map(r => r.role)).toContain('researcher')
      expect(roles.map(r => r.role)).toContain('assistant')
      expect(roles.map(r => r.role)).toContain('specialist')
      expect(roles.map(r => r.role)).toContain('coordinator')
      expect(roles.map(r => r.role)).toContain('custom')
    })

    it('should include descriptions', () => {
      const roles = listRoles()
      for (const role of roles) {
        expect(role.description).toBeDefined()
        expect(role.description.length).toBeGreaterThan(0)
      }
    })
  })

  describe('getRoleTemplate', () => {
    it('should return template for valid role', () => {
      const template = getRoleTemplate('reviewer')
      expect(template).toBeDefined()
      expect(template?.responsibilities).toBeDefined()
      expect(template?.guidelines).toBeDefined()
    })

    it('should return template for all roles', () => {
      const roles: AgentRole[] = [
        'reviewer', 'analyst', 'writer', 'developer',
        'researcher', 'assistant', 'specialist', 'coordinator', 'custom',
      ]

      for (const role of roles) {
        const template = getRoleTemplate(role)
        expect(template).toBeDefined()
      }
    })
  })

  describe('validateTemplate', () => {
    it('should validate correct template', () => {
      const template = AgentTemplateBuilder.create('valid-agent')
        .role('reviewer')
        .description('Valid agent')
        .addResponsibility(
          ResponsibilityBuilder.create('Review')
            .description('Review things')
            .priority('high')
        )
        .version('1.0.0')
        .build()

      const result = validateTemplate(template)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect missing name', () => {
      const template = {
        name: '',
        role: 'reviewer' as AgentRole,
        description: 'Test',
        systemPrompt: 'Test prompt',
        responsibilities: [],
        guidelines: [],
        capabilities: [],
        personality: [],
        outputFormat: 'text' as const,
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Agent name is required')
    })

    it('should detect missing system prompt', () => {
      const template = {
        name: 'test',
        role: 'reviewer' as AgentRole,
        description: 'Test',
        systemPrompt: '',
        responsibilities: [],
        guidelines: [],
        capabilities: [],
        personality: [],
        outputFormat: 'text' as const,
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('System prompt is required')
    })

    it('should detect duplicate responsibility names', () => {
      const template: AgentTemplate = {
        name: 'dup-resp',
        role: 'reviewer',
        description: 'Test',
        systemPrompt: 'Test prompt',
        responsibilities: [
          { id: '1', name: 'Review', description: 'First', priority: 'high' },
          { id: '2', name: 'Review', description: 'Second', priority: 'medium' },
        ],
        guidelines: [],
        capabilities: [],
        personality: [],
        outputFormat: 'text',
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Duplicate responsibility'))).toBe(true)
    })

    it('should detect duplicate capability names', () => {
      const template: AgentTemplate = {
        name: 'dup-cap',
        role: 'developer',
        description: 'Test',
        systemPrompt: 'Test prompt',
        responsibilities: [],
        guidelines: [],
        capabilities: [
          { name: 'code', description: 'First', enabled: true },
          { name: 'code', description: 'Second', enabled: false },
        ],
        personality: [],
        outputFormat: 'text',
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Duplicate capability'))).toBe(true)
    })

    it('should warn about missing examples', () => {
      const template: AgentTemplate = {
        name: 'no-examples',
        role: 'assistant',
        description: 'Test',
        systemPrompt: 'Test prompt',
        responsibilities: [],
        guidelines: [],
        capabilities: [],
        personality: [],
        outputFormat: 'text',
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.warnings.some(w => w.includes('No interaction examples'))).toBe(true)
    })

    it('should warn about missing description', () => {
      const template: AgentTemplate = {
        name: 'no-desc',
        role: 'assistant',
        description: '',
        systemPrompt: 'Test prompt',
        responsibilities: [],
        guidelines: [],
        capabilities: [],
        personality: [],
        outputFormat: 'text',
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.warnings.some(w => w.includes('description is missing'))).toBe(true)
    })

    it('should detect missing guideline rule', () => {
      const template: AgentTemplate = {
        name: 'bad-guide',
        role: 'reviewer',
        description: 'Test',
        systemPrompt: 'Test prompt',
        responsibilities: [],
        guidelines: [
          { id: '1', category: 'behavior', rule: '' },
        ],
        capabilities: [],
        personality: [],
        outputFormat: 'text',
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Guideline rule is required')
    })
  })
})
