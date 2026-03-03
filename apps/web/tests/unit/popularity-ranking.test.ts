/**
 * Tests for popularity-based ranking in semantic search.
 *
 * Validates computePopularityScore and blendScore produce correct values
 * for various apply counts, and that new skills (no data) fall back to
 * pure vector similarity.
 */

import { describe, it, expect } from 'vitest'
import {
  computePopularityScore,
  blendScore,
  type SkillPopularity,
} from '@gpters/lib/search'

describe('computePopularityScore', () => {
  it('should return 0 for undefined (unknown skill)', () => {
    expect(computePopularityScore(undefined)).toBe(0)
  })

  it('should return 0 for a skill with zero applies', () => {
    const pop: SkillPopularity = { applyCount: 0 }
    expect(computePopularityScore(pop)).toBe(0)
  })

  it('should compute apply score correctly', () => {
    // 5 applies / 10 = 0.5
    const pop: SkillPopularity = { applyCount: 5 }
    expect(computePopularityScore(pop)).toBeCloseTo(0.5, 5)
  })

  it('should cap apply count at 10', () => {
    // 20 applies → min(20/10, 1.0) = 1.0
    const pop: SkillPopularity = { applyCount: 20 }
    expect(computePopularityScore(pop)).toBeCloseTo(1.0, 5)
  })

  it('should handle partial data (1 apply)', () => {
    // 1/10 = 0.1
    const pop: SkillPopularity = { applyCount: 1 }
    expect(computePopularityScore(pop)).toBeCloseTo(0.1, 5)
  })
})

describe('blendScore', () => {
  it('should weight similarity at 0.8 and popularity at 0.2', () => {
    // 0.9 * 0.8 + 1.0 * 0.2 = 0.72 + 0.2 = 0.92
    expect(blendScore(0.9, 1.0)).toBeCloseTo(0.92, 5)
  })

  it('should return similarity * 0.8 when popularity is 0', () => {
    expect(blendScore(0.7, 0)).toBeCloseTo(0.56, 5)
  })

  it('should return popularity * 0.2 when similarity is 0', () => {
    expect(blendScore(0, 0.5)).toBeCloseTo(0.1, 5)
  })

  it('should return 0 when both inputs are 0', () => {
    expect(blendScore(0, 0)).toBe(0)
  })

  it('should not exceed 1.0 for max inputs', () => {
    expect(blendScore(1.0, 1.0)).toBeCloseTo(1.0, 5)
  })
})

describe('ranking integration (score ordering)', () => {
  it('should allow a lower-similarity but popular skill to outrank a higher-similarity unpopular one', () => {
    // Skill A: similarity 0.6, very popular (score 1.0)
    // blended = 0.6*0.8 + 1.0*0.2 = 0.68
    const scoreA = blendScore(0.6, computePopularityScore({ applyCount: 20 }))

    // Skill B: similarity 0.7, no popularity data
    // blended = 0.7*0.8 + 0*0.2 = 0.56
    const scoreB = blendScore(0.7, computePopularityScore(undefined))

    expect(scoreA).toBeGreaterThan(scoreB)
  })

  it('should preserve order when popularity is equal', () => {
    const pop: SkillPopularity = { applyCount: 3 }
    const popScore = computePopularityScore(pop)

    const scoreHigh = blendScore(0.9, popScore)
    const scoreLow = blendScore(0.5, popScore)

    expect(scoreHigh).toBeGreaterThan(scoreLow)
  })
})
