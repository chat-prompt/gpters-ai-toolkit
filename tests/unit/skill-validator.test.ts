/**
 * Skill Validator Tests
 *
 * Unit tests for skill syntax, example, and tool validation
 */

import { describe, it, expect } from 'vitest'
import {
  validateCatalogItem,
  validateSkillContent,
  isValidSkill,
  getValidTools,
  isValidTool,
  parseAllowedTools,
  generateValidationReport,
  type ValidationOptions,
} from '@/lib/plugin/skill-validator'
import type { CatalogItem } from '@/lib/core/types'

// Helper to create a minimal valid skill
function createValidSkill(overrides: Partial<CatalogItem> = {}): Partial<CatalogItem> {
  return {
    id: 'test-skill',
    type: 'skill',
    name: 'Test Skill',
    description: 'A test skill for validation testing purposes',
    content: `# Test Skill

## Instructions

Follow these steps to use this skill:

1. First step
2. Second step
3. Third step

## Examples

### Basic Usage

\`\`\`bash
echo "Hello World"
\`\`\`

## Best Practices

- Practice 1
- Practice 2
`,
    author: 'test',
    tags: ['test'],
    likes: 0,
    ...overrides,
  }
}

describe('Skill Validator', () => {
  describe('validateCatalogItem', () => {
    it('should validate a valid skill', () => {
      const skill = createValidSkill()
      const result = validateCatalogItem(skill)

      expect(result.valid).toBe(true)
      expect(result.summary.errors).toBe(0)
      expect(result.itemType).toBe('skill')
    })

    it('should detect missing required fields', () => {
      const skill = createValidSkill({ name: '' })
      const result = validateCatalogItem(skill)

      expect(result.categories.syntax.passed).toBe(false)
      expect(result.categories.syntax.issues.some((i) => i.code === 'MISSING_REQUIRED_FIELD')).toBe(true)
    })

    it('should validate ID format', () => {
      const skill = createValidSkill({ id: 'invalid id with spaces!' })
      const result = validateCatalogItem(skill)

      expect(result.categories.syntax.issues.some((i) => i.code === 'INVALID_ID_FORMAT')).toBe(true)
    })

    it('should warn about long names', () => {
      const skill = createValidSkill({ name: 'a'.repeat(150) })
      const result = validateCatalogItem(skill)

      expect(result.categories.syntax.issues.some((i) => i.code === 'NAME_TOO_LONG')).toBe(true)
    })

    it('should warn about short descriptions', () => {
      const skill = createValidSkill({ description: 'Short' })
      const result = validateCatalogItem(skill)

      expect(result.categories.syntax.issues.some((i) => i.code === 'DESCRIPTION_TOO_SHORT')).toBe(true)
    })

    it('should validate different item types', () => {
      const agent = createValidSkill({ type: 'agent', id: 'test-agent' })
      const result = validateCatalogItem(agent, { itemType: 'agent' })

      expect(result.itemType).toBe('agent')
    })
  })

  describe('Content Structure Validation', () => {
    it('should detect missing required sections', () => {
      const skill = createValidSkill({
        content: '# Just a title\n\nSome content without proper sections.',
      })
      const result = validateCatalogItem(skill)

      expect(result.categories.structure.issues.some((i) => i.code === 'MISSING_REQUIRED_SECTION')).toBe(true)
    })

    it('should detect very short content', () => {
      const skill = createValidSkill({
        content: '# Short',
      })
      const result = validateCatalogItem(skill)

      expect(result.categories.structure.issues.some((i) => i.code === 'CONTENT_TOO_SHORT')).toBe(true)
    })

    it('should warn about missing headings', () => {
      const skill = createValidSkill({
        content: 'This is just plain text without any markdown headings. It is long enough to pass the length check but has no structure.',
      })
      const result = validateCatalogItem(skill)

      expect(result.categories.structure.issues.some((i) => i.code === 'NO_HEADINGS')).toBe(true)
    })

    it('should accept valid content structure', () => {
      const skill = createValidSkill()
      const result = validateCatalogItem(skill)

      expect(result.categories.structure.passed).toBe(true)
    })
  })

  describe('AllowedTools Validation', () => {
    it('should validate correct tool names', () => {
      const skill = createValidSkill({ allowedTools: 'Read, Write, Grep' })
      const result = validateCatalogItem(skill)

      expect(result.categories.tools.passed).toBe(true)
      expect(result.categories.tools.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
    })

    it('should detect invalid tool names', () => {
      const skill = createValidSkill({ allowedTools: 'Read, FakeCommand, InvalidTool' })
      const result = validateCatalogItem(skill)

      expect(result.categories.tools.passed).toBe(false)
      expect(result.categories.tools.issues.some((i) => i.code === 'INVALID_TOOLS')).toBe(true)
    })

    it('should warn about duplicate tools', () => {
      const skill = createValidSkill({ allowedTools: 'Read, Write, Read' })
      const result = validateCatalogItem(skill)

      expect(result.categories.tools.issues.some((i) => i.code === 'DUPLICATE_TOOLS')).toBe(true)
    })

    it('should warn about permissive tool combinations', () => {
      const skill = createValidSkill({ allowedTools: 'Bash, Write' })
      const result = validateCatalogItem(skill)

      expect(result.categories.tools.issues.some((i) => i.code === 'PERMISSIVE_TOOLS')).toBe(true)
    })

    it('should accept empty allowedTools', () => {
      const skill = createValidSkill({ allowedTools: '' })
      const result = validateCatalogItem(skill)

      expect(result.categories.tools.passed).toBe(true)
    })
  })

  describe('Example Validation', () => {
    it('should extract and validate examples', () => {
      const skill = createValidSkill()
      const result = validateCatalogItem(skill)

      expect(result.summary.examplesFound).toBeGreaterThan(0)
      expect(result.parsedExamples.length).toBeGreaterThan(0)
    })

    it('should warn when no examples found', () => {
      const skill = createValidSkill({
        content: `# Test Skill

## Instructions

1. Step one
2. Step two
3. Step three

## Best Practices

- Practice 1
`,
      })
      const result = validateCatalogItem(skill)

      expect(result.categories.examples.issues.some((i) => i.code === 'NO_EXAMPLES')).toBe(true)
    })

    it('should skip examples when option set', () => {
      const skill = createValidSkill()
      const result = validateCatalogItem(skill, { skipExamples: true })

      expect(result.summary.examplesFound).toBe(0)
      expect(result.exampleValidations).toHaveLength(0)
    })

    it('should detect empty examples', () => {
      const skill = createValidSkill({
        content: `# Test Skill

## Instructions

1. Step one

## Examples

### Empty Example

`,
      })
      const result = validateCatalogItem(skill)

      // Empty example won't be parsed as valid
      expect(result.summary.examplesFound).toBe(0)
    })
  })

  describe('Strict Mode', () => {
    it('should treat warnings as errors in strict mode', () => {
      const skill = createValidSkill({ description: 'Short' }) // Generates warning

      const normalResult = validateCatalogItem(skill)
      const strictResult = validateCatalogItem(skill, { strictMode: true })

      expect(normalResult.valid).toBe(true) // Warning doesn't fail
      expect(strictResult.valid).toBe(false) // Warning fails in strict mode
    })
  })

  describe('validateSkillContent', () => {
    it('should validate markdown content directly', () => {
      const content = `---
type: skill
name: My Skill
description: A skill that does something useful
---

# My Skill

## Instructions

Follow these steps.

## Examples

\`\`\`
example code
\`\`\`
`
      const result = validateSkillContent(content)

      expect(result.parsedFrontmatter).toBeDefined()
      expect(result.parsedFrontmatter?.name).toBe('My Skill')
    })

    it('should detect frontmatter type mismatch', () => {
      const content = `---
type: agent
name: My Skill
---

# Content
`
      const result = validateSkillContent(content, { itemType: 'skill' })

      expect(result.categories.syntax.issues.some((i) => i.code === 'TYPE_MISMATCH')).toBe(true)
    })
  })

  describe('isValidSkill', () => {
    it('should return true for valid skill', () => {
      const skill = createValidSkill()
      expect(isValidSkill(skill)).toBe(true)
    })

    it('should return false for invalid skill', () => {
      const skill = createValidSkill({ content: '' })
      expect(isValidSkill(skill)).toBe(false)
    })
  })

  describe('getValidTools', () => {
    it('should return list of valid tools', () => {
      const tools = getValidTools()

      expect(tools).toContain('Read')
      expect(tools).toContain('Write')
      expect(tools).toContain('Edit')
      expect(tools).toContain('Bash')
      expect(tools).toContain('Glob')
      expect(tools).toContain('Grep')
    })

    it('should not contain invalid tools', () => {
      const tools = getValidTools()

      expect(tools).not.toContain('FakeCommand')
      expect(tools).not.toContain('InvalidTool')
    })
  })

  describe('isValidTool', () => {
    it('should return true for valid tools', () => {
      expect(isValidTool('Read')).toBe(true)
      expect(isValidTool('Write')).toBe(true)
      expect(isValidTool('Bash')).toBe(true)
    })

    it('should return false for invalid tools', () => {
      expect(isValidTool('FakeCommand')).toBe(false)
      expect(isValidTool('InvalidTool')).toBe(false)
      expect(isValidTool('')).toBe(false)
    })
  })

  describe('parseAllowedTools', () => {
    it('should parse valid tools correctly', () => {
      const result = parseAllowedTools('Read, Write, Grep')

      expect(result.valid).toEqual(['Read', 'Write', 'Grep'])
      expect(result.invalid).toEqual([])
    })

    it('should separate valid and invalid tools', () => {
      const result = parseAllowedTools('Read, FakeCommand, Write, InvalidTool')

      expect(result.valid).toEqual(['Read', 'Write'])
      expect(result.invalid).toEqual(['FakeCommand', 'InvalidTool'])
    })

    it('should handle empty string', () => {
      const result = parseAllowedTools('')

      expect(result.valid).toEqual([])
      expect(result.invalid).toEqual([])
    })

    it('should handle whitespace correctly', () => {
      const result = parseAllowedTools('  Read  ,  Write  ,  Grep  ')

      expect(result.valid).toEqual(['Read', 'Write', 'Grep'])
    })
  })

  describe('generateValidationReport', () => {
    it('should generate markdown report', () => {
      const skill = createValidSkill()
      const result = validateCatalogItem(skill)
      const report = generateValidationReport(result)

      expect(report).toContain('# Skill Validation Report')
      expect(report).toContain('**Item:** test-skill')
      expect(report).toContain('**Type:** skill')
      expect(report).toContain('## Summary')
    })

    it('should include issues in report', () => {
      const skill = createValidSkill({ allowedTools: 'Read, FakeCommand' })
      const result = validateCatalogItem(skill)
      const report = generateValidationReport(result)

      expect(report).toContain('INVALID_TOOLS')
      expect(report).toContain('FakeCommand')
    })

    it('should show status indicators', () => {
      const skill = createValidSkill()
      const result = validateCatalogItem(skill)
      const report = generateValidationReport(result)

      expect(report).toContain('✅ Valid')
    })
  })

  describe('Validation Summary', () => {
    it('should calculate correct summary statistics', () => {
      const skill = createValidSkill({
        allowedTools: 'Read, FakeCommand', // 1 error
        description: 'Short', // 1 warning
      })
      const result = validateCatalogItem(skill)

      expect(result.summary.errors).toBe(1)
      expect(result.summary.warnings).toBeGreaterThanOrEqual(1)
      expect(result.summary.totalIssues).toBeGreaterThan(0)
    })

    it('should count examples correctly', () => {
      const skill = createValidSkill()
      const result = validateCatalogItem(skill)

      expect(result.summary.examplesFound).toBeGreaterThan(0)
      expect(result.summary.examplesValid).toBeLessThanOrEqual(result.summary.examplesFound)
    })
  })

  describe('Hook Validation', () => {
    it('should require hook-specific fields for hooks', () => {
      const hook: Partial<CatalogItem> = {
        id: 'test-hook',
        type: 'hook',
        name: 'Test Hook',
        description: 'A hook that runs on events',
        content: '# Test Hook\n\n## Overview\n\nThis hook does something.',
        author: 'test',
        tags: [],
        likes: 0,
        // Missing hookEvent and hookCommand
      }

      const result = validateCatalogItem(hook, { itemType: 'hook' })

      expect(result.categories.syntax.issues.some((i) =>
        i.code === 'MISSING_REQUIRED_FIELD' && i.message.includes('hookEvent')
      )).toBe(true)
      expect(result.categories.syntax.issues.some((i) =>
        i.code === 'MISSING_REQUIRED_FIELD' && i.message.includes('hookCommand')
      )).toBe(true)
    })

    it('should pass for complete hook', () => {
      const hook: Partial<CatalogItem> = {
        id: 'test-hook',
        type: 'hook',
        name: 'Test Hook',
        description: 'A hook that runs on events',
        content: `# Test Hook

## Overview

This hook runs before compaction.

## Configuration

Add to settings.json.
`,
        author: 'test',
        tags: [],
        likes: 0,
        hookEvent: 'PreCompact',
        hookCommand: 'echo "Hello"',
      }

      const result = validateCatalogItem(hook, { itemType: 'hook' })

      expect(result.categories.syntax.passed).toBe(true)
    })
  })

  describe('Agent Validation', () => {
    it('should validate agent-specific fields', () => {
      const agent: Partial<CatalogItem> = {
        id: 'test-agent',
        type: 'agent',
        name: 'Test Agent',
        description: 'An agent that helps with testing',
        content: `# Test Agent

You are a specialized testing agent.

## Responsibilities

- Help with testing
- Write test cases

## Guidelines

- Be thorough
- Be accurate
`,
        author: 'test',
        tags: [],
        likes: 0,
        agentModel: 'sonnet',
        agentPermissionMode: 'default',
      }

      const result = validateCatalogItem(agent, { itemType: 'agent' })

      expect(result.valid).toBe(true)
      expect(result.itemType).toBe('agent')
    })
  })

  describe('Command Validation', () => {
    it('should validate command-specific content', () => {
      const command: Partial<CatalogItem> = {
        id: 'test-command',
        type: 'command',
        name: 'Test Command',
        description: 'A command for testing',
        content: `# Test Command

## Task

Execute $ARGUMENTS

## Steps

1. Parse arguments
2. Execute task
3. Report results
`,
        author: 'test',
        tags: [],
        likes: 0,
        commandArgumentHint: '[message]',
      }

      const result = validateCatalogItem(command, { itemType: 'command' })

      expect(result.valid).toBe(true)
      expect(result.itemType).toBe('command')
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined item', () => {
      const result = validateCatalogItem({})

      expect(result.valid).toBe(false)
      expect(result.summary.errors).toBeGreaterThan(0)
    })

    it('should handle null values in fields', () => {
      const skill = createValidSkill({ content: null as unknown as string })
      const result = validateCatalogItem(skill)

      expect(result.categories.syntax.issues.some((i) => i.code === 'MISSING_REQUIRED_FIELD')).toBe(true)
    })

    it('should handle special characters in content', () => {
      const skill = createValidSkill({
        content: `# Test

## Instructions

Handle special chars: <script>alert('xss')</script> & "quotes" © ™

## Examples

\`\`\`
code with < > & "
\`\`\`
`,
      })
      const result = validateCatalogItem(skill)

      expect(result.categories.structure.passed).toBe(true)
    })

    it('should handle Unicode content', () => {
      const skill = createValidSkill({
        content: `# 테스트 스킬

## 사용법

한글 내용을 포함한 스킬입니다.

## 예시

\`\`\`
예시 코드
\`\`\`
`,
      })
      const result = validateCatalogItem(skill)

      expect(result.valid).toBe(true)
    })
  })
})
