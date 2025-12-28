/**
 * Command Template Generator
 *
 * Provides templates and tools for creating new commands:
 * - Type-based templates (analysis, generation, search, etc.)
 * - Argument definition wizard
 * - Output format settings
 * - Automatic example generation
 */

import { createLogger } from '../logger'

const log = createLogger('command-template')

/**
 * Command template categories
 */
export type CommandCategory =
  | 'analysis'
  | 'generation'
  | 'search'
  | 'transformation'
  | 'validation'
  | 'workflow'
  | 'utility'
  | 'custom'

/**
 * Argument types supported by commands
 */
export type ArgumentType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'file' | 'enum'

/**
 * Output format types
 */
export type OutputFormat = 'text' | 'json' | 'markdown' | 'table' | 'code' | 'mixed'

/**
 * Argument definition for commands
 */
export interface ArgumentDefinition {
  name: string
  type: ArgumentType
  description: string
  required: boolean
  default?: unknown
  aliases?: string[]
  enumValues?: string[]
  validation?: string // Validation pattern or rule description
  examples?: unknown[]
}

/**
 * Output specification for commands
 */
export interface OutputSpec {
  format: OutputFormat
  description: string
  schema?: Record<string, unknown>
  examples?: unknown[]
}

/**
 * Complete command template
 */
export interface CommandTemplate {
  name: string
  category: CommandCategory
  description: string
  longDescription?: string
  arguments: ArgumentDefinition[]
  output: OutputSpec
  examples: CommandExample[]
  hooks?: CommandHooks
  metadata: TemplateMetadata
}

/**
 * Command usage example
 */
export interface CommandExample {
  title: string
  description?: string
  input: Record<string, unknown>
  expectedOutput?: unknown
  notes?: string
}

/**
 * Command lifecycle hooks
 */
export interface CommandHooks {
  beforeExecute?: string // Code snippet
  afterExecute?: string // Code snippet
  onError?: string // Code snippet
  validate?: string // Custom validation code
}

/**
 * Template metadata
 */
export interface TemplateMetadata {
  version: string
  author?: string
  createdAt: number
  updatedAt: number
  tags?: string[]
  dependencies?: string[]
}

/**
 * Category-specific template configurations
 */
