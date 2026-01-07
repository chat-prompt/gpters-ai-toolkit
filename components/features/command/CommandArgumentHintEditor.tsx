/**
 * Command argument hint editor component
 *
 * Re-exports from the CommandArgumentHintEditor folder for backwards compatibility.
 * The main editor allows defining and configuring command arguments with types,
 * validation rules, and autocomplete options.
 */

// Re-export from new folder structure for backwards compatibility
export {
  CommandArgumentHintEditor,
  ArgumentRow,
  UsagePreview,
  ARGUMENT_TYPES,
  generateId,
  createDefaultHint,
  parseArgumentHints,
  serializeArgumentHints,
  validateArgumentHint,
} from './CommandArgumentHintEditor/index'

export type {
  ArgumentHintType,
  ArgumentHint,
  AutocompleteConfig,
  ValidationRule,
  ArgumentHintEditorProps,
  ArgumentRowProps,
  UsagePreviewProps,
  ArgumentTypeOption,
} from './CommandArgumentHintEditor/index'

export { CommandArgumentHintEditor as default } from './CommandArgumentHintEditor/index'
