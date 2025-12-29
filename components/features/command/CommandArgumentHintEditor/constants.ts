import type { ArgumentTypeOption } from './types'

/**
 * Argument type options with descriptions
 */
export const ARGUMENT_TYPES: ArgumentTypeOption[] = [
  { value: 'text', label: 'Text', description: 'Single line text input' },
  { value: 'number', label: 'Number', description: 'Numeric value' },
  { value: 'boolean', label: 'Boolean', description: 'True/false toggle' },
  { value: 'file', label: 'File', description: 'File path' },
  { value: 'directory', label: 'Directory', description: 'Directory path' },
  { value: 'enum', label: 'Enum', description: 'Selection from predefined values' },
  { value: 'array', label: 'Array', description: 'List of values' },
  { value: 'json', label: 'JSON', description: 'JSON object or array' },
]
