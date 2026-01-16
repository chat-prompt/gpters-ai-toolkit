/**
 * Skill Validator
 *
 * Validates skill syntax, examples, and tool permissions:
 * - Required field validation
 * - Content structure validation
 * - AllowedTools validation against CLAUDE_TOOLS
 * - Example extraction and validation
 * - Test result report generation
 */

import { CLAUDE_TOOLS, type ClaudeTool } from '../data/type-config'
import { parseExamplesFromContent, type Example } from '../search/parse-examples'
import { parseFrontmatter, type ParsedFrontmatter } from '../utils/frontmatter'
import type { CatalogItem, ItemType } from '../core/types'
import { createLogger } from '../core/logger'

const log = createLogger('skill-validator')

/**
 * Validation error severity
 */
export type ValidationSeverity = 'error' | 'warning' | 'info'

/**
 * Single validation issue
 */
export interface ValidationIssue {
  /** Issue code for programmatic handling */
  code: string
  /** Human-readable message */
  message: string
  /** Severity level */
  severity: ValidationSeverity
  /** Location in content (optional) */
  location?: {
    line?: number
    column?: number
    section?: string
  }
  /** Suggestion for fixing */
  suggestion?: string
}

/**
 * Validation result for a specific category
 */
export interface CategoryValidation {
  /** Category name */
  category: string
  /** Whether all validations passed */
  passed: boolean
  /** Individual issues found */
  issues: ValidationIssue[]
}

/**
 * Example validation result
 */
export interface ExampleValidation {
  /** Example being validated */
  example: Example
  /** Whether the example is valid */
  valid: boolean
  /** Issues found in this example */
  issues: ValidationIssue[]
}

/**
 * Complete validation result
 */
export interface SkillValidationResult {
  /** Whether the skill is valid overall */
  valid: boolean
  /** Item ID/name being validated */
  itemId: string
  /** Item type */
  itemType: ItemType
  /** Timestamp of validation */
  timestamp: string
  /** Summary statistics */
  summary: {
    errors: number
    warnings: number
    infos: number
    totalIssues: number
    examplesFound: number
    examplesValid: number
  }
  /** Validation results by category */
  categories: {
    syntax: CategoryValidation
    structure: CategoryValidation
    tools: CategoryValidation
    examples: CategoryValidation
  }
  /** Individual example validations */
  exampleValidations: ExampleValidation[]
  /** Parsed examples from content */
  parsedExamples: Example[]
  /** Parsed frontmatter if applicable */
  parsedFrontmatter?: ParsedFrontmatter
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Validate frontmatter (for markdown content) */
  validateFrontmatter?: boolean
  /** Strict mode - treat warnings as errors */
  strictMode?: boolean
  /** Skip example validation */
  skipExamples?: boolean
  /** Item type for type-specific validation */
  itemType?: ItemType
}

/**
 * Required fields for each item type
 */
const REQUIRED_FIELDS: Record<ItemType, (keyof CatalogItem)[]> = {
  skill: ['id', 'name', 'description', 'content', 'type'],
  agent: ['id', 'name', 'description', 'content', 'type'],
  command: ['id', 'name', 'description', 'content', 'type'],
  guide: ['id', 'name', 'description', 'content', 'type'],
  hook: ['id', 'name', 'description', 'content', 'type', 'hookEvent', 'hookCommand'],
  package: ['id', 'name', 'description', 'content', 'type'],
}

/**
 * Required sections in content for each item type
 */
const REQUIRED_SECTIONS: Record<ItemType, string[]> = {
  skill: ['Instructions', '사용법', 'How to use', 'Usage'],
  agent: ['Responsibilities', 'Guidelines', '역할', '가이드라인'],
  command: ['Task', 'Steps', '작업', '단계'],
  guide: ['개요', 'Overview', '단계', 'Steps'],
  hook: ['개요', 'Overview', '설정', 'Configuration'],
  package: ['개요', 'Overview', '포함 아이템', 'Contents'],
}

