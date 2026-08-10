import { describe, expect, it } from 'vitest'
import { getBarDayRange, isShiftPastBarClose } from '../barDay'

describe('getBarDayRange', () => {
  it('before closing hour uses previous calendar day as start', () => {
    // 2026-08-06 03:00 → día del bar [2026-08-05 06:00, 2026-08-06 06:00)
    const now = new Date(2026, 7, 6, 3, 0, 0)
    const { start, end } = getBarDayRange(now, '06:00')
    expect(start).toEqual(new Date(2026, 7, 5, 6, 0, 0))
    expect(end).toEqual(new Date(2026, 7, 6, 6, 0, 0))
  })

  it('after closing hour spans until next closing', () => {
    const now = new Date(2026, 7, 6, 22, 0, 0)
    const { start, end } = getBarDayRange(now, '06:00')
    expect(start).toEqual(new Date(2026, 7, 6, 6, 0, 0))
    expect(end).toEqual(new Date(2026, 7, 7, 6, 0, 0))
  })
})

describe('isShiftPastBarClose', () => {
  it('returns true after bar day ends', () => {
    const started = new Date(2026, 7, 6, 22, 0, 0)
    const now = new Date(2026, 7, 7, 6, 0, 0)
    expect(isShiftPastBarClose(started, now, '06:00')).toBe(true)
  })

  it('returns false during same bar day', () => {
    const started = new Date(2026, 7, 6, 22, 0, 0)
    const now = new Date(2026, 7, 7, 3, 0, 0)
    expect(isShiftPastBarClose(started, now, '06:00')).toBe(false)
  })
})
