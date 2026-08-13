import { describe, expect, it } from 'vitest'
import { pointsFromAmount } from '../consumptionPoints'

describe('pointsFromAmount', () => {
  it('floors amount / 1000', () => {
    expect(pointsFromAmount(12_500)).toBe(12)
    expect(pointsFromAmount(1000)).toBe(1)
    expect(pointsFromAmount(999)).toBe(0)
    expect(pointsFromAmount(0)).toBe(0)
  })

  it('returns 0 for negative or non-finite amounts', () => {
    expect(pointsFromAmount(-1000)).toBe(0)
    expect(pointsFromAmount(Number.NaN)).toBe(0)
    expect(pointsFromAmount(Number.POSITIVE_INFINITY)).toBe(0)
  })
})
