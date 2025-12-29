/**
 * Agent Template Generator
 *
 * Provides templates and tools for creating new agents:
 * - Role-based templates (reviewer, analyst, writer, etc.)
 * - Responsibility definition wizard
 * - Automated guideline generation
 * - Output format settings
 */

import { createLogger } from '../core/logger'

const log = createLogger('agent-template')

/**
 * Agent role categories
 */
export type AgentRole =
  | 'reviewer'
  | 'analyst'
  | 'writer'
  | 'developer'
  | 'researcher'
  | 'assistant'
  | 'specialist'
  | 'coordinator'
  | 'custom'

/**
 * Agent personality traits
 */
export type PersonalityTrait =
  | 'professional'
  | 'friendly'
  | 'technical'
  | 'creative'
  | 'analytical'
  | 'concise'
  | 'detailed'
  | 'supportive'

/**
 * Output format types
 */
export type OutputFormat = 'text' | 'json' | 'markdown' | 'structured' | 'conversational'

/**
 * Agent responsibility definition
 */
export interface Responsibility {
  id: string
  name: string
  description: string
  priority: 'high' | 'medium' | 'low'
  examples?: string[]
}

/**
 * Agent guideline
 */
export interface Guideline {
  id: string
  category: 'behavior' | 'communication' | 'output' | 'safety' | 'quality'
  rule: string
  rationale?: string
  examples?: GuidelineExample[]
}

/**
 * Guideline example
 */
export interface GuidelineExample {
  scenario: string
  correct: string
  incorrect?: string
}

/**
 * Agent capability
 */
export interface AgentCapability {
  name: string
  description: string
  enabled: boolean
  config?: Record<string, unknown>
}

/**
 * Complete agent template
 */
export interface AgentTemplate {
  name: string
  role: AgentRole
  description: string
  systemPrompt: string
  responsibilities: Responsibility[]
  guidelines: Guideline[]
  capabilities: AgentCapability[]
  personality: PersonalityTrait[]
  outputFormat: OutputFormat
  examples: AgentExample[]
  metadata: AgentMetadata
}

/**
 * Agent interaction example
 */
export interface AgentExample {
  title: string
  userInput: string
  agentResponse: string
  notes?: string
}

/**
 * Agent metadata
 */
export interface AgentMetadata {
  version: string
  author?: string
  createdAt: number
  updatedAt: number
  tags?: string[]
  modelPreference?: string
  maxTokens?: number
  temperature?: number
}

/**
 * Role-specific template configurations
 */
