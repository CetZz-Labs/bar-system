import { describe, it, expect, vi } from 'vitest'
import { generateToken } from '../token'

describe('generateToken', () => {
  it('returns a string', () => {
    const result = generateToken()
    expect(typeof result).toBe('string')
  })

  it('returns a 6-digit number as string', () => {
    const result = generateToken()
    expect(result.length).toBe(6)
    expect(Number(result)).not.toBeNaN()
  })

  it('generates different tokens on successive calls', () => {
    const results = new Set<string>()
    for (let i = 0; i < 10; i++) {
      results.add(generateToken())
    }
    // With 6 digits (900k possibilities), 10 calls should produce at least 2 unique values
    expect(results.size).toBeGreaterThan(1)
  })

  it('returns value between 100000 and 999999', () => {
    const result = generateToken()
    const num = Number(result)
    expect(num).toBeGreaterThanOrEqual(100000)
    expect(num).toBeLessThanOrEqual(999999)
  })
})