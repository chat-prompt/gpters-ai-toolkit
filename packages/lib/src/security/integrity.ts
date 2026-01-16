/**
 * Content Integrity Verification
 *
 * Provides hash-based verification, tampering detection,
 * signature verification, and version-specific checksums.
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { createLogger } from '../core/logger'

const log = createLogger('integrity')

/**
 * Supported hash algorithms
 */
export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512' | 'md5'

/**
 * Content hash result
 */
export interface ContentHash {
  algorithm: HashAlgorithm
  hash: string
  timestamp: number
}

/**
 * Verification result
 */
export interface VerificationResult {
  valid: boolean
  algorithm: HashAlgorithm
  expectedHash: string
  actualHash: string
  timestamp: number
  details?: string
}

/**
 * Signed content metadata
 */
export interface SignedContent {
  content: string
  signature: string
  algorithm: HashAlgorithm
  signedAt: number
  version?: string
}

/**
 * Version checksum entry
 */
export interface VersionChecksum {
  version: string
  checksum: string
  algorithm: HashAlgorithm
  createdAt: number
  contentSize: number
}

/**
 * Integrity manifest for a catalog item
 */
export interface IntegrityManifest {
  itemId: string
  itemType: string
  checksums: VersionChecksum[]
  currentVersion?: string
  lastVerified?: number
}

/**
 * Generate a hash for content
 */
export function generateHash(
  content: string | Buffer,
  algorithm: HashAlgorithm = 'sha256'
): ContentHash {
  const hash = createHash(algorithm)
  hash.update(typeof content === 'string' ? content : content)

  return {
    algorithm,
    hash: hash.digest('hex'),
    timestamp: Date.now(),
  }
}

/**
 * Generate a hash with prefix for subresource integrity (SRI)
 */
export function generateSRIHash(
  content: string | Buffer,
  algorithm: HashAlgorithm = 'sha384'
): string {
  const hash = createHash(algorithm)
  hash.update(typeof content === 'string' ? content : content)
  return `${algorithm}-${hash.digest('base64')}`
}

/**
 * Verify content against expected hash
 */
export function verifyHash(
  content: string | Buffer,
  expectedHash: string,
  algorithm: HashAlgorithm = 'sha256'
): VerificationResult {
  const actual = generateHash(content, algorithm)
  const valid = actual.hash === expectedHash

  if (!valid) {
    log.warn('Hash verification failed', {
      algorithm,
      expected: expectedHash.substring(0, 16) + '...',
      actual: actual.hash.substring(0, 16) + '...',
    })
  }

  return {
    valid,
    algorithm,
    expectedHash,
    actualHash: actual.hash,
    timestamp: Date.now(),
  }
}

/**
 * Verify SRI hash
 */
export function verifySRIHash(
  content: string | Buffer,
  sriHash: string
): VerificationResult {
  const parts = sriHash.split('-')
  if (parts.length < 2) {
    return {
      valid: false,
      algorithm: 'sha256',
      expectedHash: sriHash,
      actualHash: '',
      timestamp: Date.now(),
      details: 'Invalid SRI hash format',
    }
  }

  const algorithm = parts[0] as HashAlgorithm
  const base64Hash = parts.slice(1).join('-')

  // Validate algorithm
  const validAlgorithms: HashAlgorithm[] = ['sha256', 'sha384', 'sha512', 'md5']
  if (!validAlgorithms.includes(algorithm)) {
    return {
      valid: false,
      algorithm: 'sha256',
      expectedHash: sriHash,
      actualHash: '',
      timestamp: Date.now(),
      details: 'Invalid SRI hash format',
    }
  }

  const hash = createHash(algorithm)
  hash.update(typeof content === 'string' ? content : content)
  const actualBase64 = hash.digest('base64')
  const valid = actualBase64 === base64Hash

  return {
    valid,
    algorithm,
    expectedHash: base64Hash,
    actualHash: actualBase64,
    timestamp: Date.now(),
  }
}

