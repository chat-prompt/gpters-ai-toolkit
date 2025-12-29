import { ClaudeTool } from '@/lib/data/type-config'

export type TemplateCategory =
  | 'data-reference'
  | 'workflow-automation'
  | 'code-analysis'
  | 'documentation'
  | 'testing'

export interface TemplateCategoryInfo {
  id: TemplateCategory
  name: string
  description: string
  icon: string
  gradient: string
  recommendedTools: ClaudeTool[]
  bestPractices: string[]
  exampleDescription: string
}

export interface WizardStep {
  id: string
  label: string
  description: string
}

export interface GeneratedTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategory
  allowedTools: string[]
  content: string
}

export interface SkillTemplateWizardProps {
  onComplete?: (template: GeneratedTemplate) => void
  initialCategory?: TemplateCategory
}
