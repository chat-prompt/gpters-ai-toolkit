/**
 * Agent Permission Mode Tests
 */

import { describe, it, expect } from 'vitest'
import {
  PERMISSION_MODES,
  SECURITY_LEVELS,
  getPermissionModeInfo,
  getAllPermissionModes,
  getSecurityLevelInfo,
  getRecommendation,
  compareModes,
  validateModeForContext,
  type RecommendationCriteria,
} from '@/lib/agent/permission-mode'
import { AgentPermissionMode } from '@/lib/core/types'

describe('agent-permission-mode', () => {
  describe('PERMISSION_MODES', () => {
    it('should define all 5 permission modes', () => {
      const modes = Object.keys(PERMISSION_MODES)
      expect(modes).toHaveLength(5)
      expect(modes).toContain('default')
      expect(modes).toContain('acceptEdits')
      expect(modes).toContain('bypassPermissions')
      expect(modes).toContain('plan')
      expect(modes).toContain('ignore')
    })

    it('should have complete info for each mode', () => {
      Object.values(PERMISSION_MODES).forEach((mode) => {
        expect(mode.mode).toBeDefined()
        expect(mode.label).toBeDefined()
        expect(mode.shortDescription).toBeDefined()
        expect(mode.fullDescription).toBeDefined()
        expect(mode.securityLevel).toBeDefined()
        expect(mode.securityWarnings).toBeInstanceOf(Array)
        expect(mode.allowedOperations).toBeInstanceOf(Array)
        expect(mode.blockedOperations).toBeInstanceOf(Array)
        expect(mode.useCases).toBeInstanceOf(Array)
        expect(mode.bestPractices).toBeInstanceOf(Array)
        expect(mode.notRecommendedFor).toBeInstanceOf(Array)
      })
    })

    it('should have valid security levels', () => {
      Object.values(PERMISSION_MODES).forEach((mode) => {
        expect(['low', 'medium', 'high', 'critical']).toContain(mode.securityLevel)
      })
    })

    it('should have at least one use case for each mode', () => {
      Object.values(PERMISSION_MODES).forEach((mode) => {
        expect(mode.useCases.length).toBeGreaterThan(0)
        mode.useCases.forEach((useCase) => {
          expect(useCase.title).toBeDefined()
          expect(useCase.description).toBeDefined()
          expect(useCase.scenario).toBeDefined()
        })
      })
    })
  })

  describe('SECURITY_LEVELS', () => {
    it('should define all 4 security levels', () => {
      const levels = Object.keys(SECURITY_LEVELS)
      expect(levels).toHaveLength(4)
      expect(levels).toContain('low')
      expect(levels).toContain('medium')
      expect(levels).toContain('high')
      expect(levels).toContain('critical')
    })

    it('should have complete info for each level', () => {
      Object.values(SECURITY_LEVELS).forEach((level) => {
        expect(level.label).toBeDefined()
        expect(level.color).toBeDefined()
        expect(level.bgColor).toBeDefined()
        expect(level.borderColor).toBeDefined()
        expect(level.icon).toBeDefined()
        expect(level.description).toBeDefined()
      })
    })
  })

  describe('getPermissionModeInfo', () => {
    it('should return correct info for default mode', () => {
      const info = getPermissionModeInfo('default')
      expect(info.mode).toBe('default')
      expect(info.securityLevel).toBe('low')
    })

    it('should return correct info for bypassPermissions mode', () => {
      const info = getPermissionModeInfo('bypassPermissions')
      expect(info.mode).toBe('bypassPermissions')
      expect(info.securityLevel).toBe('critical')
    })

    it('should return info for all modes', () => {
      const modes: AgentPermissionMode[] = [
        'default',
        'acceptEdits',
        'bypassPermissions',
        'plan',
        'ignore',
      ]
      modes.forEach((mode) => {
        const info = getPermissionModeInfo(mode)
        expect(info.mode).toBe(mode)
      })
    })
  })

  describe('getAllPermissionModes', () => {
    it('should return all permission modes', () => {
      const modes = getAllPermissionModes()
      expect(modes).toHaveLength(5)
    })

    it('should return array of PermissionModeInfo', () => {
      const modes = getAllPermissionModes()
      modes.forEach((mode) => {
        expect(mode.mode).toBeDefined()
        expect(mode.label).toBeDefined()
        expect(mode.securityLevel).toBeDefined()
      })
    })
  })

  describe('getSecurityLevelInfo', () => {
    it('should return info for low level', () => {
      const info = getSecurityLevelInfo('low')
      expect(info.label).toBe('낮음')
      expect(info.icon).toBe('🟢')
    })

    it('should return info for critical level', () => {
      const info = getSecurityLevelInfo('critical')
      expect(info.label).toBe('위험')
      expect(info.icon).toBe('🔴')
    })

    it('should return info for all levels', () => {
      const levels: Array<'low' | 'medium' | 'high' | 'critical'> = [
        'low',
        'medium',
        'high',
        'critical',
      ]
      levels.forEach((level) => {
        const info = getSecurityLevelInfo(level)
        expect(info).toBeDefined()
      })
    })
  })

  describe('getRecommendation', () => {
    it('should recommend default for sensitive production environment', () => {
      const criteria: RecommendationCriteria = {
        isProduction: true,
        hasSensitiveData: true,
        isGitRepository: true,
        isIsolatedEnvironment: false,
        isAutomated: false,
        trustLevel: 'medium',
        taskComplexity: 'simple',
      }
      const rec = getRecommendation(criteria)
      expect(rec.recommended).toBe('default')
      expect(rec.warnings.length).toBeGreaterThan(0)
    })

    it('should recommend bypassPermissions for isolated automated environment', () => {
      const criteria: RecommendationCriteria = {
        isProduction: false,
        hasSensitiveData: false,
        isGitRepository: true,
        isIsolatedEnvironment: true,
        isAutomated: true,
        trustLevel: 'high',
        taskComplexity: 'simple',
      }
      const rec = getRecommendation(criteria)
      expect(rec.recommended).toBe('bypassPermissions')
    })

    it('should recommend acceptEdits for git repository without sensitive data', () => {
      const criteria: RecommendationCriteria = {
        isProduction: false,
        hasSensitiveData: false,
        isGitRepository: true,
        isIsolatedEnvironment: false,
        isAutomated: false,
        trustLevel: 'medium',
        taskComplexity: 'simple',
      }
      const rec = getRecommendation(criteria)
      expect(rec.recommended).toBe('acceptEdits')
    })

    it('should recommend plan for complex tasks', () => {
      const criteria: RecommendationCriteria = {
        isProduction: false,
        hasSensitiveData: false,
        isGitRepository: false,
        isIsolatedEnvironment: false,
        isAutomated: false,
        trustLevel: 'medium',
        taskComplexity: 'complex',
      }
      const rec = getRecommendation(criteria)
      expect(rec.recommended).toBe('plan')
    })

    it('should recommend ignore for low trust level', () => {
      const criteria: RecommendationCriteria = {
        isProduction: false,
        hasSensitiveData: false,
        isGitRepository: true,
        isIsolatedEnvironment: false,
        isAutomated: false,
        trustLevel: 'low',
        taskComplexity: 'simple',
      }
      const rec = getRecommendation(criteria)
      expect(rec.recommended).toBe('ignore')
    })

    it('should provide reasoning for recommendations', () => {
      const criteria: RecommendationCriteria = {
        isProduction: false,
        hasSensitiveData: false,
        isGitRepository: true,
        isIsolatedEnvironment: false,
        isAutomated: false,
        trustLevel: 'medium',
        taskComplexity: 'simple',
      }
      const rec = getRecommendation(criteria)
      expect(rec.reasoning.length).toBeGreaterThan(0)
    })

    it('should provide alternatives', () => {
      const criteria: RecommendationCriteria = {
        isProduction: false,
        hasSensitiveData: false,
        isGitRepository: true,
        isIsolatedEnvironment: false,
        isAutomated: false,
        trustLevel: 'medium',
        taskComplexity: 'simple',
      }
      const rec = getRecommendation(criteria)
      expect(rec.alternatives.length).toBeGreaterThan(0)
    })
  })

  describe('compareModes', () => {
    it('should correctly compare default vs bypassPermissions', () => {
      const comparison = compareModes('default', 'bypassPermissions')
      expect(comparison.securityComparison).toBe('safer')
    })

    it('should correctly compare bypassPermissions vs default', () => {
      const comparison = compareModes('bypassPermissions', 'default')
      expect(comparison.securityComparison).toBe('riskier')
    })

    it('should return equal for same mode', () => {
      const comparison = compareModes('default', 'default')
      expect(comparison.securityComparison).toBe('equal')
    })

    it('should compare acceptEdits vs plan', () => {
      const comparison = compareModes('acceptEdits', 'plan')
      // acceptEdits is medium, plan is low
      expect(comparison.securityComparison).toBe('riskier')
    })

    it('should provide differences', () => {
      const comparison = compareModes('default', 'acceptEdits')
      expect(comparison.differences).toBeInstanceOf(Array)
    })
  })

  describe('validateModeForContext', () => {
    it('should reject bypassPermissions in production', () => {
      const validation = validateModeForContext('bypassPermissions', {
        isProduction: true,
      })
      expect(validation.isValid).toBe(false)
      expect(validation.warnings.length).toBeGreaterThan(0)
    })

    it('should warn about bypassPermissions in non-isolated environment', () => {
      const validation = validateModeForContext('bypassPermissions', {
        isIsolatedEnvironment: false,
      })
      expect(validation.warnings.length).toBeGreaterThan(0)
    })

    it('should reject bypassPermissions with sensitive data', () => {
      const validation = validateModeForContext('bypassPermissions', {
        hasSensitiveData: true,
      })
      expect(validation.isValid).toBe(false)
    })

    it('should warn about acceptEdits without git', () => {
      const validation = validateModeForContext('acceptEdits', {
        isGitRepository: false,
      })
      expect(validation.warnings.length).toBeGreaterThan(0)
    })

    it('should validate default mode as always valid', () => {
      const validation = validateModeForContext('default', {
        isProduction: true,
        hasSensitiveData: true,
        isIsolatedEnvironment: false,
      })
      expect(validation.isValid).toBe(true)
    })

    it('should provide suggestions', () => {
      const validation = validateModeForContext('bypassPermissions', {
        isProduction: true,
      })
      expect(validation.suggestions.length).toBeGreaterThan(0)
    })
  })

  describe('mode security levels', () => {
    it('default should be low security', () => {
      expect(PERMISSION_MODES.default.securityLevel).toBe('low')
    })

    it('acceptEdits should be medium security', () => {
      expect(PERMISSION_MODES.acceptEdits.securityLevel).toBe('medium')
    })

    it('bypassPermissions should be critical security', () => {
      expect(PERMISSION_MODES.bypassPermissions.securityLevel).toBe('critical')
    })

    it('plan should be low security', () => {
      expect(PERMISSION_MODES.plan.securityLevel).toBe('low')
    })

    it('ignore should be medium security', () => {
      expect(PERMISSION_MODES.ignore.securityLevel).toBe('medium')
    })
  })

  describe('mode use cases', () => {
    it('default should have security-related use case', () => {
      const useCases = PERMISSION_MODES.default.useCases
      const hasSecurityUseCase = useCases.some(
        (uc) => uc.title.includes('보안') || uc.description.includes('민감')
      )
      expect(hasSecurityUseCase).toBe(true)
    })

    it('acceptEdits should have refactoring use case', () => {
      const useCases = PERMISSION_MODES.acceptEdits.useCases
      const hasRefactoringUseCase = useCases.some(
        (uc) => uc.title.includes('리팩토링') || uc.description.includes('리팩토링')
      )
      expect(hasRefactoringUseCase).toBe(true)
    })

    it('bypassPermissions should have CI/CD use case', () => {
      const useCases = PERMISSION_MODES.bypassPermissions.useCases
      const hasCICDUseCase = useCases.some(
        (uc) => uc.title.includes('CI/CD') || uc.description.includes('자동화')
      )
      expect(hasCICDUseCase).toBe(true)
    })

    it('plan should have planning use case', () => {
      const useCases = PERMISSION_MODES.plan.useCases
      const hasPlanningUseCase = useCases.some(
        (uc) => uc.title.includes('검토') || uc.description.includes('계획')
      )
      expect(hasPlanningUseCase).toBe(true)
    })
  })

  describe('mode warnings', () => {
    it('bypassPermissions should have most warnings', () => {
      const bypassWarnings = PERMISSION_MODES.bypassPermissions.securityWarnings.length
      const defaultWarnings = PERMISSION_MODES.default.securityWarnings.length
      expect(bypassWarnings).toBeGreaterThan(defaultWarnings)
    })

    it('bypassPermissions warnings should mention bash', () => {
      const warnings = PERMISSION_MODES.bypassPermissions.securityWarnings
      const hasBashWarning = warnings.some(
        (w) => w.toLowerCase().includes('bash') || w.includes('명령어')
      )
      expect(hasBashWarning).toBe(true)
    })

    it('acceptEdits warnings should mention git', () => {
      const warnings = PERMISSION_MODES.acceptEdits.securityWarnings
      const hasGitWarning = warnings.some(
        (w) => w.toLowerCase().includes('git') || w.includes('파일')
      )
      expect(hasGitWarning).toBe(true)
    })
  })

  describe('mode allowed operations', () => {
    it('bypassPermissions should allow bash', () => {
      const allowed = PERMISSION_MODES.bypassPermissions.allowedOperations
      const hasBash = allowed.some((op) => op.toLowerCase().includes('bash'))
      expect(hasBash).toBe(true)
    })

    it('acceptEdits should allow edit operations', () => {
      const allowed = PERMISSION_MODES.acceptEdits.allowedOperations
      const hasEdit = allowed.some(
        (op) => op.toLowerCase().includes('edit') || op.toLowerCase().includes('write')
      )
      expect(hasEdit).toBe(true)
    })

    it('acceptEdits should block bash in blocked operations', () => {
      const blocked = PERMISSION_MODES.acceptEdits.blockedOperations
      const hasBash = blocked.some((op) => op.toLowerCase().includes('bash'))
      expect(hasBash).toBe(true)
    })

    it('plan should have all tools blocked', () => {
      const blocked = PERMISSION_MODES.plan.blockedOperations
      const hasAllBlocked = blocked.some((op) => op.includes('모든'))
      expect(hasAllBlocked).toBe(true)
    })
  })

  describe('mode best practices', () => {
    it('each mode should have at least 2 best practices', () => {
      Object.values(PERMISSION_MODES).forEach((mode) => {
        expect(mode.bestPractices.length).toBeGreaterThanOrEqual(2)
      })
    })

    it('bypassPermissions should recommend isolation', () => {
      const practices = PERMISSION_MODES.bypassPermissions.bestPractices
      const hasIsolation = practices.some(
        (p) => p.includes('격리') || p.includes('Docker') || p.includes('VM')
      )
      expect(hasIsolation).toBe(true)
    })

    it('acceptEdits should recommend git', () => {
      const practices = PERMISSION_MODES.acceptEdits.bestPractices
      const hasGit = practices.some((p) => p.toLowerCase().includes('git'))
      expect(hasGit).toBe(true)
    })
  })

  describe('mode not recommended for', () => {
    it('default should not recommend for fast iteration', () => {
      const notRec = PERMISSION_MODES.default.notRecommendedFor
      const hasSpeedConcern = notRec.some((n) => n.includes('빠른') || n.includes('반복'))
      expect(hasSpeedConcern).toBe(true)
    })

    it('bypassPermissions should not recommend for local dev', () => {
      const notRec = PERMISSION_MODES.bypassPermissions.notRecommendedFor
      const hasLocalConcern = notRec.some((n) => n.includes('로컬') || n.includes('프로덕션'))
      expect(hasLocalConcern).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle empty context for validation', () => {
      const validation = validateModeForContext('default', {})
      expect(validation.isValid).toBe(true)
    })

    it('should handle all false criteria', () => {
      const criteria: RecommendationCriteria = {
        isProduction: false,
        hasSensitiveData: false,
        isGitRepository: false,
        isIsolatedEnvironment: false,
        isAutomated: false,
        trustLevel: 'medium',
        taskComplexity: 'simple',
      }
      const rec = getRecommendation(criteria)
      expect(rec.recommended).toBeDefined()
    })

    it('should handle all true criteria except trust', () => {
      const criteria: RecommendationCriteria = {
        isProduction: true,
        hasSensitiveData: true,
        isGitRepository: true,
        isIsolatedEnvironment: true,
        isAutomated: true,
        trustLevel: 'high',
        taskComplexity: 'complex',
      }
      const rec = getRecommendation(criteria)
      expect(rec.warnings.length).toBeGreaterThan(0)
    })
  })

  describe('security level ordering', () => {
    const securityOrder = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    }

    it('should have consistent ordering', () => {
      expect(securityOrder['low']).toBeLessThan(securityOrder['medium'])
      expect(securityOrder['medium']).toBeLessThan(securityOrder['high'])
      expect(securityOrder['high']).toBeLessThan(securityOrder['critical'])
    })

    it('compareModes should respect security ordering', () => {
      // low < medium
      let comparison = compareModes('default', 'acceptEdits')
      expect(comparison.securityComparison).toBe('safer')

      // medium < critical
      comparison = compareModes('acceptEdits', 'bypassPermissions')
      expect(comparison.securityComparison).toBe('safer')
    })
  })

  describe('localization', () => {
    it('should have Korean labels', () => {
      Object.values(PERMISSION_MODES).forEach((mode) => {
        // Check for Korean characters in label or description
        const hasKorean = /[\uAC00-\uD7AF]/.test(mode.fullDescription)
        expect(hasKorean).toBe(true)
      })
    })

    it('should have Korean security level labels', () => {
      Object.values(SECURITY_LEVELS).forEach((level) => {
        const hasKorean = /[\uAC00-\uD7AF]/.test(level.label)
        expect(hasKorean).toBe(true)
      })
    })
  })
})
