import type { ArgumentHint } from './types'

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `arg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create default argument hint
 */
export function createDefaultHint(): ArgumentHint {
  return {
    id: generateId(),
    name: '',
    type: 'text',
    description: '',
    required: false,
  }
}

/**
 * Parse argument hints from JSON string
 */
export function parseArgumentHints(json: string): ArgumentHint[] {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.map((item: Partial<ArgumentHint>) => ({
      id: item.id || generateId(),
      name: item.name || '',
      type: item.type || 'text',
      description: item.description || '',
      required: item.required ?? false,
      default: item.default,
      placeholder: item.placeholder,
      enumValues: item.enumValues,
      autocomplete: item.autocomplete,
      validation: item.validation,
    }))
  } catch {
    return []
  }
}

/**
 * Serialize argument hints to JSON string
 */
export function serializeArgumentHints(hints: ArgumentHint[]): string {
  return JSON.stringify(
    hints.map(({ id: _id, ...rest }) => rest),
    null,
    2
  )
}

/**
 * Validate an argument hint configuration
 */
export function validateArgumentHint(hint: ArgumentHint): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!hint.name || hint.name.trim().length === 0) {
    errors.push('Argument name is required')
  } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(hint.name)) {
    errors.push('Argument name must start with a letter and contain only letters, numbers, underscores, and hyphens')
  }

  if (hint.type === 'enum' && (!hint.enumValues || hint.enumValues.length === 0)) {
    errors.push('Enum type requires at least one value')
  }

  if (hint.validation?.pattern) {
    try {
      new RegExp(hint.validation.pattern)
    } catch {
      errors.push('Invalid regex pattern')
    }
  }

  if (hint.validation?.min !== undefined && hint.validation?.max !== undefined) {
    if (hint.validation.min > hint.validation.max) {
      errors.push('Min value cannot be greater than max value')
    }
  }

  if (hint.validation?.minLength !== undefined && hint.validation?.maxLength !== undefined) {
    if (hint.validation.minLength > hint.validation.maxLength) {
      errors.push('Min length cannot be greater than max length')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
