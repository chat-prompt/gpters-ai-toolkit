/**
 * Type definitions for skill template wizard
 *
 * Defines types for template categories, wizard steps,
 * generated templates, and component props.
 */
import { ClaudeTool } from '@/lib/data/type-config'

/** Available template category identifiers */
export type TemplateCategory =
  | 'data-reference'
  | 'workflow-automation'
  | 'code-analysis'
  | 'documentation'
  | 'testing'

/** Template category metadata and configuration */
export interface TemplateCategoryInfo {
  /** Unique category identifier */
  id: TemplateCategory
  /** Display name for the category */
  name: string
  /** Brief description of the category purpose */
  description: string
  /** Emoji icon for visual identification */
  icon: string
  /** CSS gradient classes for styling */
  gradient: string
  /** Pre-selected tools for this category */
  recommendedTools: ClaudeTool[]
  /** Best practice guidelines for the category */
  bestPractices: string[]
  /** Sample description to prefill form */
  exampleDescription: string
}

/** Wizard step configuration */
export interface WizardStep {
  /** Unique step identifier */
  id: string
  /** Short label for the step */
  label: string
  /** Brief description of the step */
  description: string
}

/** Generated skill template output */
export interface GeneratedTemplate {
  /** Unique skill identifier */
  id: string
  /** Skill display name */
  name: string
  /** Skill description for Claude trigger detection */
  description: string
  /** Selected template category */
  category: TemplateCategory
  /** List of allowed Claude tools */
  allowedTools: string[]
  /** Generated markdown content */
  content: string
}

/** Props for SkillTemplateWizard component */
export interface SkillTemplateWizardProps {
  /** Callback when wizard completes with generated template */
  onComplete?: (template: GeneratedTemplate) => void
  /** Pre-selected category to skip first step */
  initialCategory?: TemplateCategory
}
