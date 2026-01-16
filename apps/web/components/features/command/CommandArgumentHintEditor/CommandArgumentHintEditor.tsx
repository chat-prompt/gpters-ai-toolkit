/**
 * Command argument hint editor component
 *
 * Visual editor for defining command arguments with support for
 * multiple types, validation rules, autocomplete, and reordering.
 */
'use client'

import { useCallback } from 'react'
import { ArgumentRow } from './ArgumentRow'
import { UsagePreview } from './UsagePreview'
import { createDefaultHint } from './utils'
import type { ArgumentHint, ArgumentHintEditorProps } from './types'

/**
 * Command argument hint editor
 *
 * Provides CRUD interface for managing command arguments with:
 * - Add/edit/delete argument definitions
 * - Drag-and-drop reordering
 * - Live usage preview
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

      <UsagePreview hints={hints} />
    </div>
  )
}

export default CommandArgumentHintEditor