const RoleTemplates: Record<AgentRole, Partial<AgentTemplate>> = {
  reviewer: {
    description: 'Reviews and provides feedback on code, documents, or content',
    personality: ['professional', 'analytical', 'detailed'],
    outputFormat: 'structured',
    responsibilities: [
      {
        id: 'review-quality',
        name: 'Quality Assessment',
        description: 'Evaluate overall quality and adherence to standards',
        priority: 'high',
        examples: ['Check code for best practices', 'Verify documentation accuracy'],
      },
      {
        id: 'identify-issues',
        name: 'Issue Identification',
        description: 'Find and report problems, bugs, or areas for improvement',
        priority: 'high',
        examples: ['Spot potential security vulnerabilities', 'Identify performance bottlenecks'],
      },
      {
        id: 'provide-feedback',
        name: 'Constructive Feedback',
        description: 'Offer actionable suggestions for improvement',
        priority: 'medium',
        examples: ['Suggest alternative approaches', 'Recommend refactoring patterns'],
      },
    ],
    guidelines: [
      {
        id: 'be-constructive',
        category: 'communication',
        rule: 'Always provide constructive criticism with suggestions for improvement',
        rationale: 'Helps the recipient learn and grow from the feedback',
      },
      {
        id: 'be-specific',
        category: 'output',
        rule: 'Reference specific lines, sections, or elements when providing feedback',
        rationale: 'Makes feedback actionable and easy to address',
      },
      {
        id: 'prioritize-issues',
        category: 'quality',
        rule: 'Categorize issues by severity (critical, major, minor, suggestion)',
        rationale: 'Helps prioritize fixes and improvements',
      },
    ],
    capabilities: [
      { name: 'code-analysis', description: 'Analyze code structure and patterns', enabled: true },
      { name: 'security-scan', description: 'Check for security vulnerabilities', enabled: true },
      { name: 'style-check', description: 'Verify coding style and conventions', enabled: true },
    ],
  },

  analyst: {
    description: 'Analyzes data, systems, or problems to provide insights',
    personality: ['analytical', 'technical', 'detailed'],
    outputFormat: 'structured',
    responsibilities: [
      {
        id: 'data-analysis',
        name: 'Data Analysis',
        description: 'Process and analyze data to extract meaningful insights',
        priority: 'high',
      },
      {
        id: 'pattern-recognition',
        name: 'Pattern Recognition',
        description: 'Identify trends, patterns, and anomalies in data',
        priority: 'high',
      },
      {
        id: 'recommendations',
        name: 'Recommendations',
        description: 'Provide data-driven recommendations based on analysis',
        priority: 'medium',
      },
    ],
    guidelines: [
      {
        id: 'evidence-based',
        category: 'quality',
        rule: 'Base all conclusions on evidence and data',
        rationale: 'Ensures reliability and credibility of analysis',
      },
      {
        id: 'quantify-results',
        category: 'output',
        rule: 'Include specific metrics and quantitative data when available',
        rationale: 'Makes insights measurable and actionable',
      },
    ],
    capabilities: [
      { name: 'data-processing', description: 'Process and transform data', enabled: true },
      { name: 'visualization', description: 'Create data visualizations', enabled: false },
      { name: 'statistical-analysis', description: 'Perform statistical calculations', enabled: true },
    ],
  },

  writer: {
    description: 'Creates written content including documentation, articles, and guides',
    personality: ['creative', 'professional', 'detailed'],
    outputFormat: 'markdown',
    responsibilities: [
      {
        id: 'content-creation',
        name: 'Content Creation',
        description: 'Write clear, engaging, and informative content',
        priority: 'high',
      },
      {
        id: 'editing',
        name: 'Editing and Proofreading',
        description: 'Review and improve written content for clarity and accuracy',
        priority: 'medium',
      },
      {
        id: 'formatting',
        name: 'Proper Formatting',
        description: 'Structure content with appropriate headings, lists, and sections',
        priority: 'medium',
      },
    ],
    guidelines: [
      {
        id: 'audience-aware',
        category: 'communication',
        rule: 'Adapt writing style and complexity to the target audience',
        rationale: 'Ensures content is accessible and relevant',
      },
      {
        id: 'clear-structure',
        category: 'output',
        rule: 'Use clear headings, bullet points, and logical structure',
        rationale: 'Improves readability and comprehension',
      },
    ],
    capabilities: [
      { name: 'markdown-formatting', description: 'Format content in Markdown', enabled: true },
      { name: 'grammar-check', description: 'Check grammar and spelling', enabled: true },
      { name: 'seo-optimization', description: 'Optimize content for search engines', enabled: false },
    ],
  },

  developer: {
    description: 'Assists with software development tasks and coding',
    personality: ['technical', 'analytical', 'concise'],
    outputFormat: 'structured',
    responsibilities: [
      {
        id: 'code-generation',
        name: 'Code Generation',
        description: 'Write clean, efficient, and well-documented code',
        priority: 'high',
      },
      {
        id: 'debugging',
        name: 'Debugging',
        description: 'Identify and fix bugs and issues in code',
        priority: 'high',
      },
      {
        id: 'architecture',
        name: 'Architecture Guidance',
        description: 'Provide guidance on software architecture and design patterns',
        priority: 'medium',
      },
    ],
    guidelines: [
      {
        id: 'best-practices',
        category: 'quality',
        rule: 'Follow language-specific best practices and conventions',
        rationale: 'Ensures code quality and maintainability',
      },
      {
        id: 'explain-code',
        category: 'communication',
        rule: 'Explain code decisions and trade-offs when relevant',
        rationale: 'Helps users understand and learn from the code',
      },
    ],
    capabilities: [
      { name: 'code-execution', description: 'Execute code snippets', enabled: false },
      { name: 'code-review', description: 'Review code for issues', enabled: true },
      { name: 'refactoring', description: 'Suggest code refactoring', enabled: true },
    ],
  },

  researcher: {
    description: 'Conducts research and gathers information on topics',
    personality: ['analytical', 'detailed', 'technical'],
    outputFormat: 'markdown',
    responsibilities: [
      {
        id: 'information-gathering',
        name: 'Information Gathering',
        description: 'Collect and synthesize information from various sources',
        priority: 'high',
      },
      {
        id: 'fact-verification',
        name: 'Fact Verification',
        description: 'Verify accuracy and reliability of information',
        priority: 'high',
      },
      {
        id: 'summarization',
        name: 'Summarization',
        description: 'Summarize findings in a clear and organized manner',
        priority: 'medium',
      },
    ],
    guidelines: [
      {
        id: 'cite-sources',
        category: 'quality',
        rule: 'Always cite sources and acknowledge uncertainty',
        rationale: 'Maintains credibility and allows fact-checking',
      },
      {
        id: 'balanced-view',
        category: 'behavior',
        rule: 'Present multiple perspectives on controversial topics',
        rationale: 'Provides a comprehensive view of the subject',
      },
    ],
    capabilities: [
      { name: 'web-search', description: 'Search the web for information', enabled: true },
      { name: 'document-analysis', description: 'Analyze documents and papers', enabled: true },
      { name: 'citation-formatting', description: 'Format citations properly', enabled: true },
    ],
  },

  assistant: {
    description: 'General-purpose assistant for various tasks',
    personality: ['friendly', 'supportive', 'professional'],
    outputFormat: 'conversational',
    responsibilities: [
      {
        id: 'task-assistance',
        name: 'Task Assistance',
        description: 'Help users accomplish their goals efficiently',
        priority: 'high',
      },
      {
        id: 'question-answering',
        name: 'Question Answering',
        description: 'Answer questions accurately and helpfully',
        priority: 'high',
      },
      {
        id: 'guidance',
        name: 'Guidance and Suggestions',
        description: 'Provide helpful suggestions and recommendations',
        priority: 'medium',
      },
    ],
    guidelines: [
      {
        id: 'be-helpful',
        category: 'behavior',
        rule: 'Always prioritize being helpful and solving the user\'s problem',
        rationale: 'Core mission of an assistant agent',
      },
      {
        id: 'clarify-uncertainty',
        category: 'communication',
        rule: 'Ask clarifying questions when the request is ambiguous',
        rationale: 'Ensures accurate and relevant responses',
      },
    ],
    capabilities: [
      { name: 'task-planning', description: 'Break down complex tasks', enabled: true },
      { name: 'reminders', description: 'Set reminders and follow-ups', enabled: false },
      { name: 'scheduling', description: 'Help with scheduling', enabled: false },
    ],
  },

  specialist: {
    description: 'Expert in a specific domain or field',
    personality: ['technical', 'professional', 'detailed'],
    outputFormat: 'structured',
    responsibilities: [
      {
        id: 'domain-expertise',
        name: 'Domain Expertise',
        description: 'Provide expert knowledge in the specialized area',
        priority: 'high',
      },
      {
        id: 'problem-solving',
        name: 'Problem Solving',
        description: 'Solve complex domain-specific problems',
        priority: 'high',
      },
      {
        id: 'best-practices',
        name: 'Best Practices',
        description: 'Recommend industry best practices and standards',
        priority: 'medium',
      },
    ],
    guidelines: [
      {
        id: 'stay-in-domain',
        category: 'behavior',
        rule: 'Focus on the specialized domain and acknowledge limitations outside it',
        rationale: 'Maintains credibility and accuracy',
      },
      {
        id: 'technical-accuracy',
        category: 'quality',
        rule: 'Ensure technical accuracy in all domain-specific advice',
        rationale: 'Specialized knowledge must be reliable',
      },
    ],
    capabilities: [
      { name: 'domain-analysis', description: 'Analyze domain-specific content', enabled: true },
      { name: 'terminology', description: 'Use proper domain terminology', enabled: true },
    ],
  },

  coordinator: {
    description: 'Coordinates tasks and manages workflows',
    personality: ['professional', 'concise', 'supportive'],
    outputFormat: 'structured',
    responsibilities: [
      {
        id: 'task-coordination',
        name: 'Task Coordination',
        description: 'Coordinate and organize multiple tasks or agents',
        priority: 'high',
      },
      {
        id: 'progress-tracking',
        name: 'Progress Tracking',
        description: 'Monitor and report on task progress',
        priority: 'high',
      },
      {
        id: 'delegation',
        name: 'Delegation',
        description: 'Delegate tasks to appropriate agents or resources',
        priority: 'medium',
      },
    ],
    guidelines: [
      {
        id: 'clear-instructions',
        category: 'communication',
        rule: 'Provide clear and unambiguous instructions',
        rationale: 'Ensures tasks are completed correctly',
      },
      {
        id: 'status-updates',
        category: 'output',
        rule: 'Provide regular status updates and summaries',
        rationale: 'Keeps stakeholders informed',
      },
    ],
    capabilities: [
      { name: 'task-management', description: 'Manage and track tasks', enabled: true },
      { name: 'agent-coordination', description: 'Coordinate with other agents', enabled: true },
      { name: 'reporting', description: 'Generate progress reports', enabled: true },
    ],
  },

  custom: {
    description: 'Custom agent with user-defined behavior',
    personality: ['professional'],
    outputFormat: 'text',
    responsibilities: [],
    guidelines: [],
    capabilities: [],
  },
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create an agent template from role
 */
export function createTemplateFromRole(
  name: string,
  role: AgentRole,
  options: Partial<AgentTemplate> = {}
): AgentTemplate {
  const baseTemplate = RoleTemplates[role]
  const now = Date.now()

  const template: AgentTemplate = {
    name,
    role,
    description: options.description || baseTemplate.description || `${role} agent`,
    systemPrompt: options.systemPrompt || generateSystemPrompt(name, role, baseTemplate),
    responsibilities: options.responsibilities || baseTemplate.responsibilities || [],
    guidelines: options.guidelines || baseTemplate.guidelines || [],
    capabilities: options.capabilities || baseTemplate.capabilities || [],
    personality: options.personality || baseTemplate.personality || ['professional'],
    outputFormat: options.outputFormat || baseTemplate.outputFormat || 'text',
    examples: options.examples || [],
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

  log.info('Created template from role', { name, role })

  return template
}

/**
 * Generate system prompt from template
 */
function generateSystemPrompt(
  name: string,
  role: AgentRole,
  baseTemplate: Partial<AgentTemplate>
): string {
  const lines: string[] = []

  lines.push(`You are ${name}, a ${role} agent.`)
  lines.push('')

  if (baseTemplate.description) {
    lines.push(baseTemplate.description)
    lines.push('')
  }

  if (baseTemplate.responsibilities && baseTemplate.responsibilities.length > 0) {
    lines.push('## Responsibilities')
    lines.push('')
    for (const resp of baseTemplate.responsibilities) {
      lines.push(`- **${resp.name}**: ${resp.description}`)
    }
    lines.push('')
  }

  if (baseTemplate.guidelines && baseTemplate.guidelines.length > 0) {
    lines.push('## Guidelines')
    lines.push('')
    for (const guide of baseTemplate.guidelines) {
      lines.push(`- ${guide.rule}`)
    }
    lines.push('')
  }

  if (baseTemplate.personality && baseTemplate.personality.length > 0) {
    lines.push(`## Personality`)
    lines.push('')
    lines.push(`Be ${baseTemplate.personality.join(', ')}.`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generate examples from template
 */
function generateExamples(template: AgentTemplate): AgentExample[] {
  const examples: AgentExample[] = []

  // Generate a basic interaction example based on role
  const roleExamples: Record<AgentRole, AgentExample> = {
    reviewer: {
      title: 'Code Review Request',
      userInput: 'Please review this function for potential issues.',
      agentResponse: 'I\'ll review the function and provide feedback on code quality, potential bugs, and suggestions for improvement.',
    },
    analyst: {
      title: 'Data Analysis Request',
      userInput: 'Analyze the sales data from last quarter.',
      agentResponse: 'I\'ll analyze the sales data and provide insights on trends, patterns, and key metrics.',
    },
    writer: {
      title: 'Content Creation Request',
      userInput: 'Write a blog post about AI in healthcare.',
      agentResponse: 'I\'ll create an informative blog post covering the applications and impact of AI in healthcare.',
    },
    developer: {
      title: 'Code Assistance Request',
      userInput: 'Help me implement a sorting algorithm.',
      agentResponse: 'I\'ll help you implement an efficient sorting algorithm with clear explanations.',
    },
    researcher: {
      title: 'Research Request',
      userInput: 'Research the latest developments in renewable energy.',
      agentResponse: 'I\'ll gather and synthesize information about recent advancements in renewable energy technologies.',
    },
    assistant: {
      title: 'General Assistance',
      userInput: 'Can you help me organize my project tasks?',
      agentResponse: 'Of course! I\'d be happy to help you organize and prioritize your project tasks.',
    },
    specialist: {
      title: 'Expert Consultation',
      userInput: 'What are the best practices for database optimization?',
      agentResponse: 'I\'ll provide expert guidance on database optimization techniques and best practices.',
    },
    coordinator: {
      title: 'Task Coordination',
      userInput: 'Coordinate the review process for this document.',
      agentResponse: 'I\'ll coordinate the review process, assign reviewers, and track progress.',
    },
    custom: {
      title: 'Custom Interaction',
      userInput: 'Hello, what can you do?',
      agentResponse: 'I\'m here to assist you with your specific needs. How can I help?',
    },
  }

  if (roleExamples[template.role]) {
    examples.push(roleExamples[template.role])
  }

  return examples
}

/**
 * Responsibility builder
 */
export class ResponsibilityBuilder {
  private resp: Partial<Responsibility> = {}

  static create(name: string): ResponsibilityBuilder {
    const builder = new ResponsibilityBuilder()
    builder.resp.id = generateId()
    builder.resp.name = name
    return builder
  }

  description(desc: string): this {
    this.resp.description = desc
    return this
  }

  priority(priority: 'high' | 'medium' | 'low'): this {
    this.resp.priority = priority
    return this
  }

  examples(...examples: string[]): this {
    this.resp.examples = examples
    return this
  }

  build(): Responsibility {
    if (!this.resp.name) {
      throw new Error('Responsibility name is required')
    }

    return {
      id: this.resp.id || generateId(),
      name: this.resp.name,
      description: this.resp.description || '',
      priority: this.resp.priority || 'medium',
      examples: this.resp.examples,
    }
  }
}

/**
 * Guideline builder
 */
export class GuidelineBuilder {
  private guide: Partial<Guideline> = {}

  static create(rule: string): GuidelineBuilder {
    const builder = new GuidelineBuilder()
    builder.guide.id = generateId()
    builder.guide.rule = rule
    return builder
  }

  category(category: Guideline['category']): this {
    this.guide.category = category
    return this
  }

  rationale(rationale: string): this {
    this.guide.rationale = rationale
    return this
  }

  example(scenario: string, correct: string, incorrect?: string): this {
    if (!this.guide.examples) {
      this.guide.examples = []
    }
    this.guide.examples.push({ scenario, correct, incorrect })
    return this
  }

  build(): Guideline {
    if (!this.guide.rule) {
      throw new Error('Guideline rule is required')
    }

    return {
      id: this.guide.id || generateId(),
      category: this.guide.category || 'behavior',
      rule: this.guide.rule,
      rationale: this.guide.rationale,
      examples: this.guide.examples,
    }
  }
}

/**
 * Full agent template builder
 */
export class AgentTemplateBuilder {
  private template: Partial<AgentTemplate> = {
    responsibilities: [],
    guidelines: [],
    capabilities: [],
    personality: [],
    examples: [],
    metadata: {
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  }

  static create(name: string): AgentTemplateBuilder {
    const builder = new AgentTemplateBuilder()
    builder.template.name = name
    return builder
  }

  static fromRole(name: string, role: AgentRole): AgentTemplateBuilder {
    const template = createTemplateFromRole(name, role)
    const builder = new AgentTemplateBuilder()
    builder.template = template
    return builder
  }

  role(role: AgentRole): this {
    this.template.role = role
    return this
  }

  description(desc: string): this {
    this.template.description = desc
    return this
  }

  systemPrompt(prompt: string): this {
    this.template.systemPrompt = prompt
    return this
  }

  addResponsibility(resp: Responsibility | ResponsibilityBuilder): this {
    const responsibility = resp instanceof ResponsibilityBuilder ? resp.build() : resp
    this.template.responsibilities = this.template.responsibilities || []
    this.template.responsibilities.push(responsibility)
    return this
  }

  addGuideline(guide: Guideline | GuidelineBuilder): this {
    const guideline = guide instanceof GuidelineBuilder ? guide.build() : guide
    this.template.guidelines = this.template.guidelines || []
    this.template.guidelines.push(guideline)
    return this
  }

  addCapability(capability: AgentCapability): this {
    this.template.capabilities = this.template.capabilities || []
    this.template.capabilities.push(capability)
    return this
  }

  personality(...traits: PersonalityTrait[]): this {
    this.template.personality = traits
    return this
  }

  outputFormat(format: OutputFormat): this {
    this.template.outputFormat = format
    return this
  }

  addExample(example: AgentExample): this {
    this.template.examples = this.template.examples || []
    this.template.examples.push(example)
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

  modelPreference(model: string): this {
    if (this.template.metadata) {
      this.template.metadata.modelPreference = model
    }
    return this
  }

  temperature(temp: number): this {
    if (this.template.metadata) {
      this.template.metadata.temperature = temp
    }
    return this
  }

  build(): AgentTemplate {
    if (!this.template.name) {
      throw new Error('Agent name is required')
    }
    if (!this.template.role) {
      throw new Error('Agent role is required')
    }

    // Generate system prompt if not provided
    if (!this.template.systemPrompt) {
      this.template.systemPrompt = generateSystemPrompt(
        this.template.name,
        this.template.role,
        this.template
      )
    }

    // Update timestamp
    if (this.template.metadata) {
      this.template.metadata.updatedAt = Date.now()
    }

    // Auto-generate examples if empty
    if (!this.template.examples || this.template.examples.length === 0) {
      this.template.examples = generateExamples(this.template as AgentTemplate)
    }

    log.info('Built agent template', { name: this.template.name, role: this.template.role })

    return this.template as AgentTemplate
  }
}

/**
 * Render template as system prompt
 */
export function renderAsSystemPrompt(template: AgentTemplate): string {
  return template.systemPrompt
}

/**
 * Render template as JSON configuration
 */
export function renderAsConfig(template: AgentTemplate): Record<string, unknown> {
  return {
    name: template.name,
    role: template.role,
    description: template.description,
    systemPrompt: template.systemPrompt,
    responsibilities: template.responsibilities,
    guidelines: template.guidelines,
    capabilities: template.capabilities,
    personality: template.personality,
    outputFormat: template.outputFormat,
    examples: template.examples,
    metadata: template.metadata,
  }
}

/**
 * Render template as Markdown documentation
 */
export function renderAsMarkdown(template: AgentTemplate): string {
  const lines: string[] = []

  lines.push(`# ${template.name}`)
  lines.push('')
  lines.push(`**Role:** ${template.role}`)
  lines.push('')
  lines.push(template.description)
  lines.push('')

  // Personality
  if (template.personality.length > 0) {
    lines.push(`## Personality`)
    lines.push('')
    lines.push(template.personality.map(t => `\`${t}\``).join(', '))
    lines.push('')
  }

  // Responsibilities
  if (template.responsibilities.length > 0) {
    lines.push(`## Responsibilities`)
    lines.push('')
    for (const resp of template.responsibilities) {
      lines.push(`### ${resp.name}`)
      lines.push('')
      lines.push(`**Priority:** ${resp.priority}`)
      lines.push('')
      lines.push(resp.description)
      lines.push('')
      if (resp.examples && resp.examples.length > 0) {
        lines.push('**Examples:**')
        for (const ex of resp.examples) {
          lines.push(`- ${ex}`)
        }
        lines.push('')
      }
    }
  }

  // Guidelines
  if (template.guidelines.length > 0) {
    lines.push(`## Guidelines`)
    lines.push('')
    for (const guide of template.guidelines) {
      lines.push(`### ${guide.category.charAt(0).toUpperCase() + guide.category.slice(1)}`)
      lines.push('')
      lines.push(`> ${guide.rule}`)
      lines.push('')
      if (guide.rationale) {
        lines.push(`*Rationale: ${guide.rationale}*`)
        lines.push('')
      }
    }
  }

  // Capabilities
  if (template.capabilities.length > 0) {
    lines.push(`## Capabilities`)
    lines.push('')
    lines.push(`| Capability | Description | Enabled |`)
    lines.push(`|------------|-------------|---------|`)
    for (const cap of template.capabilities) {
      lines.push(`| ${cap.name} | ${cap.description} | ${cap.enabled ? '✓' : '✗'} |`)
    }
    lines.push('')
  }

  // Examples
  if (template.examples.length > 0) {
    lines.push(`## Examples`)
    lines.push('')
    for (const ex of template.examples) {
      lines.push(`### ${ex.title}`)
      lines.push('')
      lines.push(`**User:** ${ex.userInput}`)
      lines.push('')
      lines.push(`**Agent:** ${ex.agentResponse}`)
      lines.push('')
      if (ex.notes) {
        lines.push(`*${ex.notes}*`)
        lines.push('')
      }
    }
  }

  // Metadata
  lines.push(`## Metadata`)
  lines.push('')
  lines.push(`- **Version:** ${template.metadata.version}`)
  lines.push(`- **Output Format:** ${template.outputFormat}`)
  if (template.metadata.author) {
    lines.push(`- **Author:** ${template.metadata.author}`)
  }
  if (template.metadata.tags && template.metadata.tags.length > 0) {
    lines.push(`- **Tags:** ${template.metadata.tags.join(', ')}`)
  }
  if (template.metadata.modelPreference) {
    lines.push(`- **Model:** ${template.metadata.modelPreference}`)
  }
  if (template.metadata.temperature !== undefined) {
    lines.push(`- **Temperature:** ${template.metadata.temperature}`)
  }
  lines.push('')

  return lines.join('\n')
}

/**
 * List available roles with descriptions
 */
export function listRoles(): Array<{ role: AgentRole; description: string }> {
  const roles: Array<{ role: AgentRole; description: string }> = [
    { role: 'reviewer', description: 'Reviews and provides feedback on code, documents, or content' },
    { role: 'analyst', description: 'Analyzes data, systems, or problems to provide insights' },
    { role: 'writer', description: 'Creates written content including documentation, articles, and guides' },
    { role: 'developer', description: 'Assists with software development tasks and coding' },
    { role: 'researcher', description: 'Conducts research and gathers information on topics' },
    { role: 'assistant', description: 'General-purpose assistant for various tasks' },
    { role: 'specialist', description: 'Expert in a specific domain or field' },
    { role: 'coordinator', description: 'Coordinates tasks and manages workflows' },
    { role: 'custom', description: 'Custom agent with user-defined behavior' },
  ]

  return roles
}

/**
 * Get role template details
 */
export function getRoleTemplate(role: AgentRole): Partial<AgentTemplate> | undefined {
  return RoleTemplates[role]
}

/**
 * Validate an agent template
 */
export function validateTemplate(template: AgentTemplate): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // Required fields
  if (!template.name || template.name.trim().length === 0) {
    errors.push('Agent name is required')
  }

  if (!template.role) {
    errors.push('Agent role is required')
  }

  if (!template.description || template.description.trim().length === 0) {
    warnings.push('Agent description is missing')
  }

  if (!template.systemPrompt || template.systemPrompt.trim().length === 0) {
    errors.push('System prompt is required')
  }

  // Responsibilities validation
  const respNames = new Set<string>()
  for (const resp of template.responsibilities) {
    if (!resp.name) {
      errors.push('Responsibility name is required')
    } else if (respNames.has(resp.name)) {
      errors.push(`Duplicate responsibility name: ${resp.name}`)
    } else {
      respNames.add(resp.name)
    }

    if (!resp.description) {
      warnings.push(`Responsibility ${resp.name} is missing description`)
    }
  }

  // Guidelines validation
  for (const guide of template.guidelines) {
    if (!guide.rule) {
      errors.push('Guideline rule is required')
    }
    if (!guide.category) {
      errors.push('Guideline category is required')
    }
  }

  // Capabilities validation
  const capNames = new Set<string>()
  for (const cap of template.capabilities) {
    if (!cap.name) {
      errors.push('Capability name is required')
    } else if (capNames.has(cap.name)) {
      errors.push(`Duplicate capability name: ${cap.name}`)
    } else {
      capNames.add(cap.name)
    }
  }

  // Examples validation
  if (!template.examples || template.examples.length === 0) {
    warnings.push('No interaction examples provided')
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
