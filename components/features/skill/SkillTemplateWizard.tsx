/**
 * Skill template wizard re-exports
 *
 * Provides backwards compatibility exports from the refactored
 * folder structure for the skill template wizard feature.
 */

// Re-export from new folder structure for backwards compatibility
export {
  SkillTemplateWizard,
  WizardProgress,
  CategorySelector,
  BasicInfoForm,
  ToolSelector,
  TemplatePreview,
  useTemplateGenerator,
  TEMPLATE_CATEGORIES,
  WIZARD_STEPS,
} from './SkillTemplateWizard/index'

export type {
  TemplateCategory,
  TemplateCategoryInfo,
  WizardStep,
  GeneratedTemplate,
  SkillTemplateWizardProps,
} from './SkillTemplateWizard/index'
