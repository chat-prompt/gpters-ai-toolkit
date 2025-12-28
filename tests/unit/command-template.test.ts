import { describe, it, expect } from 'vitest'
import {
  createTemplateFromCategory,
  ArgumentBuilder,
  OutputBuilder,
  TemplateBuilder,
  generateExamples,
  renderAsTypeScript,
  renderAsJsonSchema,
  renderAsMarkdown,
  listCategories,
  getCategoryTemplate,
  validateTemplate,
  type CommandCategory,
  type CommandTemplate,
  type ArgumentDefinition,
} from '@/lib/command/template'

describe('Command Template Generator', () => {
  describe('createTemplateFromCategory', () => {
    it('should create template from analysis category', () => {
      const template = createTemplateFromCategory('code-analyzer', 'analysis')
      expect(template.name).toBe('code-analyzer')
      expect(template.category).toBe('analysis')
      expect(template.arguments.length).toBeGreaterThan(0)
      expect(template.output.format).toBe('json')
    })

    it('should create template from generation category', () => {
      const template = createTemplateFromCategory('component-generator', 'generation')
      expect(template.name).toBe('component-generator')
      expect(template.category).toBe('generation')
      expect(template.output.format).toBe('code')
    })

    it('should create template from search category', () => {
      const template = createTemplateFromCategory('file-search', 'search')
      expect(template.name).toBe('file-search')
      expect(template.category).toBe('search')
      expect(template.arguments.some(a => a.name === 'query')).toBe(true)
    })

    it('should create template from transformation category', () => {
      const template = createTemplateFromCategory('json-to-yaml', 'transformation')
      expect(template.name).toBe('json-to-yaml')
      expect(template.arguments.some(a => a.name === 'from')).toBe(true)
      expect(template.arguments.some(a => a.name === 'to')).toBe(true)
    })

    it('should create template from validation category', () => {
      const template = createTemplateFromCategory('schema-validator', 'validation')
      expect(template.name).toBe('schema-validator')
      expect(template.output.schema?.valid).toBe('boolean')
    })

    it('should create template from workflow category', () => {
      const template = createTemplateFromCategory('build-workflow', 'workflow')
      expect(template.name).toBe('build-workflow')
      expect(template.arguments.some(a => a.name === 'dryRun')).toBe(true)
    })

    it('should apply custom options to category template', () => {
      const template = createTemplateFromCategory('custom-analyzer', 'analysis', {
        description: 'Custom description',
        metadata: { version: '2.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      })
      expect(template.description).toBe('Custom description')
      expect(template.metadata.version).toBe('2.0.0')
    })

    it('should auto-generate examples', () => {
      const template = createTemplateFromCategory('test-cmd', 'analysis')
      expect(template.examples.length).toBeGreaterThan(0)
    })
  })

  describe('ArgumentBuilder', () => {
    it('should build basic argument', () => {
      const arg = ArgumentBuilder.create('name')
        .type('string')
        .description('The name')
        .required()
        .build()

      expect(arg.name).toBe('name')
      expect(arg.type).toBe('string')
      expect(arg.description).toBe('The name')
      expect(arg.required).toBe(true)
    })

    it('should build optional argument with default', () => {
      const arg = ArgumentBuilder.create('count')
        .type('number')
        .description('Count value')
        .optional(10)
        .build()

      expect(arg.required).toBe(false)
      expect(arg.default).toBe(10)
    })

    it('should build enum argument', () => {
      const arg = ArgumentBuilder.create('level')
        .description('Log level')
        .enum('debug', 'info', 'warn', 'error')
        .required()
        .build()

      expect(arg.type).toBe('enum')
      expect(arg.enumValues).toEqual(['debug', 'info', 'warn', 'error'])
    })

    it('should build argument with aliases', () => {
      const arg = ArgumentBuilder.create('verbose')
        .type('boolean')
        .description('Enable verbose output')
        .aliases('v', 'V')
        .optional(false)
        .build()

      expect(arg.aliases).toEqual(['v', 'V'])
    })

    it('should build argument with validation and examples', () => {
      const arg = ArgumentBuilder.create('email')
        .type('string')
        .description('Email address')
        .required()
        .validation('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')
        .examples('user@example.com', 'admin@test.org')
        .build()

      expect(arg.validation).toBeDefined()
      expect(arg.examples).toHaveLength(2)
    })

    it('should throw without name', () => {
      expect(() => {
        new ArgumentBuilder().type('string').build()
      }).toThrow('Argument name is required')
    })

    it('should throw without type', () => {
      expect(() => {
        ArgumentBuilder.create('test').description('test').build()
      }).toThrow('Argument type is required')
    })
  })

  describe('OutputBuilder', () => {
    it('should build basic output spec', () => {
      const output = OutputBuilder.create()
        .format('json')
        .description('JSON output')
        .build()

      expect(output.format).toBe('json')
      expect(output.description).toBe('JSON output')
    })

    it('should build output with schema', () => {
      const output = OutputBuilder.create()
        .format('json')
        .description('Result data')
        .schema({ success: 'boolean', data: 'object' })
        .build()

      expect(output.schema).toEqual({ success: 'boolean', data: 'object' })
    })

    it('should build output with examples', () => {
      const output = OutputBuilder.create()
        .format('text')
        .description('Text output')
        .examples('Hello', 'World')
        .build()

      expect(output.examples).toEqual(['Hello', 'World'])
    })

    it('should use defaults', () => {
      const output = OutputBuilder.create().build()
      expect(output.format).toBe('json')
      expect(output.description).toBe('Command output')
    })
  })

  describe('TemplateBuilder', () => {
    it('should build complete template', () => {
      const template = TemplateBuilder.create('my-command')
        .category('utility')
        .description('A utility command')
        .addArgument(
          ArgumentBuilder.create('input')
            .type('string')
            .description('Input value')
            .required()
        )
        .output(
          OutputBuilder.create()
            .format('text')
            .description('Result text')
        )
        .version('1.0.0')
        .author('test')
        .build()

      expect(template.name).toBe('my-command')
      expect(template.category).toBe('utility')
      expect(template.arguments).toHaveLength(1)
      expect(template.metadata.author).toBe('test')
    })

    it('should build template from category', () => {
      const template = TemplateBuilder.fromCategory('analyzer', 'analysis')
        .description('Custom analyzer')
        .build()

      expect(template.name).toBe('analyzer')
      expect(template.category).toBe('analysis')
      expect(template.description).toBe('Custom analyzer')
    })

    it('should add multiple arguments', () => {
      const template = TemplateBuilder.create('multi-arg')
        .category('utility')
        .description('Multi argument command')
        .addArgument(
          ArgumentBuilder.create('arg1').type('string').description('First').required()
        )
        .addArgument(
          ArgumentBuilder.create('arg2').type('number').description('Second').optional(0)
        )
        .addArgument({
          name: 'arg3',
          type: 'boolean',
          description: 'Third',
          required: false,
          default: false,
        })
        .build()

      expect(template.arguments).toHaveLength(3)
    })

    it('should add examples', () => {
      const template = TemplateBuilder.create('example-cmd')
        .category('utility')
        .description('Example command')
        .addExample({
          title: 'Basic usage',
          input: { key: 'value' },
        })
        .build()

      expect(template.examples).toHaveLength(1)
      expect(template.examples[0].title).toBe('Basic usage')
    })

    it('should set hooks', () => {
      const template = TemplateBuilder.create('hooked-cmd')
        .category('utility')
        .description('Command with hooks')
        .hooks({
          beforeExecute: 'console.log("before")',
          afterExecute: 'console.log("after")',
        })
        .build()

      expect(template.hooks?.beforeExecute).toBe('console.log("before")')
    })

    it('should set tags and dependencies', () => {
      const template = TemplateBuilder.create('tagged-cmd')
        .category('utility')
        .description('Tagged command')
        .tags('cli', 'utility', 'productivity')
        .dependencies('lodash', 'chalk')
        .build()

      expect(template.metadata.tags).toEqual(['cli', 'utility', 'productivity'])
      expect(template.metadata.dependencies).toEqual(['lodash', 'chalk'])
    })

    it('should throw without name', () => {
      expect(() => {
        new TemplateBuilder().category('utility').build()
      }).toThrow('Template name is required')
    })

    it('should throw without category', () => {
      expect(() => {
        TemplateBuilder.create('test').build()
      }).toThrow('Template category is required')
    })
  })

  describe('generateExamples', () => {
    it('should generate examples from template', () => {
      const template: CommandTemplate = {
        name: 'test',
        category: 'utility',
        description: 'Test',
        arguments: [
          { name: 'required', type: 'string', description: 'Required', required: true },
          { name: 'optional', type: 'number', description: 'Optional', required: false, default: 5 },
        ],
        output: { format: 'json', description: 'Output' },
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const examples = generateExamples(template)
      expect(examples.length).toBeGreaterThan(0)
      expect(examples[0].title).toBe('Basic usage')
      expect(examples[0].input.required).toBeDefined()
    })

    it('should use argument examples when available', () => {
      const template: CommandTemplate = {
        name: 'test',
        category: 'utility',
        description: 'Test',
        arguments: [
          { name: 'path', type: 'file', description: 'Path', required: true, examples: ['/usr/local'] },
        ],
        output: { format: 'text', description: 'Output' },
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const examples = generateExamples(template)
      expect(examples[0].input.path).toBe('/usr/local')
    })

    it('should generate values for all types', () => {
      const template: CommandTemplate = {
        name: 'all-types',
        category: 'utility',
        description: 'Test all types',
        arguments: [
          { name: 'str', type: 'string', description: 'String', required: true },
          { name: 'num', type: 'number', description: 'Number', required: true },
          { name: 'bool', type: 'boolean', description: 'Boolean', required: true },
          { name: 'arr', type: 'array', description: 'Array', required: true },
          { name: 'obj', type: 'object', description: 'Object', required: true },
          { name: 'file', type: 'file', description: 'File', required: true },
          { name: 'level', type: 'enum', description: 'Enum', required: true, enumValues: ['a', 'b'] },
        ],
        output: { format: 'json', description: 'Output' },
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const examples = generateExamples(template)
      const input = examples[0].input

      expect(typeof input.str).toBe('string')
      expect(typeof input.num).toBe('number')
      expect(typeof input.bool).toBe('boolean')
      expect(Array.isArray(input.arr)).toBe(true)
      expect(typeof input.obj).toBe('object')
      expect(typeof input.file).toBe('string')
      expect(input.level).toBe('a')
    })
  })

  describe('renderAsTypeScript', () => {
    it('should render template as TypeScript', () => {
      const template = TemplateBuilder.create('test-cmd')
        .category('utility')
        .description('Test command')
        .addArgument(
          ArgumentBuilder.create('name').type('string').description('Name').required()
        )
        .addArgument(
          ArgumentBuilder.create('count').type('number').description('Count').optional(1)
        )
        .version('1.0.0')
        .author('test')
        .build()

      const code = renderAsTypeScript(template)

      expect(code).toContain('test-cmd Command')
      expect(code).toContain('export interface TestCmdInput')
      expect(code).toContain('name: string')
      expect(code).toContain('count?: number')
      expect(code).toContain('export async function execute')
      expect(code).toContain('export const commandDefinition')
    })

    it('should include enum type', () => {
      const template = TemplateBuilder.create('enum-cmd')
        .category('utility')
        .description('Enum test')
        .addArgument(
          ArgumentBuilder.create('level')
            .description('Level')
            .enum('low', 'medium', 'high')
            .required()
        )
        .build()

      const code = renderAsTypeScript(template)
      expect(code).toContain("'low' | 'medium' | 'high'")
    })

    it('should include hooks', () => {
      const template = TemplateBuilder.create('hooked')
        .category('utility')
        .description('With hooks')
        .hooks({
          beforeExecute: 'log.debug("starting")',
          afterExecute: 'log.debug("done")',
          onError: 'log.error("failed")',
        })
        .build()

      const code = renderAsTypeScript(template)
      expect(code).toContain('Before execute hook')
      expect(code).toContain('After execute hook')
      expect(code).toContain('Error handler hook')
    })
  })

  describe('renderAsJsonSchema', () => {
    it('should render template as JSON schema', () => {
      const template = TemplateBuilder.create('schema-test')
        .category('validation')
        .description('Schema test')
        .addArgument(
          ArgumentBuilder.create('input').type('string').description('Input').required()
        )
        .addArgument(
          ArgumentBuilder.create('count').type('number').description('Count').optional(10)
        )
        .build()

      const schema = renderAsJsonSchema(template)

      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#')
      expect(schema.title).toBe('schema-test')
      expect(schema.type).toBe('object')
      expect((schema.properties as Record<string, unknown>).input).toBeDefined()
      expect((schema.required as string[])).toContain('input')
      expect((schema.required as string[])).not.toContain('count')
    })

    it('should include enum values', () => {
      const template = TemplateBuilder.create('enum-schema')
        .category('utility')
        .description('Enum schema')
        .addArgument(
          ArgumentBuilder.create('format')
            .description('Format')
            .enum('json', 'yaml', 'xml')
            .required()
        )
        .build()

      const schema = renderAsJsonSchema(template)
      const formatProp = (schema.properties as Record<string, Record<string, unknown>>).format

      expect(formatProp.enum).toEqual(['json', 'yaml', 'xml'])
    })

    it('should include examples', () => {
      const template = TemplateBuilder.create('example-schema')
        .category('utility')
        .description('Example schema')
        .addArgument(
          ArgumentBuilder.create('path')
            .type('file')
            .description('Path')
            .required()
            .examples('/usr/local', '/home/user')
        )
        .build()

      const schema = renderAsJsonSchema(template)
      const pathProp = (schema.properties as Record<string, Record<string, unknown>>).path

      expect(pathProp.examples).toEqual(['/usr/local', '/home/user'])
    })
  })

  describe('renderAsMarkdown', () => {
    it('should render template as Markdown', () => {
      const template = TemplateBuilder.create('md-test')
        .category('analysis')
        .description('Markdown test command')
        .longDescription('This is a longer description for the command.')
        .addArgument(
          ArgumentBuilder.create('target').type('string').description('Target').required()
        )
        .addArgument(
          ArgumentBuilder.create('verbose').type('boolean').description('Verbose').optional(false)
        )
        .addExample({
          title: 'Basic Example',
          description: 'Simple usage',
          input: { target: 'test' },
        })
        .version('2.0.0')
        .author('developer')
        .tags('analysis', 'testing')
        .build()

      const md = renderAsMarkdown(template)

      expect(md).toContain('# md-test')
      expect(md).toContain('Markdown test command')
      expect(md).toContain('## Category')
      expect(md).toContain('`analysis`')
      expect(md).toContain('## Arguments')
      expect(md).toContain('| `target` |')
      expect(md).toContain('## Output')
      expect(md).toContain('## Examples')
      expect(md).toContain('### Basic Example')
      expect(md).toContain('## Metadata')
      expect(md).toContain('**Version:** 2.0.0')
      expect(md).toContain('**Author:** developer')
    })

    it('should include output schema', () => {
      const template = TemplateBuilder.create('schema-md')
        .category('analysis')
        .description('Schema markdown')
        .output(
          OutputBuilder.create()
            .format('json')
            .description('Result')
            .schema({ success: 'boolean', data: 'array' })
        )
        .build()

      const md = renderAsMarkdown(template)
      expect(md).toContain('### Schema')
      expect(md).toContain('"success": "boolean"')
    })
  })

  describe('listCategories', () => {
    it('should list all categories', () => {
      const categories = listCategories()
      expect(categories.length).toBe(8)
      expect(categories.map(c => c.category)).toContain('analysis')
      expect(categories.map(c => c.category)).toContain('generation')
      expect(categories.map(c => c.category)).toContain('search')
      expect(categories.map(c => c.category)).toContain('transformation')
      expect(categories.map(c => c.category)).toContain('validation')
      expect(categories.map(c => c.category)).toContain('workflow')
      expect(categories.map(c => c.category)).toContain('utility')
      expect(categories.map(c => c.category)).toContain('custom')
    })

    it('should include descriptions', () => {
      const categories = listCategories()
      for (const cat of categories) {
        expect(cat.description).toBeDefined()
        expect(cat.description.length).toBeGreaterThan(0)
      }
    })
  })

  describe('getCategoryTemplate', () => {
    it('should return template for valid category', () => {
      const template = getCategoryTemplate('analysis')
      expect(template).toBeDefined()
      expect(template?.arguments).toBeDefined()
      expect(template?.output).toBeDefined()
    })

    it('should return template for all categories', () => {
      const categories: CommandCategory[] = [
        'analysis', 'generation', 'search', 'transformation',
        'validation', 'workflow', 'utility', 'custom',
      ]

      for (const cat of categories) {
        const template = getCategoryTemplate(cat)
        expect(template).toBeDefined()
      }
    })
  })

  describe('validateTemplate', () => {
    it('should validate correct template', () => {
      const template = TemplateBuilder.create('valid-cmd')
        .category('utility')
        .description('Valid command')
        .addArgument(
          ArgumentBuilder.create('input')
            .type('string')
            .description('Input')
            .required()
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
        category: 'utility' as CommandCategory,
        description: 'Test',
        arguments: [],
        output: { format: 'json' as const, description: 'Output' },
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Template name is required')
    })

    it('should detect invalid name format', () => {
      const template = TemplateBuilder.create('Invalid_Name')
        .category('utility')
        .description('Test')
        .build()

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('lowercase'))).toBe(true)
    })

    it('should detect duplicate argument names', () => {
      const template: CommandTemplate = {
        name: 'dup-args',
        category: 'utility',
        description: 'Test',
        arguments: [
          { name: 'input', type: 'string', description: 'First', required: true },
          { name: 'input', type: 'number', description: 'Second', required: true },
        ],
        output: { format: 'json', description: 'Output' },
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true)
    })

    it('should detect enum without values', () => {
      const template: CommandTemplate = {
        name: 'enum-no-values',
        category: 'utility',
        description: 'Test',
        arguments: [
          { name: 'level', type: 'enum', description: 'Level', required: true },
        ],
        output: { format: 'json', description: 'Output' },
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('enumValues'))).toBe(true)
    })

    it('should detect alias conflicts', () => {
      const template: CommandTemplate = {
        name: 'alias-conflict',
        category: 'utility',
        description: 'Test',
        arguments: [
          { name: 'verbose', type: 'boolean', description: 'Verbose', required: false, aliases: ['v'] },
          { name: 'version', type: 'boolean', description: 'Version', required: false, aliases: ['v'] },
        ],
        output: { format: 'json', description: 'Output' },
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Alias conflict'))).toBe(true)
    })

    it('should warn about missing examples', () => {
      const template: CommandTemplate = {
        name: 'no-examples',
        category: 'utility',
        description: 'Test',
        arguments: [],
        output: { format: 'json', description: 'Output' },
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.warnings.some(w => w.includes('No examples'))).toBe(true)
    })

    it('should warn about missing argument descriptions', () => {
      const template: CommandTemplate = {
        name: 'no-desc',
        category: 'utility',
        description: 'Test',
        arguments: [
          { name: 'input', type: 'string', description: '', required: true },
        ],
        output: { format: 'json', description: 'Output' },
        examples: [],
        metadata: { version: '1.0.0', createdAt: Date.now(), updatedAt: Date.now() },
      }

      const result = validateTemplate(template)
      expect(result.warnings.some(w => w.includes('missing description'))).toBe(true)
    })
  })
})
