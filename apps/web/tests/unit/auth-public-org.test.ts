import { describe, expect, it } from 'vitest'
import { accessDomainOf, isAllowedAccountEmail, isGptersEmail } from '@gpters/lib/account-access'

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

  it('allows GPTers accounts and every individually approved external account', () => {
    expect(isAllowedAccountEmail('member@gpters.org')).toBe(true)
    expect(isAllowedAccountEmail('zeusajm@yonsei.ac.kr')).toBe(true)
    expect(isAllowedAccountEmail('  ZeusAJM@Yonsei.ac.kr ')).toBe(true)
    expect(isAllowedAccountEmail('qgq214@gmail.com')).toBe(true)
    expect(isAllowedAccountEmail(' QGQ214@Gmail.com ')).toBe(true)
  })

  it('does not open the approved account domain or lookalikes to others', () => {
    expect(isAllowedAccountEmail('someone-else@yonsei.ac.kr')).toBe(false)
    expect(isAllowedAccountEmail('zeusajm@gmail.com')).toBe(false)
    expect(isAllowedAccountEmail('zeusajm@yonsei.ac.kr.example.com')).toBe(false)
    expect(isAllowedAccountEmail('jwhyun2215@gmail.com')).toBe(false)
    expect(isAllowedAccountEmail('qgq214@gmail.com.example.com')).toBe(false)
    expect(isAllowedAccountEmail('qgq2140@gmail.com')).toBe(false)
    expect(isAllowedAccountEmail(undefined)).toBe(false)
    expect(isAllowedAccountEmail(null)).toBe(false)
  })

  it('resolves organization membership through the GPTers domain', () => {
    expect(accessDomainOf('member@gpters.org')).toBe('gpters.org')
    expect(accessDomainOf('ZeusAJM@Yonsei.ac.kr')).toBe('gpters.org')
    expect(accessDomainOf('QGQ214@Gmail.com')).toBe('gpters.org')
    expect(accessDomainOf('someone-else@yonsei.ac.kr')).toBe('yonsei.ac.kr')
    expect(accessDomainOf('someone-else@gmail.com')).toBe('gmail.com')
  })
})
