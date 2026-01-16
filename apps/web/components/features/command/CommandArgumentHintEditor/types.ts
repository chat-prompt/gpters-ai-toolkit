/**
 * Type definitions for command argument hint editor
 *
 * Defines types for argument hints, validation rules,
 * autocomplete configuration, and component props.
 */

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
export interface ArgumentHintEditorProps {
  hints: ArgumentHint[]
  onChange: (hints: ArgumentHint[]) => void
  readonly?: boolean
}

/**
 * Props for single ArgumentRow component
 */
export interface ArgumentRowProps {
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
 * Props for UsagePreview component
 */
export interface UsagePreviewProps {
  hints: ArgumentHint[]
}

/**
 * Argument type option for selection
 */
export interface ArgumentTypeOption {
  value: ArgumentHintType
  label: string
  description: string
}