/**
 * Validate a CatalogItem (skill, agent, command, etc.)
 */
export function validateCatalogItem(
  item: Partial<CatalogItem>,
  options: ValidationOptions = {}
): SkillValidationResult {
  const itemType = options.itemType || item.type || 'skill'
  const itemId = item.id || item.name || 'unknown'

  log.info('Validating catalog item', { itemId, itemType })

  const result: SkillValidationResult = {
    valid: true,
    itemId,
    itemType,
    timestamp: new Date().toISOString(),
    summary: {
      errors: 0,
      warnings: 0,
      infos: 0,
      totalIssues: 0,
      examplesFound: 0,
      examplesValid: 0,
    },
    categories: {
      syntax: { category: 'syntax', passed: true, issues: [] },
      structure: { category: 'structure', passed: true, issues: [] },
      tools: { category: 'tools', passed: true, issues: [] },
      examples: { category: 'examples', passed: true, issues: [] },
    },
    exampleValidations: [],
    parsedExamples: [],
  }

  // 1. Syntax validation (required fields)
  validateSyntax(item, itemType, result)

  // 2. Content structure validation
  if (item.content) {
    validateContentStructure(item.content, itemType, result)

    // Parse frontmatter if requested
    if (options.validateFrontmatter) {
      const { frontmatter } = parseFrontmatter(item.content)
      result.parsedFrontmatter = frontmatter
      validateFrontmatter(frontmatter, itemType, result)
    }
  }

  // 3. AllowedTools validation
  if (item.allowedTools) {
    validateAllowedTools(item.allowedTools, result)
  }

  // 4. Example validation
  if (!options.skipExamples && item.content) {
    const examples = parseExamplesFromContent(item.content)
    result.parsedExamples = examples
    result.summary.examplesFound = examples.length

    if (examples.length === 0) {
      result.categories.examples.issues.push({
        code: 'NO_EXAMPLES',
        message: 'No examples found in content',
        severity: 'warning',
        suggestion: 'Add ## Examples section with code blocks or ### sub-headings',
      })
    } else {
      validateExamples(examples, result)
    }
  }

  // Calculate final stats
  calculateSummary(result, options.strictMode)

  log.info('Validation complete', {
    itemId,
    valid: result.valid,
    errors: result.summary.errors,
    warnings: result.summary.warnings,
  })

  return result
}

/**
 * Validate required fields (syntax)
 */
function validateSyntax(
  item: Partial<CatalogItem>,
  itemType: ItemType,
  result: SkillValidationResult
): void {
  const requiredFields = REQUIRED_FIELDS[itemType] || REQUIRED_FIELDS.skill

  for (const field of requiredFields) {
    const value = item[field]
    if (value === undefined || value === null || value === '') {
      result.categories.syntax.issues.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: `Missing required field: ${field}`,
        severity: 'error',
        suggestion: `Add the '${field}' field to your ${itemType}`,
      })
    }
  }

  // Validate ID format
  if (item.id) {
    if (!/^[a-z0-9-]+$/i.test(item.id)) {
      result.categories.syntax.issues.push({
        code: 'INVALID_ID_FORMAT',
        message: `Invalid ID format: ${item.id}`,
        severity: 'error',
        suggestion: 'ID should only contain alphanumeric characters and hyphens',
      })
    }
  }

  // Validate name length
  if (item.name && item.name.length > 100) {
    result.categories.syntax.issues.push({
      code: 'NAME_TOO_LONG',
      message: `Name exceeds 100 characters: ${item.name.length}`,
      severity: 'warning',
      suggestion: 'Keep the name under 100 characters for better display',
    })
  }

  // Validate description length
  if (item.description) {
    if (item.description.length < 10) {
      result.categories.syntax.issues.push({
        code: 'DESCRIPTION_TOO_SHORT',
        message: 'Description is too short (minimum 10 characters)',
        severity: 'warning',
        suggestion: 'Add more detail to help users understand when to use this',
      })
    }
    if (item.description.length > 500) {
      result.categories.syntax.issues.push({
        code: 'DESCRIPTION_TOO_LONG',
        message: `Description exceeds 500 characters: ${item.description.length}`,
        severity: 'warning',
        suggestion: 'Keep description concise; move details to content',
      })
    }
  }

  result.categories.syntax.passed = result.categories.syntax.issues.filter(
    (i) => i.severity === 'error'
  ).length === 0
}

