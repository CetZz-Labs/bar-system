import { describe, it, expect, vi, afterEach } from 'vitest'
import { calculateAge, isOfLegalAge } from '../age'

describe('calculateAge', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calculates correct age when birthday has passed this year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15'))

    const birthdate = new Date('2000-01-15')
    expect(calculateAge(birthdate)).toBe(24)
  })

  it('calculates correct age when birthday has not yet occurred this year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-03-15'))

    const birthdate = new Date('2000-06-15')
    expect(calculateAge(birthdate)).toBe(23)
  })

  it('calculates correct age on exact birthday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15'))

    const birthdate = new Date('2000-06-15')
    expect(calculateAge(birthdate)).toBe(24)
  })

  it('returns 18 for someone born exactly 18 years ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15'))

    const birthdate = new Date('2006-06-15')
    expect(calculateAge(birthdate)).toBe(18)
  })

  it('returns 17 for someone born 17 years ago (birthday not yet this year)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15'))

    const birthdate = new Date('2006-12-25')
    expect(calculateAge(birthdate)).toBe(17)
  })
})

describe('isOfLegalAge', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true for users 18 or older', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15'))

    expect(isOfLegalAge(new Date('2006-06-15'))).toBe(true)
    expect(isOfLegalAge(new Date('2000-01-01'))).toBe(true)
  })

  it('returns false for users under 18', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15'))

    expect(isOfLegalAge(new Date('2006-12-25'))).toBe(false)
    expect(isOfLegalAge(new Date('2010-01-01'))).toBe(false)
  })

  it('supports custom minAge parameter', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15'))

    expect(isOfLegalAge(new Date('2003-06-15'), 21)).toBe(true)
    expect(isOfLegalAge(new Date('2006-06-15'), 21)).toBe(false)
  })
})
