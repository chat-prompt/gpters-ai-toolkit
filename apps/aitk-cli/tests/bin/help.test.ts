import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const binSrc = readFileSync(new URL('../../bin/aitk.ts', import.meta.url), 'utf-8')

describe('aitk bin — suggest removal (EDU-7987 D2)', () => {
  it('has no suggest/suggestions/resolve imports', () => {
    expect(binSrc).not.toMatch(/runSuggest\b/)
    expect(binSrc).not.toMatch(/runSuggestions\b/)
    expect(binSrc).not.toMatch(/runResolve\b/)
  })
  it('has no help text for suggest commands', () => {
    expect(binSrc).not.toMatch(/\baitk suggest\b/)
    expect(binSrc).not.toMatch(/\baitk suggestions\b/)
    expect(binSrc).not.toMatch(/\baitk resolve\b/)
  })
})
