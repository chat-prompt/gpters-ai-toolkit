/**
 * Usage preview component for argument editor
 *
 * Displays a live preview of the command syntax
 * based on defined argument hints.
 */
import { memo } from 'react'
import type { UsagePreviewProps } from './types'

/**
 * Command usage syntax preview
 *
 * Shows formatted command syntax with required and optional arguments.
 */
export const UsagePreview = memo(function UsagePreview({ hints }: UsagePreviewProps) {
  if (hints.length === 0) {
    return null
  }

  return (
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
  )
})
