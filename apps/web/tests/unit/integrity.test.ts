import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateHash,
  generateSRIHash,
  verifyHash,
  verifySRIHash,
  signContent,
  verifySignature,
  createVersionChecksum,
  createIntegrityManifest,
  addVersionToManifest,
  verifyAgainstManifest,
  detectTampering,
  generateBatchChecksums,
  verifyBatchChecksums,
  formatHash,
  safeCompareHashes,
  type IntegrityManifest,
} from '@/lib/security/integrity'

describe('Content Integrity', () => {
  const testContent = 'Hello, World!'
  const testSecret = 'test-secret-key-123'

  describe('generateHash', () => {
    it('should generate SHA-256 hash by default', () => {
      const result = generateHash(testContent)
      expect(result.algorithm).toBe('sha256')
      expect(result.hash).toHaveLength(64) // SHA-256 produces 64 hex chars
      expect(result.timestamp).toBeDefined()
    })

    it('should generate SHA-384 hash', () => {
      const result = generateHash(testContent, 'sha384')
      expect(result.algorithm).toBe('sha384')
      expect(result.hash).toHaveLength(96)
    })

    it('should generate SHA-512 hash', () => {
      const result = generateHash(testContent, 'sha512')
      expect(result.algorithm).toBe('sha512')
      expect(result.hash).toHaveLength(128)
    })

    it('should generate consistent hash for same content', () => {
      const hash1 = generateHash(testContent)
      const hash2 = generateHash(testContent)
      expect(hash1.hash).toBe(hash2.hash)
    })

    it('should generate different hash for different content', () => {
      const hash1 = generateHash('content1')
      const hash2 = generateHash('content2')
      expect(hash1.hash).not.toBe(hash2.hash)
    })

    it('should handle Buffer input', () => {
      const buffer = Buffer.from(testContent)
      const result = generateHash(buffer)
      expect(result.hash).toBe(generateHash(testContent).hash)
    })
  })

  describe('generateSRIHash', () => {
    it('should generate SRI-formatted hash', () => {
      const result = generateSRIHash(testContent)
      expect(result).toMatch(/^sha384-[A-Za-z0-9+/=]+$/)
    })

    it('should generate SHA-256 SRI hash', () => {
      const result = generateSRIHash(testContent, 'sha256')
      expect(result).toMatch(/^sha256-[A-Za-z0-9+/=]+$/)
    })
  })

  describe('verifyHash', () => {
    it('should verify valid hash', () => {
      const hash = generateHash(testContent)
      const result = verifyHash(testContent, hash.hash)
      expect(result.valid).toBe(true)
    })

    it('should reject invalid hash', () => {
      const result = verifyHash(testContent, 'invalid-hash')
      expect(result.valid).toBe(false)
    })

    it('should reject tampered content', () => {
      const hash = generateHash(testContent)
      const result = verifyHash('Tampered content', hash.hash)
      expect(result.valid).toBe(false)
    })
  })

  describe('verifySRIHash', () => {
    it('should verify valid SRI hash', () => {
      const sri = generateSRIHash(testContent, 'sha256')
      const result = verifySRIHash(testContent, sri)
      expect(result.valid).toBe(true)
    })

    it('should reject invalid SRI hash', () => {
      const result = verifySRIHash(testContent, 'sha256-invalidhash')
      expect(result.valid).toBe(false)
    })

    it('should handle malformed SRI format', () => {
      const result = verifySRIHash(testContent, 'invalid-format')
      expect(result.valid).toBe(false)
      expect(result.details).toBe('Invalid SRI hash format')
    })
  })

  describe('signContent', () => {
    it('should sign content with HMAC', () => {
      const signed = signContent(testContent, testSecret)
      expect(signed.content).toBe(testContent)
      expect(signed.signature).toHaveLength(64) // SHA-256 HMAC
      expect(signed.algorithm).toBe('sha256')
      expect(signed.signedAt).toBeDefined()
    })

    it('should include version when provided', () => {
      const signed = signContent(testContent, testSecret, 'sha256', '1.0.0')
      expect(signed.version).toBe('1.0.0')
    })

    it('should generate different signatures for different secrets', () => {
      const signed1 = signContent(testContent, 'secret1')
      const signed2 = signContent(testContent, 'secret2')
      expect(signed1.signature).not.toBe(signed2.signature)
    })
  })

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const signed = signContent(testContent, testSecret)
      const result = verifySignature(signed, testSecret)
      expect(result.valid).toBe(true)
    })

    it('should reject invalid secret', () => {
      const signed = signContent(testContent, testSecret)
      const result = verifySignature(signed, 'wrong-secret')
      expect(result.valid).toBe(false)
    })

    it('should reject tampered content', () => {
      const signed = signContent(testContent, testSecret)
      signed.content = 'Tampered!'
      const result = verifySignature(signed, testSecret)
      expect(result.valid).toBe(false)
    })

    it('should reject tampered signature', () => {
      const signed = signContent(testContent, testSecret)
      signed.signature = 'tampered-signature'
      const result = verifySignature(signed, testSecret)
      expect(result.valid).toBe(false)
    })
  })

  describe('createVersionChecksum', () => {
    it('should create version checksum', () => {
      const checksum = createVersionChecksum(testContent, '1.0.0')
      expect(checksum.version).toBe('1.0.0')
      expect(checksum.checksum).toHaveLength(64)
      expect(checksum.algorithm).toBe('sha256')
      expect(checksum.createdAt).toBeDefined()
      expect(checksum.contentSize).toBe(Buffer.byteLength(testContent))
    })
  })

  describe('IntegrityManifest', () => {
    let manifest: IntegrityManifest

    beforeEach(() => {
      manifest = createIntegrityManifest('item-123', 'skill', testContent, '1.0.0')
    })

    it('should create integrity manifest', () => {
      expect(manifest.itemId).toBe('item-123')
      expect(manifest.itemType).toBe('skill')
      expect(manifest.currentVersion).toBe('1.0.0')
      expect(manifest.checksums).toHaveLength(1)
      expect(manifest.lastVerified).toBeDefined()
    })

    it('should add new version to manifest', () => {
      const newContent = 'Updated content for v2'
      addVersionToManifest(manifest, newContent, '2.0.0')

      expect(manifest.checksums).toHaveLength(2)
      expect(manifest.currentVersion).toBe('2.0.0')

      const v2Checksum = manifest.checksums.find(c => c.version === '2.0.0')
      expect(v2Checksum).toBeDefined()
    })

    it('should update existing version in manifest', () => {
      const updatedContent = 'Updated v1 content'
      addVersionToManifest(manifest, updatedContent, '1.0.0')

      expect(manifest.checksums).toHaveLength(1)
      expect(manifest.checksums[0].checksum).toBe(
        generateHash(updatedContent).hash
      )
    })

    it('should verify content against manifest', () => {
      const result = verifyAgainstManifest(testContent, manifest, '1.0.0')
      expect(result.valid).toBe(true)
    })

    it('should reject tampered content', () => {
      const result = verifyAgainstManifest('Tampered!', manifest, '1.0.0')
      expect(result.valid).toBe(false)
    })

    it('should use current version when not specified', () => {
      const result = verifyAgainstManifest(testContent, manifest)
      expect(result.valid).toBe(true)
    })

    it('should handle missing version', () => {
      const result = verifyAgainstManifest(testContent, manifest, '99.0.0')
      expect(result.valid).toBe(false)
      expect(result.details).toContain('not found in manifest')
    })

    it('should handle missing current version', () => {
      manifest.currentVersion = undefined
      const result = verifyAgainstManifest(testContent, manifest)
      expect(result.valid).toBe(false)
      expect(result.details).toContain('No version specified')
    })
  })

  describe('detectTampering', () => {
    let manifest: IntegrityManifest

    beforeEach(() => {
      manifest = createIntegrityManifest('item-123', 'skill', testContent, '1.0.0')
    })

    it('should detect no tampering for valid content', () => {
      const result = detectTampering(testContent, manifest)
      expect(result.tampered).toBe(false)
      expect(result.details).toBe('Content verified')
    })

    it('should detect tampering with size change', () => {
      const tamperedContent = 'Completely different and much longer content here'
      const result = detectTampering(tamperedContent, manifest)
      expect(result.tampered).toBe(true)
      expect(result.sizeDifference).toBeGreaterThan(0)
      expect(result.details).toBe('Content hash mismatch detected')
    })

    it('should detect tampering without size change', () => {
      // Same length but different content
      const tamperedContent = 'Hello, Tamper!'
      const result = detectTampering(tamperedContent, manifest)
      expect(result.tampered).toBe(true)
    })

    it('should handle missing version', () => {
      const result = detectTampering(testContent, manifest, '99.0.0')
      expect(result.tampered).toBe(false)
      expect(result.details).toContain('not found')
    })
  })

  describe('Batch Operations', () => {
    const files = [
      { path: '/src/file1.ts', content: 'content 1' },
      { path: '/src/file2.ts', content: 'content 2' },
      { path: '/src/file3.ts', content: 'content 3' },
    ]

    describe('generateBatchChecksums', () => {
      it('should generate checksums for multiple files', () => {
        const checksums = generateBatchChecksums(files)
        expect(checksums.size).toBe(3)
        expect(checksums.get('/src/file1.ts')).toBeDefined()
        expect(checksums.get('/src/file2.ts')).toBeDefined()
        expect(checksums.get('/src/file3.ts')).toBeDefined()
      })
    })

    describe('verifyBatchChecksums', () => {
      it('should verify all files with valid checksums', () => {
        const checksums = generateBatchChecksums(files)
        const expected = new Map<string, string>()
        checksums.forEach((hash, path) => expected.set(path, hash.hash))

        const result = verifyBatchChecksums(files, expected)
        expect(result.valid).toBe(true)
        expect(result.failedFiles).toHaveLength(0)
      })

      it('should detect invalid checksums', () => {
        const expected = new Map<string, string>([
          ['/src/file1.ts', 'invalid-hash'],
          ['/src/file2.ts', generateHash('content 2').hash],
          ['/src/file3.ts', generateHash('content 3').hash],
        ])

        const result = verifyBatchChecksums(files, expected)
        expect(result.valid).toBe(false)
        expect(result.failedFiles).toContain('/src/file1.ts')
        expect(result.failedFiles).toHaveLength(1)
      })

      it('should detect missing checksums', () => {
        const expected = new Map<string, string>([
          ['/src/file1.ts', generateHash('content 1').hash],
        ])

        const result = verifyBatchChecksums(files, expected)
        expect(result.valid).toBe(false)
        expect(result.failedFiles).toContain('/src/file2.ts')
        expect(result.failedFiles).toContain('/src/file3.ts')
      })
    })
  })

  describe('Utility Functions', () => {
    describe('formatHash', () => {
      it('should format long hash', () => {
        const hash = 'a'.repeat(64)
        const formatted = formatHash(hash, 16)
        expect(formatted).toBe('aaaaaaaa...aaaaaaaa')
        expect(formatted.length).toBeLessThan(hash.length)
      })

      it('should not format short hash', () => {
        const hash = 'abc123'
        const formatted = formatHash(hash)
        expect(formatted).toBe(hash)
      })
    })

    describe('safeCompareHashes', () => {
      it('should return true for identical hashes', () => {
        const hash = generateHash(testContent).hash
        expect(safeCompareHashes(hash, hash)).toBe(true)
      })

      it('should return false for different hashes', () => {
        const hash1 = generateHash('content1').hash
        const hash2 = generateHash('content2').hash
        expect(safeCompareHashes(hash1, hash2)).toBe(false)
      })

      it('should return false for different length hashes', () => {
        const hash1 = 'abc'
        const hash2 = 'abcdef'
        expect(safeCompareHashes(hash1, hash2)).toBe(false)
      })

      it('should handle invalid hex input', () => {
        expect(safeCompareHashes('not-hex!', 'also-not!')).toBe(false)
      })
    })
  })
})