const CategoryTemplates: Record<CommandCategory, Partial<CommandTemplate>> = {
  analysis: {
    description: 'Analyzes input data and provides insights',
    output: {
      format: 'json',
      description: 'Analysis results with metrics and findings',
      schema: {
        summary: 'string',
        metrics: 'object',
        findings: 'array',
        recommendations: 'array',
      },
    },
    arguments: [
      {
        name: 'target',
        type: 'string',
        description: 'Target to analyze (file path, URL, or content)',
        required: true,
        examples: ['./src/index.ts', 'https://api.example.com'],
      },
      {
        name: 'depth',
        type: 'enum',
        description: 'Analysis depth level',
        required: false,
        default: 'standard',
        enumValues: ['quick', 'standard', 'deep'],
      },
      {
        name: 'format',
        type: 'enum',
        description: 'Output format',
        required: false,
        default: 'json',
        enumValues: ['json', 'text', 'markdown'],
      },
    ],
  },

  generation: {
    description: 'Generates content based on specifications',
    output: {
      format: 'code',
      description: 'Generated content or code',
      schema: {
        content: 'string',
        files: 'array',
        metadata: 'object',
      },
    },
    arguments: [
      {
        name: 'type',
        type: 'string',
        description: 'Type of content to generate',
        required: true,
        examples: ['component', 'test', 'documentation'],
      },
      {
        name: 'name',
        type: 'string',
        description: 'Name for the generated content',
        required: true,
        examples: ['UserProfile', 'AuthService'],
      },
      {
        name: 'template',
        type: 'string',
        description: 'Template to use for generation',
        required: false,
        examples: ['react-component', 'express-route'],
      },
      {
        name: 'output',
        type: 'file',
        description: 'Output path for generated content',
        required: false,
        default: './generated',
      },
    ],
  },

  search: {
    description: 'Searches for content matching criteria',
    output: {
      format: 'json',
      description: 'Search results with matches and context',
      schema: {
        query: 'string',
        results: 'array',
        totalCount: 'number',
        truncated: 'boolean',
      },
    },
    arguments: [
      {
        name: 'query',
        type: 'string',
        description: 'Search query or pattern',
        required: true,
        examples: ['TODO', 'function\\s+\\w+'],
      },
      {
        name: 'path',
        type: 'file',
        description: 'Path to search in',
        required: false,
        default: '.',
      },
      {
        name: 'include',
        type: 'array',
        description: 'File patterns to include',
        required: false,
        default: ['*'],
        examples: [['*.ts', '*.tsx'], ['*.py']],
      },
      {
        name: 'exclude',
        type: 'array',
        description: 'File patterns to exclude',
        required: false,
        default: ['node_modules', '.git'],
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of results',
        required: false,
        default: 100,
      },
    ],
  },

  transformation: {
    description: 'Transforms input data to a different format or structure',
    output: {
      format: 'mixed',
      description: 'Transformed data in target format',
      schema: {
        input: 'object',
        output: 'object',
        changes: 'array',
      },
    },
    arguments: [
      {
        name: 'input',
        type: 'string',
        description: 'Input data or file path',
        required: true,
      },
      {
        name: 'from',
        type: 'string',
        description: 'Source format',
        required: true,
        examples: ['json', 'yaml', 'csv', 'xml'],
      },
      {
        name: 'to',
        type: 'string',
        description: 'Target format',
        required: true,
        examples: ['json', 'yaml', 'csv', 'xml'],
      },
      {
        name: 'options',
        type: 'object',
        description: 'Transformation options',
        required: false,
        default: {},
      },
    ],
  },

  validation: {
    description: 'Validates input against rules or schemas',
    output: {
      format: 'json',
      description: 'Validation result with any errors or warnings',
      schema: {
        valid: 'boolean',
        errors: 'array',
        warnings: 'array',
        metadata: 'object',
      },
    },
    arguments: [
      {
        name: 'input',
        type: 'string',
        description: 'Input to validate',
        required: true,
      },
      {
        name: 'schema',
        type: 'string',
        description: 'Schema or rules to validate against',
        required: true,
        examples: ['./schema.json', 'typescript', 'eslint'],
      },
      {
        name: 'strict',
        type: 'boolean',
        description: 'Enable strict validation mode',
        required: false,
        default: false,
      },
    ],
  },

  workflow: {
    description: 'Executes a multi-step workflow',
    output: {
      format: 'json',
      description: 'Workflow execution results for each step',
      schema: {
        success: 'boolean',
        steps: 'array',
        duration: 'number',
        outputs: 'object',
      },
    },
    arguments: [
      {
        name: 'workflow',
        type: 'string',
        description: 'Workflow definition or file path',
        required: true,
      },
      {
        name: 'params',
        type: 'object',
        description: 'Workflow parameters',
        required: false,
        default: {},
      },
      {
        name: 'dryRun',
        type: 'boolean',
        description: 'Preview workflow without executing',
        required: false,
        default: false,
      },
      {
        name: 'parallel',
        type: 'boolean',
        description: 'Run independent steps in parallel',
        required: false,
        default: false,
      },
    ],
  },

  utility: {
    description: 'Utility command for common tasks',
    output: {
      format: 'text',
      description: 'Utility output',
    },
    arguments: [
      {
        name: 'action',
        type: 'string',
        description: 'Action to perform',
        required: true,
      },
    ],
  },

  custom: {
    description: 'Custom command with user-defined behavior',
    output: {
      format: 'json',
      description: 'Custom output',
    },
    arguments: [],
  },
}

/**
 * Generate a command template from category
 */
export function createTemplateFromCategory(
  name: string,
  category: CommandCategory,
  options: Partial<CommandTemplate> = {}
): CommandTemplate {
  const baseTemplate = CategoryTemplates[category]
  const now = Date.now()

  const template: CommandTemplate = {
    name,
    category,
    description: options.description || baseTemplate.description || `${category} command`,
    longDescription: options.longDescription,
    arguments: options.arguments || (baseTemplate.arguments as ArgumentDefinition[]) || [],
    output: options.output || (baseTemplate.output as OutputSpec) || {
      format: 'json',
      description: 'Command output',
    },
    examples: options.examples || [],
    hooks: options.hooks,
    metadata: {
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      ...options.metadata,
    },
  }

  // Auto-generate examples if none provided
  if (template.examples.length === 0) {
    template.examples = generateExamples(template)
  }

  log.info('Created template from category', { name, category })

  return template
}

/**
 * Argument definition builder (wizard-style)
 */
