/**
 * Argument row component for hint editor
 *
 * Collapsible row for editing a single argument definition with
 * type selection, validation rules, and autocomplete settings.
 */
'use client'

import { useState, useCallback } from 'react'
import { ARGUMENT_TYPES } from './constants'
import type { ArgumentHint, ArgumentRowProps, ArgumentHintType, AutocompleteConfig, ValidationRule } from './types'

/**
 * Single argument editor row
 *
 * Expandable row showing argument name, type, and required flag
 * with collapsible section for advanced options.
 */
export function ArgumentRow({
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
