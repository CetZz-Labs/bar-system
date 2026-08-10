import { describe, expect, it } from 'vitest'
import { extractInviteCodeFromQuery, isDirectCodeQuery } from '../cashierSearch'

describe('extractInviteCodeFromQuery', () => {
  it('parses join URLs', () => {
    expect(extractInviteCodeFromQuery('http://localhost:5173/unirse/ab12cd')).toBe('AB12CD')
    expect(extractInviteCodeFromQuery('https://labanda.app/unirse/ZZ99AA')).toBe('ZZ99AA')
  })

  it('accepts raw 6-char codes', () => {
    expect(extractInviteCodeFromQuery('ban4k2')).toBe('BAN4K2')
  })

  it('rejects short text', () => {
    expect(extractInviteCodeFromQuery('a')).toBeNull()
    expect(isDirectCodeQuery('los')).toBe(false)
  })
})