export class ArgumentBuilder {
  private arg: Partial<ArgumentDefinition> = {}

  static create(name: string): ArgumentBuilder {
    const builder = new ArgumentBuilder()
    builder.arg.name = name
    return builder
  }

  type(type: ArgumentType): this {
    this.arg.type = type
    return this
  }

  description(desc: string): this {
    this.arg.description = desc
    return this
  }

  required(isRequired = true): this {
    this.arg.required = isRequired
    return this
  }

  optional(defaultValue?: unknown): this {
    this.arg.required = false
    if (defaultValue !== undefined) {
      this.arg.default = defaultValue
    }
    return this
  }

  aliases(...names: string[]): this {
    this.arg.aliases = names
    return this
  }

  enum(...values: string[]): this {
    this.arg.type = 'enum'
    this.arg.enumValues = values
    return this
  }

  validation(rule: string): this {
    this.arg.validation = rule
    return this
  }

  examples(...examples: unknown[]): this {
    this.arg.examples = examples
    return this
  }

  build(): ArgumentDefinition {
    if (!this.arg.name) {
      throw new Error('Argument name is required')
    }
    if (!this.arg.type) {
      throw new Error('Argument type is required')
    }

    return {
      name: this.arg.name,
      type: this.arg.type,
      description: this.arg.description || `${this.arg.name} argument`,
      required: this.arg.required ?? true,
      default: this.arg.default,
      aliases: this.arg.aliases,
      enumValues: this.arg.enumValues,
      validation: this.arg.validation,
      examples: this.arg.examples,
    }
  }
}

/**
 * Output spec builder
 */
export class OutputBuilder {
  private spec: Partial<OutputSpec> = {}

  static create(): OutputBuilder {
    return new OutputBuilder()
  }

  format(format: OutputFormat): this {
    this.spec.format = format
    return this
  }

  description(desc: string): this {
    this.spec.description = desc
    return this
  }

  schema(schema: Record<string, unknown>): this {
    this.spec.schema = schema
    return this
  }

  examples(...examples: unknown[]): this {
    this.spec.examples = examples
    return this
  }

  build(): OutputSpec {
    return {
      format: this.spec.format || 'json',
      description: this.spec.description || 'Command output',
      schema: this.spec.schema,
      examples: this.spec.examples,
    }
  }
}

/**
 * Full command template builder
 */
