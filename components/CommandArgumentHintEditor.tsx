'use client'

import { useState, useCallback } from 'react'

/**
 * Argument types supported by commands
 */
export type ArgumentHintType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'file'
  | 'directory'
  | 'enum'
  | 'array'
  | 'json'

/**
 * Single argument hint definition
 */
export interface ArgumentHint {
  id: string
  name: string
  type: ArgumentHintType
  description: string
  required: boolean
  default?: string
  placeholder?: string
  enumValues?: string[]
  autocomplete?: AutocompleteConfig
  validation?: ValidationRule
}

/**
 * Autocomplete configuration
 */
export interface AutocompleteConfig {
  enabled: boolean
  source: 'static' | 'dynamic' | 'file' | 'command'
  values?: string[]
  command?: string
  filePattern?: string
}

/**
 * Validation rule for arguments
 */
export interface ValidationRule {
  pattern?: string
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  custom?: string
}

/**
 * Props for ArgumentHintEditor component
 */
interface ArgumentHintEditorProps {
  hints: ArgumentHint[]
  onChange: (hints: ArgumentHint[]) => void
  readonly?: boolean
}

/**
 * Props for single ArgumentRow component
 */
interface ArgumentRowProps {
  hint: ArgumentHint
  onUpdate: (hint: ArgumentHint) => void
  onDelete: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  readonly?: boolean
  isFirst: boolean
  isLast: boolean
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `arg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create default argument hint
 */
function createDefaultHint(): ArgumentHint {
  return {
    id: generateId(),
    name: '',
    type: 'text',
    description: '',
    required: false,
  }
}

/**
 * Argument type options with descriptions
 */
const ARGUMENT_TYPES: Array<{ value: ArgumentHintType; label: string; description: string }> = [
  { value: 'text', label: 'Text', description: 'Single line text input' },
  { value: 'number', label: 'Number', description: 'Numeric value' },
  { value: 'boolean', label: 'Boolean', description: 'True/false toggle' },
  { value: 'file', label: 'File', description: 'File path' },
  { value: 'directory', label: 'Directory', description: 'Directory path' },
  { value: 'enum', label: 'Enum', description: 'Selection from predefined values' },
  { value: 'array', label: 'Array', description: 'List of values' },
  { value: 'json', label: 'JSON', description: 'JSON object or array' },
]

/**
 * Single argument row component
 */
function ArgumentRow({
  hint,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  readonly = false,
  isFirst,
  isLast,
}: ArgumentRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAutocomplete, setShowAutocomplete] = useState(hint.autocomplete?.enabled || false)
  const [showValidation, setShowValidation] = useState(!!hint.validation)

  const updateField = useCallback(
    <K extends keyof ArgumentHint>(field: K, value: ArgumentHint[K]) => {
      onUpdate({ ...hint, [field]: value })
    },
    [hint, onUpdate]
  )

  const updateAutocomplete = useCallback(
    (config: Partial<AutocompleteConfig>) => {
      onUpdate({
        ...hint,
        autocomplete: {
          enabled: true,
          source: 'static',
          ...hint.autocomplete,
          ...config,
        },
      })
    },
    [hint, onUpdate]
  )

  const updateValidation = useCallback(
    (rule: Partial<ValidationRule>) => {
      onUpdate({
        ...hint,
        validation: {
          ...hint.validation,
          ...rule,
        },
      })
    },
    [hint, onUpdate]
  )

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg mb-3">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <input
          type="text"
          value={hint.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="Argument name"
          className="flex-1 px-2 py-1 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={readonly}
        />

        <select
          value={hint.type}
          onChange={(e) => updateField('type', e.target.value as ArgumentHintType)}
          className="px-2 py-1 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
          disabled={readonly}
        >
          {ARGUMENT_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={hint.required}
            onChange={(e) => updateField('required', e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            disabled={readonly}
          />
          <span className="text-gray-600 dark:text-gray-400">Required</span>
        </label>

        {!readonly && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
              aria-label="Move up"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
              aria-label="Move down"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1 text-red-400 hover:text-red-600"
              aria-label="Delete argument"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={hint.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Describe what this argument does..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
              disabled={readonly}
            />
          </div>

          {/* Default value and placeholder */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Default Value
              </label>
              <input
                type="text"
                value={hint.default || ''}
                onChange={(e) => updateField('default', e.target.value || undefined)}
                placeholder="Default value..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={readonly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Placeholder
              </label>
              <input
                type="text"
                value={hint.placeholder || ''}
                onChange={(e) => updateField('placeholder', e.target.value || undefined)}
                placeholder="Input placeholder..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={readonly}
              />
            </div>
          </div>

          {/* Enum values (only for enum type) */}
          {hint.type === 'enum' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Enum Values <span className="text-gray-400">(comma-separated)</span>
              </label>
              <input
                type="text"
                value={hint.enumValues?.join(', ') || ''}
                onChange={(e) =>
                  updateField(
                    'enumValues',
                    e.target.value
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="option1, option2, option3"
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={readonly}
              />
            </div>
          )}

          {/* Autocomplete section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <input
                type="checkbox"
                checked={showAutocomplete}
                onChange={(e) => {
                  setShowAutocomplete(e.target.checked)
                  if (!e.target.checked) {
                    onUpdate({ ...hint, autocomplete: undefined })
                  }
                }}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                disabled={readonly}
              />
              Enable Autocomplete
            </label>

            {showAutocomplete && (
              <div className="ml-6 space-y-3">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Source
                  </label>
                  <select
                    value={hint.autocomplete?.source || 'static'}
                    onChange={(e) =>
                      updateAutocomplete({ source: e.target.value as AutocompleteConfig['source'] })
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                    disabled={readonly}
                  >
                    <option value="static">Static Values</option>
                    <option value="dynamic">Dynamic (API)</option>
                    <option value="file">File System</option>
                    <option value="command">Command Output</option>
                  </select>
                </div>

                {hint.autocomplete?.source === 'static' && (
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Values <span className="text-gray-400">(comma-separated)</span>
                    </label>
                    <input
                      type="text"
                      value={hint.autocomplete?.values?.join(', ') || ''}
                      onChange={(e) =>
                        updateAutocomplete({
                          values: e.target.value
                            .split(',')
                            .map((v) => v.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="value1, value2, value3"
                      className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                      disabled={readonly}
                    />
                  </div>
                )}

                {hint.autocomplete?.source === 'file' && (
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                      File Pattern
                    </label>
                    <input
                      type="text"
                      value={hint.autocomplete?.filePattern || ''}
                      onChange={(e) => updateAutocomplete({ filePattern: e.target.value })}
                      placeholder="**/*.ts, **/*.json"
                      className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                      disabled={readonly}
                    />
                  </div>
                )}

                {hint.autocomplete?.source === 'command' && (
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Command
                    </label>
                    <input
                      type="text"
                      value={hint.autocomplete?.command || ''}
                      onChange={(e) => updateAutocomplete({ command: e.target.value })}
                      placeholder="git branch --list"
                      className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                      disabled={readonly}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Validation section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <input
                type="checkbox"
                checked={showValidation}
                onChange={(e) => {
                  setShowValidation(e.target.checked)
                  if (!e.target.checked) {
                    onUpdate({ ...hint, validation: undefined })
                  }
                }}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                disabled={readonly}
              />
              Enable Validation
            </label>

            {showValidation && (
              <div className="ml-6 space-y-3">
                {(hint.type === 'text' || hint.type === 'array' || hint.type === 'json') && (
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Regex Pattern
                    </label>
                    <input
                      type="text"
                      value={hint.validation?.pattern || ''}
                      onChange={(e) => updateValidation({ pattern: e.target.value || undefined })}
                      placeholder="^[a-zA-Z0-9_]+$"
                      className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                      disabled={readonly}
                    />
                  </div>
                )}

                {hint.type === 'number' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Min Value
                      </label>
                      <input
                        type="number"
                        value={hint.validation?.min ?? ''}
                        onChange={(e) =>
                          updateValidation({
                            min: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="0"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                        disabled={readonly}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Max Value
                      </label>
                      <input
                        type="number"
                        value={hint.validation?.max ?? ''}
                        onChange={(e) =>
                          updateValidation({
                            max: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="100"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                        disabled={readonly}
                      />
                    </div>
                  </div>
                )}

                {(hint.type === 'text' || hint.type === 'array') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Min Length
                      </label>
                      <input
                        type="number"
                        value={hint.validation?.minLength ?? ''}
                        onChange={(e) =>
                          updateValidation({
                            minLength: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="1"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                        disabled={readonly}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Max Length
                      </label>
                      <input
                        type="number"
                        value={hint.validation?.maxLength ?? ''}
                        onChange={(e) =>
                          updateValidation({
                            maxLength: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="255"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                        disabled={readonly}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Custom Validation Rule
                  </label>
                  <input
                    type="text"
                    value={hint.validation?.custom || ''}
                    onChange={(e) => updateValidation({ custom: e.target.value || undefined })}
                    placeholder="value.startsWith('prefix_')"
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                    disabled={readonly}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Main CommandArgumentHintEditor component
 */
export function CommandArgumentHintEditor({
  hints,
  onChange,
  readonly = false,
}: ArgumentHintEditorProps) {
  const addArgument = useCallback(() => {
    onChange([...hints, createDefaultHint()])
  }, [hints, onChange])

  const updateArgument = useCallback(
    (index: number, hint: ArgumentHint) => {
      const newHints = [...hints]
      newHints[index] = hint
      onChange(newHints)
    },
    [hints, onChange]
  )

  const deleteArgument = useCallback(
    (index: number) => {
      onChange(hints.filter((_, i) => i !== index))
    },
    [hints, onChange]
  )

  const moveArgument = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= hints.length) return
      const newHints = [...hints]
      const [removed] = newHints.splice(from, 1)
      newHints.splice(to, 0, removed)
      onChange(newHints)
    },
    [hints, onChange]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Command Arguments</h3>
        {!readonly && (
          <button
            type="button"
            onClick={addArgument}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Argument
          </button>
        )}
      </div>

      {hints.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          <svg
            className="w-12 h-12 mx-auto text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No arguments defined yet.
            {!readonly && ' Click "Add Argument" to get started.'}
          </p>
        </div>
      ) : (
        <div>
          {hints.map((hint, index) => (
            <ArgumentRow
              key={hint.id}
              hint={hint}
              onUpdate={(updated) => updateArgument(index, updated)}
              onDelete={() => deleteArgument(index)}
              onMoveUp={() => moveArgument(index, index - 1)}
              onMoveDown={() => moveArgument(index, index + 1)}
              readonly={readonly}
              isFirst={index === 0}
              isLast={index === hints.length - 1}
            />
          ))}
        </div>
      )}

      {/* Preview/Summary */}
      {hints.length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Usage Preview
          </h4>
          <code className="block text-sm font-mono text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700">
            /command{' '}
            {hints.map((hint) => {
              const prefix = hint.required ? '' : '['
              const suffix = hint.required ? '' : ']'
              return `${prefix}--${hint.name}${hint.type !== 'boolean' ? ` <${hint.type}>` : ''}${suffix}`
            }).join(' ')}
          </code>
        </div>
      )}
    </div>
  )
}

/**
 * Export functions for parsing and serializing argument hints
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

export function serializeArgumentHints(hints: ArgumentHint[]): string {
  return JSON.stringify(
    hints.map(({ id, ...rest }) => rest),
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

export default CommandArgumentHintEditor
