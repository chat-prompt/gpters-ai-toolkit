/**
 * Constants for skill template wizard
 *
 * Defines template categories with metadata and wizard step configuration.
 * Translatable text (name, description, bestPractices, exampleDescription)
 * lives in messages/[locale]/templates.json under skillWizard.categories.[id].
 */
import type { WizardStep } from './types'
import type { ClaudeTool } from '@/lib/data/type-config'

/** Non-text metadata for a template category */
export interface TemplateCategoryMeta {
  /** Unique category identifier matching translation key */
  id: string
  /** Emoji icon for visual identification */
  icon: string
  /** CSS gradient classes for styling */
  gradient: string
  /** Pre-selected tools for this category */
  recommendedTools: ClaudeTool[]
}

/** Available template category non-text metadata */
export const TEMPLATE_CATEGORY_META: TemplateCategoryMeta[] = [
  {
    id: 'data-reference',
    icon: '📊',
    gradient: 'from-cyan-400 to-blue-500',
    recommendedTools: ['Read', 'Grep', 'Glob', 'WebFetch', 'Bash'],
  },
  {
    id: 'workflow-automation',
    icon: '🔄',
    gradient: 'from-purple-400 to-pink-500',
    recommendedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Task'],
  },
  {
    id: 'code-analysis',
    icon: '🔍',
    gradient: 'from-emerald-400 to-teal-500',
    recommendedTools: ['Read', 'Grep', 'Glob', 'Bash'],
  },
  {
    id: 'documentation',
    icon: '📝',
    gradient: 'from-amber-400 to-orange-500',
    recommendedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
  },
  {
    id: 'testing',
    icon: '🧪',
    gradient: 'from-rose-400 to-red-500',
    recommendedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob'],
  },
]

/** Wizard step IDs in order (labels/descriptions come from translations) */
export const WIZARD_STEPS: WizardStep[] = [
  { id: 'category', label: 'category', description: 'category' },
  { id: 'basic', label: 'basic', description: 'basic' },
  { id: 'tools', label: 'tools', description: 'tools' },
  { id: 'preview', label: 'preview', description: 'preview' },
]