export class TemplateBuilder {
  private template: Partial<CommandTemplate> = {
    arguments: [],
    examples: [],
    metadata: {
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  }

  static create(name: string): TemplateBuilder {
    const builder = new TemplateBuilder()
    builder.template.name = name
    return builder
  }

  static fromCategory(name: string, category: CommandCategory): TemplateBuilder {
    const template = createTemplateFromCategory(name, category)
    const builder = new TemplateBuilder()
    builder.template = template
    return builder
  }

  category(category: CommandCategory): this {
    this.template.category = category
    return this
  }

  description(desc: string): this {
    this.template.description = desc
    return this
  }

  longDescription(desc: string): this {
    this.template.longDescription = desc
    return this
  }

  addArgument(arg: ArgumentDefinition | ArgumentBuilder): this {
    const definition = arg instanceof ArgumentBuilder ? arg.build() : arg
    this.template.arguments = this.template.arguments || []
    this.template.arguments.push(definition)
    return this
  }

  output(output: OutputSpec | OutputBuilder): this {
    this.template.output = output instanceof OutputBuilder ? output.build() : output
    return this
  }

  addExample(example: CommandExample): this {
    this.template.examples = this.template.examples || []
    this.template.examples.push(example)
    return this
  }

  hooks(hooks: CommandHooks): this {
    this.template.hooks = hooks
    return this
  }

  version(version: string): this {
    if (this.template.metadata) {
      this.template.metadata.version = version
    }
    return this
  }

  author(author: string): this {
    if (this.template.metadata) {
      this.template.metadata.author = author
    }
    return this
  }

  tags(...tags: string[]): this {
    if (this.template.metadata) {
      this.template.metadata.tags = tags
    }
    return this
  }

  dependencies(...deps: string[]): this {
    if (this.template.metadata) {
      this.template.metadata.dependencies = deps
    }
    return this
  }

  build(): CommandTemplate {
    if (!this.template.name) {
      throw new Error('Template name is required')
    }
    if (!this.template.category) {
      throw new Error('Template category is required')
    }

    // Set defaults
    if (!this.template.output) {
      this.template.output = {
        format: 'json',
        description: 'Command output',
      }
    }

    // Update timestamp
    if (this.template.metadata) {
      this.template.metadata.updatedAt = Date.now()
    }

    // Auto-generate examples if empty
    if (!this.template.examples || this.template.examples.length === 0) {
      this.template.examples = generateExamples(this.template as CommandTemplate)
    }

    log.info('Built template', { name: this.template.name, category: this.template.category })

    return this.template as CommandTemplate
  }
}

/**
 * Generate examples from template definition
 */
export function generateExamples(template: CommandTemplate): CommandExample[] {
  const examples: CommandExample[] = []

  // Generate basic example with required arguments
  const basicInput: Record<string, unknown> = {}
  for (const arg of template.arguments) {
    if (arg.required) {
      basicInput[arg.name] = getExampleValue(arg)
    }
  }

  if (Object.keys(basicInput).length > 0) {
    examples.push({
      title: 'Basic usage',
      description: `Execute ${template.name} with required arguments`,
      input: basicInput,
    })
  }

  // Generate full example with all arguments
  const fullInput: Record<string, unknown> = {}
  for (const arg of template.arguments) {
    fullInput[arg.name] = getExampleValue(arg)
  }

  if (Object.keys(fullInput).length > Object.keys(basicInput).length) {
    examples.push({
      title: 'Full options',
      description: `Execute ${template.name} with all available options`,
      input: fullInput,
    })
  }

  return examples
}

/**
 * Get example value for an argument
 */
function getExampleValue(arg: ArgumentDefinition): unknown {
  // Use provided examples first
  if (arg.examples && arg.examples.length > 0) {
    return arg.examples[0]
  }

  // Use default if available
  if (arg.default !== undefined) {
    return arg.default
  }

  // Generate based on type
  switch (arg.type) {
    case 'string':
      return `example-${arg.name}`
    case 'number':
      return 10
    case 'boolean':
      return true
    case 'array':
      return [`item1`, `item2`]
    case 'object':
      return { key: 'value' }
    case 'file':
      return './example/path'
    case 'enum':
      return arg.enumValues?.[0] || 'option1'
    default:
      return null
  }
}

/**
 * Render template as TypeScript code
 */
export function renderAsTypeScript(template: CommandTemplate): string {
  const lines: string[] = []

  // Header
  lines.push(`/**`)
  lines.push(` * ${template.name} Command`)
  lines.push(` * ${template.description}`)
  if (template.longDescription) {
    lines.push(` *`)
    lines.push(` * ${template.longDescription}`)
  }
  lines.push(` *`)
  lines.push(` * @category ${template.category}`)
  lines.push(` * @version ${template.metadata.version}`)
  if (template.metadata.author) {
    lines.push(` * @author ${template.metadata.author}`)
  }
  lines.push(` */`)
  lines.push(``)

  // Imports
  lines.push(`import { createLogger } from '../logger'`)
  lines.push(``)
  lines.push(`const log = createLogger('${template.name}')`)
  lines.push(``)

  // Input type
  lines.push(`export interface ${pascalCase(template.name)}Input {`)
  for (const arg of template.arguments) {
    const optional = arg.required ? '' : '?'
    const type = getTypeScriptType(arg)
    lines.push(`  /** ${arg.description} */`)
    lines.push(`  ${arg.name}${optional}: ${type}`)
  }
  lines.push(`}`)
  lines.push(``)

  // Output type
  lines.push(`export interface ${pascalCase(template.name)}Output {`)
  if (template.output.schema) {
    for (const [key, type] of Object.entries(template.output.schema)) {
      lines.push(`  ${key}: ${type === 'array' ? 'unknown[]' : type}`)
    }
  } else {
    lines.push(`  success: boolean`)
    lines.push(`  data: unknown`)
  }
  lines.push(`}`)
  lines.push(``)

  // Handler function
  lines.push(`export async function execute(`)
  lines.push(`  input: ${pascalCase(template.name)}Input`)
  lines.push(`): Promise<${pascalCase(template.name)}Output> {`)
  lines.push(`  log.info('Executing ${template.name}', { input })`)
  lines.push(``)
  lines.push(`  // TODO: Implement command logic`)
  lines.push(`  `)

  if (template.hooks?.beforeExecute) {
    lines.push(`  // Before execute hook`)
    lines.push(`  ${template.hooks.beforeExecute}`)
    lines.push(``)
  }

  lines.push(`  try {`)
  lines.push(`    // Command implementation`)
  lines.push(`    const result = {`)
  lines.push(`      success: true,`)
  lines.push(`      data: null,`)
  lines.push(`    }`)
  lines.push(``)

  if (template.hooks?.afterExecute) {
    lines.push(`    // After execute hook`)
    lines.push(`    ${template.hooks.afterExecute}`)
    lines.push(``)
  }

  lines.push(`    log.info('${template.name} completed', { result })`)
  lines.push(`    return result as ${pascalCase(template.name)}Output`)
  lines.push(`  } catch (error) {`)

  if (template.hooks?.onError) {
    lines.push(`    // Error handler hook`)
    lines.push(`    ${template.hooks.onError}`)
  }

  lines.push(`    log.error('${template.name} failed', { error })`)
  lines.push(`    throw error`)
  lines.push(`  }`)
  lines.push(`}`)
  lines.push(``)

  // Command definition export
  lines.push(`export const commandDefinition = {`)
  lines.push(`  name: '${template.name}',`)
  lines.push(`  category: '${template.category}',`)
  lines.push(`  description: '${template.description}',`)
  lines.push(`  arguments: ${JSON.stringify(template.arguments, null, 2).split('\n').join('\n  ')},`)
  lines.push(`  output: ${JSON.stringify(template.output, null, 2).split('\n').join('\n  ')},`)
  lines.push(`  handler: execute,`)
  lines.push(`}`)

  return lines.join('\n')
}

/**
 * Render template as JSON schema
 */
export function renderAsJsonSchema(template: CommandTemplate): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const arg of template.arguments) {
    properties[arg.name] = {
      type: getJsonSchemaType(arg.type),
      description: arg.description,
      default: arg.default,
    }

    if (arg.type === 'enum' && arg.enumValues) {
      (properties[arg.name] as Record<string, unknown>).enum = arg.enumValues
    }

    if (arg.examples && arg.examples.length > 0) {
      (properties[arg.name] as Record<string, unknown>).examples = arg.examples
    }

    if (arg.required) {
      required.push(arg.name)
    }
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: template.name,
    description: template.description,
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}