/**
 * Validate content structure
 */
function validateContentStructure(
  content: string,
  itemType: ItemType,
  result: SkillValidationResult
): void {
  const requiredSections = REQUIRED_SECTIONS[itemType] || REQUIRED_SECTIONS.skill

  // Check for at least one required section
  const hasRequiredSection = requiredSections.some((section) => {
    const pattern = new RegExp(`^##?\\s*${section}`, 'im')
    return pattern.test(content)
  })

  if (!hasRequiredSection) {
    result.categories.structure.issues.push({
      code: 'MISSING_REQUIRED_SECTION',
      message: `Missing required section. Expected one of: ${requiredSections.join(', ')}`,
      severity: 'warning',
      suggestion: `Add a section like "## ${requiredSections[0]}" to your content`,
    })
  }

  // Check for empty content
  if (content.trim().length < 50) {
    result.categories.structure.issues.push({
      code: 'CONTENT_TOO_SHORT',
      message: 'Content is too short (minimum 50 characters)',
      severity: 'error',
      suggestion: 'Add more detailed instructions and examples',
    })
  }

  // Check for markdown heading structure
  const hasHeadings = /^#{1,3}\s+.+$/m.test(content)
  if (!hasHeadings) {
    result.categories.structure.issues.push({
      code: 'NO_HEADINGS',
      message: 'No markdown headings found',
      severity: 'warning',
      suggestion: 'Add # or ## headings to structure your content',
    })
  }

  // Check for code blocks (important for skills/commands)
  if (itemType === 'skill' || itemType === 'command') {
    const hasCodeBlocks = /```[\s\S]*?```/.test(content)
    if (!hasCodeBlocks) {
      result.categories.structure.issues.push({
        code: 'NO_CODE_BLOCKS',
        message: 'No code blocks found in content',
        severity: 'info',
        suggestion: 'Consider adding code examples with ``` syntax',
      })
    }
  }

  result.categories.structure.passed = result.categories.structure.issues.filter(
    (i) => i.severity === 'error'
  ).length === 0
}

/**
 * Validate frontmatter fields
 */
function validateFrontmatter(
  frontmatter: ParsedFrontmatter,
  itemType: ItemType,
  result: SkillValidationResult
): void {
  // Validate type matches
  if (frontmatter.type && frontmatter.type !== itemType) {
    result.categories.syntax.issues.push({
      code: 'TYPE_MISMATCH',
      message: `Frontmatter type '${frontmatter.type}' doesn't match item type '${itemType}'`,
      severity: 'error',
      location: { section: 'frontmatter' },
    })
  }

  // Validate tags format
  if (frontmatter.tags) {
    for (const tag of frontmatter.tags) {
      if (!/^[a-z0-9-]+$/i.test(tag)) {
        result.categories.syntax.issues.push({
          code: 'INVALID_TAG_FORMAT',
          message: `Invalid tag format: ${tag}`,
          severity: 'warning',
          location: { section: 'frontmatter' },
          suggestion: 'Tags should only contain alphanumeric characters and hyphens',
        })
      }
    }
  }

  // Validate difficulty
  if (frontmatter.difficulty && !['easy', 'medium', 'hard'].includes(frontmatter.difficulty)) {
    result.categories.syntax.issues.push({
      code: 'INVALID_DIFFICULTY',
      message: `Invalid difficulty: ${frontmatter.difficulty}`,
      severity: 'warning',
      location: { section: 'frontmatter' },
      suggestion: 'Difficulty should be one of: easy, medium, hard',
    })
  }
}

