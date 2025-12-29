import { describe, it, expect } from 'vitest'
import {
  parseArgumentHints,
  serializeArgumentHints,
  validateArgumentHint,
  type ArgumentHint,
} from '@/components/features/command/CommandArgumentHintEditor'

describe('CommandArgumentHintEditor utilities', () => {
  describe('parseArgumentHints', () => {
    it('should parse valid JSON array', () => {
      const json = JSON.stringify([
        { name: 'input', type: 'text', description: 'Input value', required: true },
        { name: 'count', type: 'number', description: 'Count', required: false, default: '10' },
      ])

      const hints = parseArgumentHints(json)
      expect(hints).toHaveLength(2)
      expect(hints[0].name).toBe('input')
      expect(hints[0].type).toBe('text')
      expect(hints[0].required).toBe(true)
      expect(hints[1].name).toBe('count')
      expect(hints[1].default).toBe('10')
    })

    it('should add missing fields with defaults', () => {
      const json = JSON.stringify([{ name: 'test' }])

      const hints = parseArgumentHints(json)
      expect(hints[0].type).toBe('text')
      expect(hints[0].description).toBe('')
      expect(hints[0].required).toBe(false)
      expect(hints[0].id).toBeDefined()
    })

    it('should generate IDs for items without them', () => {
      const json = JSON.stringify([
        { name: 'a', type: 'text' },
        { name: 'b', type: 'number' },
      ])

      const hints = parseArgumentHints(json)
      expect(hints[0].id).toBeDefined()
      expect(hints[1].id).toBeDefined()
      expect(hints[0].id).not.toBe(hints[1].id)
    })

    it('should return empty array for invalid JSON', () => {
      expect(parseArgumentHints('invalid')).toEqual([])
      expect(parseArgumentHints('{')).toEqual([])
      expect(parseArgumentHints('')).toEqual([])
    })

    it('should return empty array for non-array JSON', () => {
      expect(parseArgumentHints('{"name": "test"}')).toEqual([])
      expect(parseArgumentHints('"string"')).toEqual([])
      expect(parseArgumentHints('123')).toEqual([])
    })

    it('should preserve optional fields', () => {
      const json = JSON.stringify([
        {
          name: 'level',
          type: 'enum',
          enumValues: ['low', 'medium', 'high'],
          placeholder: 'Select level',
          autocomplete: {
            enabled: true,
            source: 'static',
            values: ['low', 'medium', 'high'],
          },
          validation: {
            pattern: '^(low|medium|high)$',
          },
        },
      ])

      const hints = parseArgumentHints(json)
      expect(hints[0].enumValues).toEqual(['low', 'medium', 'high'])
      expect(hints[0].placeholder).toBe('Select level')
      expect(hints[0].autocomplete?.enabled).toBe(true)
      expect(hints[0].validation?.pattern).toBe('^(low|medium|high)$')
    })
  })

  describe('serializeArgumentHints', () => {
    it('should serialize hints to JSON', () => {
      const hints: ArgumentHint[] = [
        {
          id: 'arg_1',
          name: 'input',
          type: 'text',
          description: 'Input value',
          required: true,
        },
      ]

      const json = serializeArgumentHints(hints)
      const parsed = JSON.parse(json)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].name).toBe('input')
      expect(parsed[0].id).toBeUndefined() // ID should be excluded
    })

    it('should serialize all fields except id', () => {
      const hints: ArgumentHint[] = [
        {
          id: 'arg_1',
          name: 'level',
          type: 'enum',
          description: 'Log level',
          required: false,
          default: 'info',
          placeholder: 'Select level',
          enumValues: ['debug', 'info', 'warn', 'error'],
          autocomplete: {
            enabled: true,
            source: 'static',
            values: ['debug', 'info', 'warn', 'error'],
          },
          validation: {
            pattern: '^(debug|info|warn|error)$',
          },
        },
      ]

      const json = serializeArgumentHints(hints)
      const parsed = JSON.parse(json)

      expect(parsed[0].id).toBeUndefined()
      expect(parsed[0].name).toBe('level')
      expect(parsed[0].enumValues).toEqual(['debug', 'info', 'warn', 'error'])
      expect(parsed[0].autocomplete).toBeDefined()
      expect(parsed[0].validation).toBeDefined()
    })

    it('should produce formatted JSON', () => {
      const hints: ArgumentHint[] = [
        {
          id: 'arg_1',
          name: 'test',
          type: 'text',
          description: 'Test',
          required: true,
        },
      ]

      const json = serializeArgumentHints(hints)
      expect(json).toContain('\n') // Should be formatted with newlines
    })

    it('should handle empty array', () => {
      const json = serializeArgumentHints([])
      expect(json).toBe('[]')
    })
  })

  describe('validateArgumentHint', () => {
    it('should validate correct hint', () => {
      const hint: ArgumentHint = {
        id: 'arg_1',
        name: 'input',
        type: 'text',
        description: 'Input value',
        required: true,
      }

      const result = validateArgumentHint(hint)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect missing name', () => {
      const hint: ArgumentHint = {
        id: 'arg_1',
        name: '',
        type: 'text',
        description: 'Test',
        required: true,
      }

      const result = validateArgumentHint(hint)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Argument name is required')
    })

    it('should detect invalid name format', () => {
      const invalidNames = ['123test', '-test', '_test', 'test name', 'test.name']

      for (const name of invalidNames) {
        const hint: ArgumentHint = {
          id: 'arg_1',
          name,
          type: 'text',
          description: 'Test',
          required: true,
        }

        const result = validateArgumentHint(hint)
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => e.includes('must start with a letter'))).toBe(true)
      }
    })

    it('should accept valid name formats', () => {
      const validNames = ['input', 'inputValue', 'input_value', 'input-value', 'a1', 'testArg123']

      for (const name of validNames) {
        const hint: ArgumentHint = {
          id: 'arg_1',
          name,
          type: 'text',
          description: 'Test',
          required: true,
        }

        const result = validateArgumentHint(hint)
        expect(result.valid).toBe(true)
      }
    })

    it('should detect enum without values', () => {
      const hint: ArgumentHint = {
        id: 'arg_1',
        name: 'level',
        type: 'enum',
        description: 'Level',
        required: true,
        enumValues: [],
      }

      const result = validateArgumentHint(hint)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Enum type requires at least one value')
    })

    it('should accept enum with values', () => {
      const hint: ArgumentHint = {
        id: 'arg_1',
        name: 'level',
        type: 'enum',
        description: 'Level',
        required: true,
        enumValues: ['low', 'high'],
      }

      const result = validateArgumentHint(hint)
      expect(result.valid).toBe(true)
    })

    it('should detect invalid regex pattern', () => {
      const hint: ArgumentHint = {
        id: 'arg_1',
        name: 'input',
        type: 'text',
        description: 'Input',
        required: true,
        validation: {
          pattern: '[invalid(regex',
        },
      }

      const result = validateArgumentHint(hint)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Invalid regex pattern')
    })

    it('should accept valid regex pattern', () => {
      const hint: ArgumentHint = {
        id: 'arg_1',
        name: 'email',
        type: 'text',
        description: 'Email',
        required: true,
        validation: {
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
        },
      }

      const result = validateArgumentHint(hint)
      expect(result.valid).toBe(true)
    })

    it('should detect min greater than max', () => {
      const hint: ArgumentHint = {
        id: 'arg_1',
        name: 'count',
        type: 'number',
        description: 'Count',
        required: true,
        validation: {
          min: 100,
          max: 10,
        },
      }

      const result = validateArgumentHint(hint)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Min value cannot be greater than max value')
    })

    it('should detect minLength greater than maxLength', () => {
      const hint: ArgumentHint = {
        id: 'arg_1',
        name: 'input',
        type: 'text',
        description: 'Input',
        required: true,
        validation: {
          minLength: 100,
          maxLength: 10,
        },
      }

      const result = validateArgumentHint(hint)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Min length cannot be greater than max length')
    })

    it('should accept valid min/max constraints', () => {
      const hint: ArgumentHint = {
        id: 'arg_1',
        name: 'count',
        type: 'number',
        description: 'Count',
        required: true,
        validation: {
          min: 0,
          max: 100,
          minLength: 1,
          maxLength: 10,
        },
      }

      const result = validateArgumentHint(hint)
      expect(result.valid).toBe(true)
    })

    it('should handle multiple errors', () => {
      const hint: ArgumentHint = {
        id: 'arg_1',
        name: '',
        type: 'enum',
        description: 'Test',
        required: true,
        enumValues: [],
        validation: {
          pattern: '[invalid',
          min: 100,
          max: 10,
        },
      }

      const result = validateArgumentHint(hint)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(1)
    })
  })

  describe('roundtrip', () => {
    it('should parse and serialize back to equivalent JSON', () => {
      const originalHints: ArgumentHint[] = [
        {
          id: 'arg_1',
          name: 'input',
          type: 'file',
          description: 'Input file',
          required: true,
          placeholder: 'path/to/file',
        },
        {
          id: 'arg_2',
          name: 'format',
          type: 'enum',
          description: 'Output format',
          required: false,
          default: 'json',
          enumValues: ['json', 'yaml', 'xml'],
          autocomplete: {
            enabled: true,
            source: 'static',
            values: ['json', 'yaml', 'xml'],
          },
        },
      ]

      const json = serializeArgumentHints(originalHints)
      const parsed = parseArgumentHints(json)

      expect(parsed).toHaveLength(2)
      expect(parsed[0].name).toBe('input')
      expect(parsed[0].type).toBe('file')
      expect(parsed[1].enumValues).toEqual(['json', 'yaml', 'xml'])
    })
  })
})