/**
 * Render template as Markdown documentation
 */
export function renderAsMarkdown(template: CommandTemplate): string {
  const lines: string[] = []

  lines.push(`# ${template.name}`)
  lines.push(``)
  lines.push(`${template.description}`)
  lines.push(``)

  if (template.longDescription) {
    lines.push(template.longDescription)
    lines.push(``)
  }

  lines.push(`## Category`)
  lines.push(``)
  lines.push(`\`${template.category}\``)
  lines.push(``)

  // Arguments
  if (template.arguments.length > 0) {
    lines.push(`## Arguments`)
    lines.push(``)
    lines.push(`| Name | Type | Required | Default | Description |`)
    lines.push(`|------|------|----------|---------|-------------|`)

    for (const arg of template.arguments) {
      const typeStr = arg.type === 'enum' ? `enum(${arg.enumValues?.join('|')})` : arg.type
      const defaultStr = arg.default !== undefined ? `\`${JSON.stringify(arg.default)}\`` : '-'
      const requiredStr = arg.required ? 'Yes' : 'No'
      lines.push(`| \`${arg.name}\` | ${typeStr} | ${requiredStr} | ${defaultStr} | ${arg.description} |`)
    }
    lines.push(``)
  }

  // Output
  lines.push(`## Output`)
  lines.push(``)
  lines.push(`**Format:** \`${template.output.format}\``)
  lines.push(``)
  lines.push(template.output.description)
  lines.push(``)

  if (template.output.schema) {
    lines.push(`### Schema`)
    lines.push(``)
    lines.push('```json')
    lines.push(JSON.stringify(template.output.schema, null, 2))
    lines.push('```')
    lines.push(``)
  }

  // Examples
  if (template.examples.length > 0) {
    lines.push(`## Examples`)
    lines.push(``)

    for (const example of template.examples) {
      lines.push(`### ${example.title}`)
      lines.push(``)
      if (example.description) {
        lines.push(example.description)
        lines.push(``)
      }
      lines.push('```json')
      lines.push(JSON.stringify(example.input, null, 2))
      lines.push('```')
      lines.push(``)
      if (example.notes) {
        lines.push(`> ${example.notes}`)
        lines.push(``)
      }
    }
  }

  // Metadata
  lines.push(`## Metadata`)
  lines.push(``)
  lines.push(`- **Version:** ${template.metadata.version}`)
  if (template.metadata.author) {
    lines.push(`- **Author:** ${template.metadata.author}`)
  }
  if (template.metadata.tags && template.metadata.tags.length > 0) {
    lines.push(`- **Tags:** ${template.metadata.tags.join(', ')}`)
  }
  if (template.metadata.dependencies && template.metadata.dependencies.length > 0) {
    lines.push(`- **Dependencies:** ${template.metadata.dependencies.join(', ')}`)
  }
  lines.push(``)

  return lines.join('\n')
}