/**
 * Validate allowedTools against CLAUDE_TOOLS
 */
function validateAllowedTools(allowedTools: string, result: SkillValidationResult): void {
  const tools = allowedTools
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  if (tools.length === 0) {
    return // Empty is valid (means all tools allowed)
  }

  const validTools = new Set<string>(CLAUDE_TOOLS)
  const invalidTools: string[] = []
  const validatedTools: string[] = []

  for (const tool of tools) {
    if (validTools.has(tool as ClaudeTool)) {
      validatedTools.push(tool)
    } else {
      invalidTools.push(tool)
    }
  }

  if (invalidTools.length > 0) {
    result.categories.tools.issues.push({
      code: 'INVALID_TOOLS',
      message: `Invalid tool names: ${invalidTools.join(', ')}`,
      severity: 'error',
      suggestion: `Valid tools are: ${CLAUDE_TOOLS.join(', ')}`,
    })
  }

  // Check for duplicate tools
  const uniqueTools = new Set(tools)
  if (uniqueTools.size !== tools.length) {
    result.categories.tools.issues.push({
      code: 'DUPLICATE_TOOLS',
      message: 'Duplicate tool names found in allowedTools',
      severity: 'warning',
      suggestion: 'Remove duplicate tool entries',
    })
  }

  // Check for potentially dangerous combinations
  if (validatedTools.includes('Bash') && validatedTools.includes('Write')) {
    result.categories.tools.issues.push({
      code: 'PERMISSIVE_TOOLS',
      message: 'Both Bash and Write tools allowed - this is highly permissive',
      severity: 'info',
      suggestion: 'Consider limiting to read-only tools for security',
    })
  }

  result.categories.tools.passed = result.categories.tools.issues.filter(
    (i) => i.severity === 'error'
  ).length === 0
}

/**
 * Validate extracted examples
 */
function validateExamples(examples: Example[], result: SkillValidationResult): void {
  let validCount = 0

  for (const example of examples) {
    const validation: ExampleValidation = {
      example,
      valid: true,
      issues: [],
    }

    // Check for empty content
    if (!example.input && !example.output && !example.code) {
      validation.valid = false
      validation.issues.push({
        code: 'EMPTY_EXAMPLE',
        message: `Example ${example.id} has no content`,
        severity: 'error',
        location: { section: `Example: ${example.title || example.id}` },
      })
    }

    // Check for input/output pair completeness
    if (example.input && !example.output && !example.code) {
      validation.issues.push({
        code: 'MISSING_OUTPUT',
        message: `Example ${example.id} has input but no output`,
        severity: 'warning',
        location: { section: `Example: ${example.title || example.id}` },
        suggestion: 'Add expected output to make the example complete',
      })
    }

    // Check for very short examples
    const totalLength = (example.input?.length || 0) + (example.output?.length || 0) + (example.code?.length || 0)
    if (totalLength < 10) {
      validation.issues.push({
        code: 'EXAMPLE_TOO_SHORT',
        message: `Example ${example.id} is very short`,
        severity: 'warning',
        location: { section: `Example: ${example.title || example.id}` },
        suggestion: 'Add more detail to make the example useful',
      })
    }

    // Update validation status
    validation.valid = validation.issues.filter((i) => i.severity === 'error').length === 0
    if (validation.valid) {
      validCount++
    }

    result.exampleValidations.push(validation)

    // Add issues to examples category
    result.categories.examples.issues.push(...validation.issues)
  }

  result.summary.examplesValid = validCount
  result.categories.examples.passed = result.categories.examples.issues.filter(
    (i) => i.severity === 'error'
  ).length === 0
}

/**
 * Calculate final summary statistics
 */
