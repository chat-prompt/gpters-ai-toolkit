/**
 * Metadata Quality Check Tests
 *
 * Unit tests for the non-blocking metadata quality hints
 * returned during deploy_skill to help improve discoverability.
 */

import { describe, it, expect } from 'vitest'
import { checkMetadataQuality } from '@/lib/plugin/skill-validator'
import type { QualityWarning, MetadataQualityInput } from '@/lib/plugin/skill-validator'

describe('checkMetadataQuality', () => {
  it('should warn when description is shorter than 50 characters', () => {
    const input: MetadataQualityInput = {
      description: 'Short desc',
      tags: ['test'],
      content: 'a'.repeat(200),
    }

    const warnings = checkMetadataQuality(input)

    expect(warnings).toHaveLength(1)
    expect(warnings[0].field).toBe('description')
    expect(warnings[0].message).toContain('10자')
    expect(warnings[0].message).toContain('50자 이상')
  })

  it('should warn when tags array is empty', () => {
    const input: MetadataQualityInput = {
      description: 'A sufficiently long description that is over fifty characters in total length.',
      tags: [],
      content: 'a'.repeat(200),
    }

    const warnings = checkMetadataQuality(input)

    expect(warnings).toHaveLength(1)
    expect(warnings[0].field).toBe('tags')
    expect(warnings[0].message).toContain('태그가 없습니다')
  })

  it('should warn when content is shorter than 200 characters', () => {
    const input: MetadataQualityInput = {
      description: 'A sufficiently long description that is over fifty characters in total length.',
      tags: ['test'],
      content: 'Short content',
    }

    const warnings = checkMetadataQuality(input)

    expect(warnings).toHaveLength(1)
    expect(warnings[0].field).toBe('content')
    expect(warnings[0].message).toContain('13자')
    expect(warnings[0].message).toContain('200자 이상')
  })

  it('should return empty array when all criteria are met', () => {
    const input: MetadataQualityInput = {
      description: 'A sufficiently long description that is over fifty characters in total length.',
      tags: ['test', 'quality'],
      content: 'a'.repeat(200),
    }

    const warnings = checkMetadataQuality(input)

    expect(warnings).toEqual([])
  })

  it('should return multiple warnings when multiple criteria fail', () => {
    const input: MetadataQualityInput = {
      description: 'Short',
      tags: [],
      content: 'Tiny',
    }

    const warnings = checkMetadataQuality(input)

    expect(warnings).toHaveLength(3)

    const fields = warnings.map((w: QualityWarning) => w.field)
    expect(fields).toContain('description')
    expect(fields).toContain('tags')
    expect(fields).toContain('content')
  })

  it('should handle undefined description', () => {
    const input: MetadataQualityInput = {
      tags: ['test'],
      content: 'a'.repeat(200),
    }

    const warnings = checkMetadataQuality(input)

    expect(warnings).toHaveLength(1)
    expect(warnings[0].field).toBe('description')
    expect(warnings[0].message).toContain('0자')
  })

  it('should handle undefined tags', () => {
    const input: MetadataQualityInput = {
      description: 'A sufficiently long description that is over fifty characters in total length.',
      content: 'a'.repeat(200),
    }

    const warnings = checkMetadataQuality(input)

    expect(warnings).toHaveLength(1)
    expect(warnings[0].field).toBe('tags')
  })

  it('should handle undefined content', () => {
    const input: MetadataQualityInput = {
      description: 'A sufficiently long description that is over fifty characters in total length.',
      tags: ['test'],
    }

    const warnings = checkMetadataQuality(input)

    expect(warnings).toHaveLength(1)
    expect(warnings[0].field).toBe('content')
    expect(warnings[0].message).toContain('0자')
  })

  it('should pass when description is exactly 50 characters', () => {
    const input: MetadataQualityInput = {
      description: 'a'.repeat(50),
      tags: ['test'],
      content: 'a'.repeat(200),
    }

    const warnings = checkMetadataQuality(input)

    expect(warnings).toEqual([])
  })

  it('should pass when content is exactly 200 characters', () => {
    const input: MetadataQualityInput = {
      description: 'a'.repeat(50),
      tags: ['test'],
      content: 'a'.repeat(200),
    }

    const warnings = checkMetadataQuality(input)

    expect(warnings).toEqual([])
  })

  it('should include actionable suggestions in each warning', () => {
    const input: MetadataQualityInput = {
      description: 'Short',
      tags: [],
      content: 'Tiny',
    }

    const warnings = checkMetadataQuality(input)

    for (const warning of warnings) {
      expect(warning.suggestion).toBeTruthy()
      expect(typeof warning.suggestion).toBe('string')
      expect(warning.suggestion.length).toBeGreaterThan(0)
    }
  })

  it('should handle empty string inputs gracefully', () => {
    const input: MetadataQualityInput = {
      description: '',
      tags: [],
      content: '',
    }

    const warnings = checkMetadataQuality(input)

    expect(warnings).toHaveLength(3)
    expect(warnings[0].field).toBe('description')
    expect(warnings[0].message).toContain('0자')
    expect(warnings[2].field).toBe('content')
    expect(warnings[2].message).toContain('0자')
  })
})
