import { describe, expect, it } from 'vitest'
import { isGptersEmail } from '@gpters/lib/account-access'

describe('GPTers account access policy', () => {
  it('accepts exact gpters.org email addresses', () => {
    expect(isGptersEmail('member@gpters.org')).toBe(true)
    expect(isGptersEmail('Member+toolkit@GPTERS.ORG')).toBe(true)
    expect(isGptersEmail('  member@gpters.org  ')).toBe(true)
  })

  it('rejects personal, malformed, and lookalike domains', () => {
    expect(isGptersEmail('jwhyun2215@gmail.com')).toBe(false)
    expect(isGptersEmail('member@notgpters.org')).toBe(false)
    expect(isGptersEmail('member@gpters.org.example.com')).toBe(false)
    expect(isGptersEmail('@gpters.org')).toBe(false)
    expect(isGptersEmail('member@gpters.org@evil.com')).toBe(false)
    expect(isGptersEmail(undefined)).toBe(false)
    expect(isGptersEmail(null)).toBe(false)
  })
})