/**
 * List available categories with descriptions
 */
export function listCategories(): Array<{ category: CommandCategory; description: string }> {
  const categories: Array<{ category: CommandCategory; description: string }> = [
    { category: 'analysis', description: 'Commands that analyze input data and provide insights' },
    { category: 'generation', description: 'Commands that generate content or code' },
    { category: 'search', description: 'Commands that search for content matching criteria' },
    { category: 'transformation', description: 'Commands that transform data between formats' },
    { category: 'validation', description: 'Commands that validate input against rules' },
    { category: 'workflow', description: 'Commands that execute multi-step workflows' },
    { category: 'utility', description: 'General utility commands' },
    { category: 'custom', description: 'Custom commands with user-defined behavior' },
  ]

  return categories
}

/**
 * Get category template details
 */
export function getCategoryTemplate(category: CommandCategory): Partial<CommandTemplate> | undefined {
  return CategoryTemplates[category]
}

/**
 * Validate a command template
 */
export function validateTemplate(template: CommandTemplate): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // Required fields
  if (!template.name || template.name.trim().length === 0) {
    errors.push('Template name is required')
  } else if (!/^[a-z][a-z0-9-]*$/.test(template.name)) {
    errors.push('Template name must be lowercase alphanumeric with hyphens')
  }

  if (!template.category) {
    errors.push('Template category is required')
  }

  if (!template.description || template.description.trim().length === 0) {
    errors.push('Template description is required')
  }

  // Arguments validation
  const argNames = new Set<string>()
  for (const arg of template.arguments) {
    if (!arg.name) {
      errors.push('Argument name is required')
    } else if (argNames.has(arg.name)) {
      errors.push(`Duplicate argument name: ${arg.name}`)
    } else {
      argNames.add(arg.name)
    }

    if (!arg.type) {
      errors.push(`Argument ${arg.name} is missing type`)
    }

    if (arg.type === 'enum' && (!arg.enumValues || arg.enumValues.length === 0)) {
      errors.push(`Enum argument ${arg.name} must have enumValues`)
    }

    if (!arg.description) {
      warnings.push(`Argument ${arg.name} is missing description`)
    }
  }

  // Check for alias conflicts
  const allAliases = new Set<string>()
  for (const arg of template.arguments) {
    if (arg.aliases) {
      for (const alias of arg.aliases) {
        if (argNames.has(alias) || allAliases.has(alias)) {
          errors.push(`Alias conflict: ${alias} for ${arg.name}`)
        }
        allAliases.add(alias)
      }
    }
  }

  // Output validation
  if (!template.output) {
    errors.push('Output specification is required')
  } else if (!template.output.format) {
    errors.push('Output format is required')
  }

  // Examples validation
  if (!template.examples || template.examples.length === 0) {
    warnings.push('No examples provided')
  }

  // Metadata validation
  if (!template.metadata) {
    errors.push('Metadata is required')
  } else if (!template.metadata.version) {
    errors.push('Metadata version is required')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// Helper functions

function pascalCase(str: string): string {
  return str
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function getTypeScriptType(arg: ArgumentDefinition): string {
  switch (arg.type) {
    case 'string':
    case 'file':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'string[]'
    case 'object':
      return 'Record<string, unknown>'
    case 'enum':
      return arg.enumValues?.map(v => `'${v}'`).join(' | ') || 'string'
    default:
      return 'unknown'
  }
}

function getJsonSchemaType(type: ArgumentType): string | string[] {
  switch (type) {
    case 'string':
    case 'file':
    case 'enum':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'array'
    case 'object':
      return 'object'
    default:
      return 'string'
  }
}
