/**
 * Plugin Verification Tests
 */

import { describe, it, expect, vi } from 'vitest'
import {
  CERTIFICATION_LEVELS,
  RISK_LEVELS,
  SECURITY_CATEGORIES,
  DEFAULT_VERIFICATION_CONFIG,
  calculateRiskLevel,
  createSecurityScan,
  verifySignature,
  createVerificationResult,
  createDeveloper,
  createSecurityFinding,
  getSeverityConfig,
  isPluginSafeToInstall,
  generateVerificationReport,
  type SecurityFinding,
  type CodeSignature,
  type VerificationConfig,
} from '@/lib/plugin/verification'

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('plugin-verification', () => {
  describe('CERTIFICATION_LEVELS', () => {
    it('should define 4 certification levels', () => {
      const levels = Object.keys(CERTIFICATION_LEVELS)
      expect(levels).toHaveLength(4)
      expect(levels).toContain('official')
      expect(levels).toContain('verified')
      expect(levels).toContain('community')
      expect(levels).toContain('unverified')
    })

    it('should have complete config for each level', () => {
      Object.values(CERTIFICATION_LEVELS).forEach((config) => {
        expect(config.label).toBeDefined()
        expect(config.description).toBeDefined()
        expect(config.color).toBeDefined()
        expect(config.bgColor).toBeDefined()
        expect(config.icon).toBeDefined()
        expect(config.trustLevel).toBeGreaterThanOrEqual(0)
        expect(config.trustLevel).toBeLessThanOrEqual(100)
      })
    })

    it('should have decreasing trust levels', () => {
      expect(CERTIFICATION_LEVELS.official.trustLevel).toBeGreaterThan(
        CERTIFICATION_LEVELS.verified.trustLevel
      )
      expect(CERTIFICATION_LEVELS.verified.trustLevel).toBeGreaterThan(
        CERTIFICATION_LEVELS.community.trustLevel
      )
      expect(CERTIFICATION_LEVELS.community.trustLevel).toBeGreaterThan(
        CERTIFICATION_LEVELS.unverified.trustLevel
      )
    })
  })

  describe('RISK_LEVELS', () => {
    it('should define 5 risk levels', () => {
      const levels = Object.keys(RISK_LEVELS)
      expect(levels).toHaveLength(5)
      expect(levels).toContain('safe')
      expect(levels).toContain('low')
      expect(levels).toContain('medium')
      expect(levels).toContain('high')
      expect(levels).toContain('critical')
    })

    it('should have complete config for each level', () => {
      Object.values(RISK_LEVELS).forEach((config) => {
        expect(config.label).toBeDefined()
        expect(config.description).toBeDefined()
        expect(config.color).toBeDefined()
        expect(config.bgColor).toBeDefined()
        expect(config.borderColor).toBeDefined()
        expect(config.icon).toBeDefined()
        expect(config.recommendation).toBeDefined()
      })
    })
  })

  describe('SECURITY_CATEGORIES', () => {
    it('should define 10 security categories', () => {
      const categories = Object.keys(SECURITY_CATEGORIES)
      expect(categories).toHaveLength(10)
    })

    it('should have complete config for each category', () => {
      Object.values(SECURITY_CATEGORIES).forEach((config) => {
        expect(config.label).toBeDefined()
        expect(config.description).toBeDefined()
        expect(config.icon).toBeDefined()
      })
    })
  })

  describe('DEFAULT_VERIFICATION_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_VERIFICATION_CONFIG.requireSignature).toBe(false)
      expect(DEFAULT_VERIFICATION_CONFIG.requireSecurityScan).toBe(true)
      expect(DEFAULT_VERIFICATION_CONFIG.autoRejectHighRisk).toBe(true)
      expect(DEFAULT_VERIFICATION_CONFIG.allowUnverifiedDevelopers).toBe(true)
      expect(DEFAULT_VERIFICATION_CONFIG.trustedDevelopers.length).toBeGreaterThan(0)
    })
  })

  describe('calculateRiskLevel', () => {
    it('should return safe for no findings', () => {
      const level = calculateRiskLevel([])
      expect(level).toBe('safe')
    })

    it('should return critical for critical findings', () => {
      const findings: SecurityFinding[] = [
        createSecurityFinding('critical', 'code-injection', 'Test', 'Desc', 'Rec'),
      ]
      const level = calculateRiskLevel(findings)
      expect(level).toBe('critical')
    })

    it('should return high for high findings', () => {
      const findings: SecurityFinding[] = [
        createSecurityFinding('high', 'code-injection', 'Test', 'Desc', 'Rec'),
      ]
      const level = calculateRiskLevel(findings)
      expect(level).toBe('high')
    })

    it('should return medium for medium findings', () => {
      const findings: SecurityFinding[] = [
        createSecurityFinding('medium', 'code-injection', 'Test', 'Desc', 'Rec'),
      ]
      const level = calculateRiskLevel(findings)
      expect(level).toBe('medium')
    })

    it('should return low for low findings', () => {
      const findings: SecurityFinding[] = [
        createSecurityFinding('low', 'code-injection', 'Test', 'Desc', 'Rec'),
      ]
      const level = calculateRiskLevel(findings)
      expect(level).toBe('low')
    })

    it('should return safe for info findings only', () => {
      const findings: SecurityFinding[] = [
        createSecurityFinding('info', 'other', 'Test', 'Desc', 'Rec'),
      ]
      const level = calculateRiskLevel(findings)
      expect(level).toBe('safe')
    })

    it('should prioritize highest severity', () => {
      const findings: SecurityFinding[] = [
        createSecurityFinding('low', 'other', 'Low', 'Desc', 'Rec'),
        createSecurityFinding('critical', 'code-injection', 'Critical', 'Desc', 'Rec'),
        createSecurityFinding('medium', 'other', 'Medium', 'Desc', 'Rec'),
      ]
      const level = calculateRiskLevel(findings)
      expect(level).toBe('critical')
    })
  })

  describe('createSecurityScan', () => {
    it('should create scan with no findings', () => {
      const scan = createSecurityScan('test-plugin')
      expect(scan.pluginId).toBe('test-plugin')
      expect(scan.findings).toHaveLength(0)
      expect(scan.summary.total).toBe(0)
      expect(scan.riskLevel).toBe('safe')
      expect(scan.passed).toBe(true)
    })

    it('should create scan with findings', () => {
      const findings: SecurityFinding[] = [
        createSecurityFinding('high', 'code-injection', 'Test', 'Desc', 'Rec'),
        createSecurityFinding('low', 'other', 'Test2', 'Desc', 'Rec'),
      ]
      const scan = createSecurityScan('test-plugin', findings)
      expect(scan.findings).toHaveLength(2)
      expect(scan.summary.high).toBe(1)
      expect(scan.summary.low).toBe(1)
      expect(scan.summary.total).toBe(2)
      expect(scan.riskLevel).toBe('high')
      expect(scan.passed).toBe(false)
    })

    it('should include scan metadata', () => {
      const scan = createSecurityScan('test-plugin')
      expect(scan.scannedAt).toBeDefined()
      expect(scan.scanVersion).toBeDefined()
      expect(scan.duration).toBeGreaterThan(0)
    })
  })

  describe('verifySignature', () => {
    it('should reject missing signature', async () => {
      const sig: CodeSignature = {
        algorithm: 'sha256',
        signature: '',
        publicKey: '',
        signedAt: new Date().toISOString(),
        signedBy: 'test',
      }
      const result = await verifySignature('content', sig)
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should reject expired signature', async () => {
      const sig: CodeSignature = {
        algorithm: 'sha256',
        signature: 'a'.repeat(64),
        publicKey: 'key',
        signedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        signedBy: 'test',
      }
      const result = await verifySignature('content', sig)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('만료')
    })

    it('should validate valid signature', async () => {
      const sig: CodeSignature = {
        algorithm: 'sha256',
        signature: 'a'.repeat(64),
        publicKey: 'key',
        signedAt: new Date().toISOString(),
        signedBy: 'test',
      }
      const result = await verifySignature('content', sig)
      expect(result.valid).toBe(true)
    })

    it('should validate non-expired signature', async () => {
      const sig: CodeSignature = {
        algorithm: 'sha256',
        signature: 'a'.repeat(64),
        publicKey: 'key',
        signedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        signedBy: 'test',
      }
      const result = await verifySignature('content', sig)
      expect(result.valid).toBe(true)
    })
  })

  describe('createDeveloper', () => {
    it('should create developer with basic info', () => {
      const dev = createDeveloper('dev1', 'Developer One', 'verified')
      expect(dev.id).toBe('dev1')
      expect(dev.name).toBe('Developer One')
      expect(dev.certificationLevel).toBe('verified')
      expect(dev.badges).toHaveLength(0)
      expect(dev.reputation).toBe(80) // verified trust level
    })

    it('should create developer with options', () => {
      const dev = createDeveloper('dev1', 'Developer One', 'official', {
        email: 'dev@example.com',
        pluginCount: 5,
        totalDownloads: 1000,
      })
      expect(dev.email).toBe('dev@example.com')
      expect(dev.pluginCount).toBe(5)
      expect(dev.totalDownloads).toBe(1000)
    })

    it('should use correct reputation for each level', () => {
      expect(createDeveloper('a', 'A', 'official').reputation).toBe(100)
      expect(createDeveloper('b', 'B', 'verified').reputation).toBe(80)
      expect(createDeveloper('c', 'C', 'community').reputation).toBe(50)
      expect(createDeveloper('d', 'D', 'unverified').reputation).toBe(20)
    })
  })

  describe('createSecurityFinding', () => {
    it('should create finding with all fields', () => {
      const finding = createSecurityFinding(
        'high',
        'code-injection',
        'SQL Injection',
        'Unescaped user input',
        'Use parameterized queries'
      )
      expect(finding.severity).toBe('high')
      expect(finding.category).toBe('code-injection')
      expect(finding.title).toBe('SQL Injection')
      expect(finding.description).toBe('Unescaped user input')
      expect(finding.recommendation).toBe('Use parameterized queries')
      expect(finding.id).toBeDefined()
    })

    it('should generate unique IDs', () => {
      const f1 = createSecurityFinding('low', 'other', 'T', 'D', 'R')
      const f2 = createSecurityFinding('low', 'other', 'T', 'D', 'R')
      expect(f1.id).not.toBe(f2.id)
    })
  })

  describe('getSeverityConfig', () => {
    it('should return config for all severities', () => {
      const severities = ['critical', 'high', 'medium', 'low', 'info'] as const
      severities.forEach((sev) => {
        const config = getSeverityConfig(sev)
        expect(config.label).toBeDefined()
        expect(config.color).toBeDefined()
        expect(config.bgColor).toBeDefined()
        expect(config.icon).toBeDefined()
      })
    })

    it('should have distinct colors for each severity', () => {
      const colors = new Set()
      const severities = ['critical', 'high', 'medium', 'low', 'info'] as const
      severities.forEach((sev) => {
        colors.add(getSeverityConfig(sev).color)
      })
      expect(colors.size).toBe(5)
    })
  })

  describe('createVerificationResult', () => {
    it('should create result for safe plugin', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const scan = createSecurityScan('plugin1')
      const result = createVerificationResult('plugin1', 'Test Plugin', '1.0.0', dev, undefined, scan)

      expect(result.pluginId).toBe('plugin1')
      expect(result.pluginName).toBe('Test Plugin')
      expect(result.version).toBe('1.0.0')
      expect(result.riskLevel).toBe('safe')
      expect(result.canInstall).toBe(true)
      expect(result.requiresApproval).toBe(false)
    })

    it('should add warning for unverified developer', () => {
      const dev = createDeveloper('dev1', 'Dev', 'unverified')
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev)

      expect(result.warnings.some((w) => w.code === 'UNVERIFIED_DEVELOPER')).toBe(true)
      expect(result.requiresApproval).toBe(true)
    })

    it('should add warning for missing signature when required', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const config: VerificationConfig = { ...DEFAULT_VERIFICATION_CONFIG, requireSignature: true }
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev, undefined, undefined, config)

      expect(result.warnings.some((w) => w.code === 'SIGNATURE_MISSING')).toBe(true)
    })

    it('should add warning for missing scan when required', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const config: VerificationConfig = { ...DEFAULT_VERIFICATION_CONFIG, requireSecurityScan: true }
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev, undefined, undefined, config)

      expect(result.warnings.some((w) => w.code === 'SCAN_MISSING')).toBe(true)
    })

    it('should set verified status with valid signature', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const sig: CodeSignature = {
        algorithm: 'sha256',
        signature: 'sig',
        publicKey: 'key',
        signedAt: new Date().toISOString(),
        signedBy: 'dev1',
      }
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev, sig)

      expect(result.verificationStatus).toBe('verified')
      expect(result.verifiedAt).toBeDefined()
    })

    it('should set failed status with expired signature', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const sig: CodeSignature = {
        algorithm: 'sha256',
        signature: 'sig',
        publicKey: 'key',
        signedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        signedBy: 'dev1',
      }
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev, sig)

      expect(result.verificationStatus).toBe('failed')
    })

    it('should reject high risk plugins when configured', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const findings = [createSecurityFinding('critical', 'code-injection', 'T', 'D', 'R')]
      const scan = createSecurityScan('plugin1', findings)
      const config: VerificationConfig = { ...DEFAULT_VERIFICATION_CONFIG, autoRejectHighRisk: true }
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev, undefined, scan, config)

      expect(result.canInstall).toBe(false)
    })

    it('should add trusted developer note', () => {
      const dev = createDeveloper('gpters-official', 'GPTers', 'official')
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev)

      expect(result.recommendations.some((r) => r.includes('신뢰'))).toBe(true)
    })
  })

  describe('isPluginSafeToInstall', () => {
    it('should return safe for verified plugin with no issues', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const scan = createSecurityScan('plugin1')
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev, undefined, scan)
      const check = isPluginSafeToInstall(result)

      expect(check.safe).toBe(true)
      expect(check.reasons).toHaveLength(0)
    })

    it('should return unsafe for critical risk', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const findings = [createSecurityFinding('critical', 'code-injection', 'T', 'D', 'R')]
      const scan = createSecurityScan('plugin1', findings)
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev, undefined, scan)
      const check = isPluginSafeToInstall(result)

      expect(check.safe).toBe(false)
      expect(check.reasons.some((r) => r.includes('치명적'))).toBe(true)
    })

    it('should return unsafe for high risk', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const findings = [createSecurityFinding('high', 'code-injection', 'T', 'D', 'R')]
      const scan = createSecurityScan('plugin1', findings)
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev, undefined, scan)
      const check = isPluginSafeToInstall(result)

      expect(check.safe).toBe(false)
      expect(check.reasons.some((r) => r.includes('심각'))).toBe(true)
    })

    it('should return unsafe for unverified developer when not allowed', () => {
      const dev = createDeveloper('dev1', 'Dev', 'unverified')
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev)
      const config: VerificationConfig = { ...DEFAULT_VERIFICATION_CONFIG, allowUnverifiedDevelopers: false }
      const check = isPluginSafeToInstall(result, config)

      expect(check.safe).toBe(false)
      expect(check.reasons.some((r) => r.includes('미인증'))).toBe(true)
    })

    it('should return unsafe when signature required but missing', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const config: VerificationConfig = { ...DEFAULT_VERIFICATION_CONFIG, requireSignature: true }
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev, undefined, undefined, config)
      const check = isPluginSafeToInstall(result, config)

      expect(check.safe).toBe(false)
      expect(check.reasons.some((r) => r.includes('서명'))).toBe(true)
    })
  })

  describe('generateVerificationReport', () => {
    it('should generate report with basic info', () => {
      const dev = createDeveloper('dev1', 'Developer', 'verified')
      const result = createVerificationResult('plugin1', 'Test Plugin', '1.0.0', dev)
      const report = generateVerificationReport(result)

      expect(report).toContain('Test Plugin')
      expect(report).toContain('1.0.0')
      expect(report).toContain('Developer')
    })

    it('should include security scan results', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const findings = [createSecurityFinding('medium', 'other', 'Test Issue', 'Desc', 'Fix')]
      const scan = createSecurityScan('plugin1', findings)
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev, undefined, scan)
      const report = generateVerificationReport(result)

      expect(report).toContain('보안 스캔')
      expect(report).toContain('Test Issue')
    })

    it('should include warnings', () => {
      const dev = createDeveloper('dev1', 'Dev', 'unverified')
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev)
      const report = generateVerificationReport(result)

      expect(report).toContain('경고')
    })

    it('should include recommendations', () => {
      const dev = createDeveloper('dev1', 'Dev', 'unverified')
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev)
      const report = generateVerificationReport(result)

      expect(report).toContain('권장사항')
    })

    it('should include install status', () => {
      const dev = createDeveloper('dev1', 'Dev', 'verified')
      const result = createVerificationResult('plugin1', 'Test', '1.0.0', dev)
      const report = generateVerificationReport(result)

      expect(report).toContain('설치 가능')
    })
  })

  describe('edge cases', () => {
    it('should handle empty developer name', () => {
      const dev = createDeveloper('dev1', '', 'verified')
      expect(dev.name).toBe('')
    })

    it('should handle many findings', () => {
      const findings: SecurityFinding[] = Array.from({ length: 100 }, (_, i) =>
        createSecurityFinding('low', 'other', `Finding ${i}`, 'Desc', 'Rec')
      )
      const scan = createSecurityScan('plugin1', findings)
      expect(scan.summary.total).toBe(100)
      expect(scan.riskLevel).toBe('low')
    })

    it('should handle mixed severity findings', () => {
      const findings: SecurityFinding[] = [
        createSecurityFinding('info', 'other', 'Info', 'D', 'R'),
        createSecurityFinding('low', 'other', 'Low', 'D', 'R'),
        createSecurityFinding('medium', 'other', 'Medium', 'D', 'R'),
        createSecurityFinding('high', 'other', 'High', 'D', 'R'),
        createSecurityFinding('critical', 'other', 'Critical', 'D', 'R'),
      ]
      const scan = createSecurityScan('plugin1', findings)
      expect(scan.summary.critical).toBe(1)
      expect(scan.summary.high).toBe(1)
      expect(scan.summary.medium).toBe(1)
      expect(scan.summary.low).toBe(1)
      expect(scan.summary.info).toBe(1)
      expect(scan.riskLevel).toBe('critical')
    })
  })
})