/**
 * Sign content with HMAC
 */
export function signContent(
  content: string,
  secret: string,
  algorithm: HashAlgorithm = 'sha256',
  version?: string
): SignedContent {
  const hmac = createHmac(algorithm, secret)
  hmac.update(content)

  return {
    content,
    signature: hmac.digest('hex'),
    algorithm,
    signedAt: Date.now(),
    version,
  }
}

/**
 * Verify signed content
 */
export function verifySignature(
  signedContent: SignedContent,
  secret: string
): VerificationResult {
  const hmac = createHmac(signedContent.algorithm, secret)
  hmac.update(signedContent.content)
  const expectedSignature = hmac.digest('hex')

  // Use timing-safe comparison to prevent timing attacks
  let valid = false
  try {
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')
    const actualBuffer = Buffer.from(signedContent.signature, 'hex')
    if (expectedBuffer.length === actualBuffer.length) {
      valid = timingSafeEqual(expectedBuffer, actualBuffer)
    }
  } catch {
    valid = false
  }

  if (!valid) {
    log.warn('Signature verification failed', {
      algorithm: signedContent.algorithm,
      version: signedContent.version,
    })
  }

  return {
    valid,
    algorithm: signedContent.algorithm,
    expectedHash: expectedSignature,
    actualHash: signedContent.signature,
    timestamp: Date.now(),
  }
}

/**
 * Create version checksum
 */
export function createVersionChecksum(
  content: string,
  version: string,
  algorithm: HashAlgorithm = 'sha256'
): VersionChecksum {
  const hash = generateHash(content, algorithm)

  return {
    version,
    checksum: hash.hash,
    algorithm,
    createdAt: Date.now(),
    contentSize: Buffer.byteLength(content, 'utf-8'),
  }
}

/**
 * Create integrity manifest for catalog item
 */
export function createIntegrityManifest(
  itemId: string,
  itemType: string,
  content: string,
  version: string
): IntegrityManifest {
  const checksum = createVersionChecksum(content, version)

  return {
    itemId,
    itemType,
    checksums: [checksum],
    currentVersion: version,
    lastVerified: Date.now(),
  }
}

/**
 * Add version to existing manifest
 */
export function addVersionToManifest(
  manifest: IntegrityManifest,
  content: string,
  version: string
): IntegrityManifest {
  // Check if version already exists
  const existingIndex = manifest.checksums.findIndex(c => c.version === version)
  const newChecksum = createVersionChecksum(content, version)

  if (existingIndex >= 0) {
    // Update existing checksum
    manifest.checksums[existingIndex] = newChecksum
  } else {
    // Add new checksum
    manifest.checksums.push(newChecksum)
  }

  manifest.currentVersion = version
  manifest.lastVerified = Date.now()

  return manifest
}

/**
 * Verify content against manifest
 */
export function verifyAgainstManifest(
  content: string,
  manifest: IntegrityManifest,
  version?: string
): VerificationResult {
  const targetVersion = version || manifest.currentVersion

  if (!targetVersion) {
    return {
      valid: false,
      algorithm: 'sha256',
      expectedHash: '',
      actualHash: '',
      timestamp: Date.now(),
      details: 'No version specified and no current version in manifest',
    }
  }

  const checksum = manifest.checksums.find(c => c.version === targetVersion)

  if (!checksum) {
    return {
      valid: false,
      algorithm: 'sha256',
      expectedHash: '',
      actualHash: '',
      timestamp: Date.now(),
      details: `Version ${targetVersion} not found in manifest`,
    }
  }

  const result = verifyHash(content, checksum.checksum, checksum.algorithm)

  // Update last verified time
  manifest.lastVerified = Date.now()

  return result
}

/**
 * Detect content tampering by comparing sizes
 */
