import { describe, it, expect } from 'vitest'
import { getLastClosingBoundary } from '../shift'

describe('getLastClosingBoundary', () => {
  it('returns today\'s closing time when now is after it', () => {
    const now = new Date(2026, 0, 15, 8, 0, 0) // hoy 08:00
    const boundary = getLastClosingBoundary('06:00', now)

    expect(boundary.getFullYear()).toBe(2026)
    expect(boundary.getMonth()).toBe(0)
    expect(boundary.getDate()).toBe(15)
    expect(boundary.getHours()).toBe(6)
    expect(boundary.getMinutes()).toBe(0)
  })

  it('returns yesterday\'s closing time when now is before it', () => {
    const now = new Date(2026, 0, 15, 3, 0, 0) // hoy 03:00, el cierre de hoy (06:00) todavia no paso
    const boundary = getLastClosingBoundary('06:00', now)

    expect(boundary.getFullYear()).toBe(2026)
    expect(boundary.getMonth()).toBe(0)
    expect(boundary.getDate()).toBe(14)
    expect(boundary.getHours()).toBe(6)
    expect(boundary.getMinutes()).toBe(0)
  })

  it('returns today\'s closing time when now is exactly the closing time', () => {
    const now = new Date(2026, 0, 15, 6, 0, 0)
    const boundary = getLastClosingBoundary('06:00', now)

    expect(boundary.getFullYear()).toBe(2026)
    expect(boundary.getMonth()).toBe(0)
    expect(boundary.getDate()).toBe(15)
    expect(boundary.getHours()).toBe(6)
    expect(boundary.getMinutes()).toBe(0)
  })

  it('throws for an invalid closingTime format', () => {
    expect(() => getLastClosingBoundary('25:00', new Date())).toThrow()
  })
})
