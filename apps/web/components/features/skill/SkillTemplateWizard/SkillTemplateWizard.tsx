/**
 * Skill template wizard main component
 *
 * Multi-step wizard for creating Claude Code skill templates
 * with category selection, basic info, tool configuration, and preview.
 */
'use client'

import { useState, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ClaudeTool } from '@/lib/data/type-config'
import type { TemplateCategory, TemplateCategoryInfo, SkillTemplateWizardProps } from './types'
import { TEMPLATE_CATEGORY_META, WIZARD_STEPS } from './constants'
import { useTemplateGenerator } from './useTemplateGenerator'
import { WizardProgress } from './WizardProgress'
import { CategorySelector } from './CategorySelector'
import { BasicInfoForm } from './BasicInfoForm'
import { ToolSelector } from './ToolSelector'
import { TemplatePreview } from './TemplatePreview'

/**
 * Skill template wizard
 *
 * @param onComplete - Callback when wizard completes with generated template
 * @param initialCategory - Pre-selected category to skip first step
 */
export function SkillTemplateWizard({ onComplete, initialCategory }: SkillTemplateWizardProps) {
  const t = useTranslations('templates.skillWizard')

  const [currentStep, setCurrentStep] = useState(initialCategory ? 1 : 0)
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(
    initialCategory || null
  )
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [selectedTools, setSelectedTools] = useState<ClaudeTool[]>([])
  const [customId, setCustomId] = useState('')

  // Build translated TEMPLATE_CATEGORIES by merging meta with translations
  const translatedCategories: TemplateCategoryInfo[] = useMemo(
    () =>
      TEMPLATE_CATEGORY_META.map((meta) => ({
        id: meta.id as TemplateCategory,
        icon: meta.icon,
        gradient: meta.gradient,
        recommendedTools: meta.recommendedTools,
        name: t(`categories.${meta.id}.name`),
        description: t(`categories.${meta.id}.description`),
        bestPractices: t.raw(`categories.${meta.id}.bestPractices`) as string[],
        exampleDescription: t(`categories.${meta.id}.exampleDescription`),
      })),
    [t]
  )

  // Build translated wizard steps
  const translatedSteps = useMemo(
    () =>
      WIZARD_STEPS.map((step) => ({
        ...step,
        label: t(`steps.${step.id}.label`),
        description: t(`steps.${step.id}.description`),
      })),
    [t]
  )

  // Get category info
  const categoryInfo = useMemo(() => {
    return translatedCategories.find((c) => c.id === selectedCategory) || null
  }, [selectedCategory, translatedCategories])

  // Generate skill ID from name
  const generatedId = useMemo(() => {
    if (customId) return customId
    return skillName
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50)
  }, [skillName, customId])

  // Use template generator hook
  const { generatedContent, fullTemplate } = useTemplateGenerator({
    categoryInfo,
    skillName,
    skillDescription,
    selectedCategory,
    selectedTools,
    generatedId,
  })

  // Handle category selection
  const handleCategorySelect = useCallback(
    (category: TemplateCategory) => {
      setSelectedCategory(category)
      const cat = translatedCategories.find((c) => c.id === category)
      if (cat) {
        setSelectedTools(cat.recommendedTools)
        setSkillDescription(cat.exampleDescription)
      }
      setCurrentStep(1)
    },
    [translatedCategories]
  )

  // Handle tool toggle
  const handleToolToggle = useCallback((tool: ClaudeTool) => {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    )
  }, [])

  // Navigation handlers
  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 0:
        return selectedCategory !== null
      case 1:
        return skillName.trim().length > 0 && skillDescription.trim().length > 0
      case 2:
        return true // Tools are optional
      case 3:
        return true
      default:
        return false
    }
  }, [currentStep, selectedCategory, skillName, skillDescription])

  const handleNext = useCallback(() => {
    if (canProceed() && currentStep < translatedSteps.length - 1) {
      setCurrentStep((prev) => prev + 1)
    }
  }, [canProceed, currentStep, translatedSteps.length])

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }, [currentStep])

  const handleComplete = useCallback(() => {
    onComplete?.(fullTemplate)
  }, [onComplete, fullTemplate])

  // Download as file
  const handleDownload = useCallback(() => {
    const blob = new Blob([generatedContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${generatedId || 'skill'}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [generatedContent, generatedId])

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Progress Steps */}
      <WizardProgress
        steps={translatedSteps}
        currentStep={currentStep}
        onStepClick={setCurrentStep}
      />

      {/* Step Content */}
      <div className="glass rounded-2xl p-8 mb-6">
        {/* Step 1: Category Selection */}
        {currentStep === 0 && (
          <CategorySelector
            categories={translatedCategories}
            selectedCategory={selectedCategory}
            onSelect={handleCategorySelect}
          />
        )}

        {/* Step 2: Basic Info */}
        {currentStep === 1 && (
          <BasicInfoForm
            skillName={skillName}
            onSkillNameChange={setSkillName}
            skillDescription={skillDescription}
            onSkillDescriptionChange={setSkillDescription}
            customId={customId}
            onCustomIdChange={setCustomId}
            generatedId={generatedId}
            categoryInfo={categoryInfo}
          />
        )}

        {/* Step 3: Tool Selection */}
        {currentStep === 2 && (
          <ToolSelector
            selectedTools={selectedTools}
            onToolToggle={handleToolToggle}
            onClearAll={() => setSelectedTools([])}
            onResetToRecommended={() => setSelectedTools(categoryInfo?.recommendedTools || [])}
            categoryInfo={categoryInfo}
          />
        )}

        {/* Step 4: Preview */}
        {currentStep === 3 && (
          <TemplatePreview
            categoryInfo={categoryInfo}
            generatedId={generatedId}
            selectedTools={selectedTools}
            generatedContent={generatedContent}
            onDownload={handleDownload}
          />
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <button
          onClick={handleBack}
          disabled={currentStep === 0}
          className="px-6 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('nav.back')}
        </button>

        <div className="flex gap-3">
          {currentStep === translatedSteps.length - 1 ? (
            <button
              onClick={handleComplete}
              className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
            >
              {t('nav.complete')}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('nav.next')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