export function detectTampering(
  content: string,
  manifest: IntegrityManifest,
  version?: string
): {
  tampered: boolean
  sizeDifference?: number
  expectedSize?: number
  actualSize?: number
  details?: string
} {
  const targetVersion = version || manifest.currentVersion

  if (!targetVersion) {
    return {
      tampered: false,
      details: 'No version to compare against',
    }
  }

  const checksum = manifest.checksums.find(c => c.version === targetVersion)

  if (!checksum) {
    return {
      tampered: false,
      details: `Version ${targetVersion} not found in manifest`,
    }
  }

  const actualSize = Buffer.byteLength(content, 'utf-8')
  const sizeDifference = Math.abs(actualSize - checksum.contentSize)

  // Size difference detection (preliminary check)
  if (sizeDifference > 0) {
    // Verify with hash for confirmation
    const verification = verifyHash(content, checksum.checksum, checksum.algorithm)

    if (!verification.valid) {
      log.error('Content tampering detected', {
        itemId: manifest.itemId,
        version: targetVersion,
        expectedSize: checksum.contentSize,
        actualSize,
      })

      return {
        tampered: true,
        sizeDifference,
        expectedSize: checksum.contentSize,
        actualSize,
        details: 'Content hash mismatch detected',
      }
    }
  }

  // Final hash verification
  const verification = verifyHash(content, checksum.checksum, checksum.algorithm)

  return {
    tampered: !verification.valid,
    sizeDifference: verification.valid ? 0 : sizeDifference,
    expectedSize: checksum.contentSize,
    actualSize,
    details: verification.valid ? 'Content verified' : 'Hash mismatch',
  }
}

/**
 * Generate checksum for multiple files (batch operation)
 */
export function generateBatchChecksums(
  files: Array<{ path: string; content: string }>,
  algorithm: HashAlgorithm = 'sha256'
): Map<string, ContentHash> {
  const results = new Map<string, ContentHash>()

  for (const file of files) {
    results.set(file.path, generateHash(file.content, algorithm))
  }

  return results
}

/**
 * Verify multiple files against expected checksums
 */
export function verifyBatchChecksums(
  files: Array<{ path: string; content: string }>,
  expectedChecksums: Map<string, string>,
  algorithm: HashAlgorithm = 'sha256'
): {
  valid: boolean
  results: Map<string, VerificationResult>
  failedFiles: string[]
} {
  const results = new Map<string, VerificationResult>()
  const failedFiles: string[] = []

  for (const file of files) {
    const expected = expectedChecksums.get(file.path)

    if (!expected) {
      results.set(file.path, {
        valid: false,
        algorithm,
        expectedHash: '',
        actualHash: generateHash(file.content, algorithm).hash,
        timestamp: Date.now(),
        details: 'No expected checksum found',
      })
      failedFiles.push(file.path)
      continue
    }

    const result = verifyHash(file.content, expected, algorithm)
    results.set(file.path, result)

    if (!result.valid) {
      failedFiles.push(file.path)
    }
  }

  return {
    valid: failedFiles.length === 0,
    results,
    failedFiles,
  }
}

/**
 * Format hash for display (truncated)
 */
export function formatHash(hash: string, length = 16): string {
  if (hash.length <= length) return hash
  return `${hash.substring(0, length / 2)}...${hash.substring(hash.length - length / 2)}`
}

/**
 * Compare two hashes with timing-safe comparison
 */
export function safeCompareHashes(hash1: string, hash2: string): boolean {
  try {
    // Validate hex format
    const hexRegex = /^[0-9a-fA-F]+$/
    if (!hexRegex.test(hash1) || !hexRegex.test(hash2)) {
      return false
    }

    const buffer1 = Buffer.from(hash1, 'hex')
    const buffer2 = Buffer.from(hash2, 'hex')

    if (buffer1.length !== buffer2.length) {
      return false
    }

    return timingSafeEqual(buffer1, buffer2)
  } catch {
    return false
  }
}