function calculateSummary(result: SkillValidationResult, strictMode?: boolean): void {
  const allIssues = [
    ...result.categories.syntax.issues,
    ...result.categories.structure.issues,
    ...result.categories.tools.issues,
    ...result.categories.examples.issues,
  ]

  result.summary.errors = allIssues.filter((i) => i.severity === 'error').length
  result.summary.warnings = allIssues.filter((i) => i.severity === 'warning').length
  result.summary.infos = allIssues.filter((i) => i.severity === 'info').length
  result.summary.totalIssues = allIssues.length

  // In strict mode, warnings are treated as errors
  if (strictMode) {
    result.valid = result.summary.errors === 0 && result.summary.warnings === 0
  } else {
    result.valid = result.summary.errors === 0
  }
}

/**
 * Validate markdown content directly (for preview/editor)
 */
export function validateSkillContent(
  content: string,
  options: ValidationOptions = {}
): SkillValidationResult {
  const { frontmatter } = parseFrontmatter(content)

  // Create a partial CatalogItem from frontmatter
  const item: Partial<CatalogItem> = {
    id: frontmatter.id,
    name: frontmatter.name,
    description: frontmatter.description,
    type: frontmatter.type || options.itemType || 'skill',
    content,
    tags: frontmatter.tags || [],
    difficulty: frontmatter.difficulty,
    pluginId: frontmatter.pluginId,
  }

  return validateCatalogItem(item, {
    ...options,
    validateFrontmatter: true,
  })
}

/**
 * Quick validation check (returns true/false only)
 */
export function isValidSkill(item: Partial<CatalogItem>): boolean {
  const result = validateCatalogItem(item, { skipExamples: true })
  return result.valid
}

/**
 * Get list of valid tool names
 */
export function getValidTools(): readonly string[] {
  return CLAUDE_TOOLS
}

/**
 * Check if a tool name is valid
 */
export function isValidTool(tool: string): tool is ClaudeTool {
  return CLAUDE_TOOLS.includes(tool as ClaudeTool)
}

/**
 * Parse and validate allowedTools string
 */
export function parseAllowedTools(allowedTools: string): {
  valid: ClaudeTool[]
  invalid: string[]
} {
  const tools = allowedTools
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const valid: ClaudeTool[] = []
  const invalid: string[] = []

  for (const tool of tools) {
    if (isValidTool(tool)) {
      valid.push(tool)
    } else {
      invalid.push(tool)
    }
  }

  return { valid, invalid }
}

/**
 * Generate a human-readable validation report
 */
export function generateValidationReport(result: SkillValidationResult): string {
  const lines: string[] = []

  lines.push(`# Skill Validation Report`)
  lines.push(``)
  lines.push(`**Item:** ${result.itemId}`)
  lines.push(`**Type:** ${result.itemType}`)
  lines.push(`**Time:** ${result.timestamp}`)
  lines.push(`**Status:** ${result.valid ? '✅ Valid' : '❌ Invalid'}`)
  lines.push(``)
  lines.push(`## Summary`)
  lines.push(``)
  lines.push(`| Metric | Count |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Errors | ${result.summary.errors} |`)
  lines.push(`| Warnings | ${result.summary.warnings} |`)
  lines.push(`| Info | ${result.summary.infos} |`)
  lines.push(`| Examples Found | ${result.summary.examplesFound} |`)
  lines.push(`| Examples Valid | ${result.summary.examplesValid} |`)
  lines.push(``)

  // Categories
  for (const [name, category] of Object.entries(result.categories)) {
    if (category.issues.length === 0) continue

    lines.push(`## ${name.charAt(0).toUpperCase() + name.slice(1)} ${category.passed ? '✅' : '❌'}`)
    lines.push(``)

    for (const issue of category.issues) {
      const icon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : 'ℹ️'
      lines.push(`- ${icon} **${issue.code}**: ${issue.message}`)
      if (issue.suggestion) {
        lines.push(`  - 💡 ${issue.suggestion}`)
      }
    }
    lines.push(``)
  }

  return lines.join('\n')
}
