import { describe, it, expect } from 'vitest'
import { isBarOpen, timeToMinutes, ScheduleSlot } from '../../utils/time'

describe('timeToMinutes', () => {
  it('converts 00:00 to 0', () => {
    expect(timeToMinutes('00:00')).toBe(0)
  })

  it('converts 12:30 to 750', () => {
    expect(timeToMinutes('12:30')).toBe(750)
  })

  it('converts 23:59 to 1439', () => {
    expect(timeToMinutes('23:59')).toBe(1439)
  })
})

describe('isBarOpen', () => {
  const regularSchedule: ScheduleSlot[] = [
    { day: 1, open: '09:00', close: '18:00' },
    { day: 2, open: '09:00', close: '18:00' },
    { day: 3, open: '09:00', close: '18:00' },
    { day: 4, open: '09:00', close: '18:00' },
    { day: 5, open: '09:00', close: '18:00' },
  ]

  const overnightSchedule: ScheduleSlot[] = [
    { day: 5, open: '20:00', close: '03:00' }, // Friday night to Saturday morning
    { day: 6, open: '20:00', close: '03:00' }, // Saturday night to Sunday morning
  ]

  describe('regular hours (same-day close)', () => {
    it('returns true when current time is within open hours', () => {
      const date = new Date('2026-06-22T12:00:00') // Monday 12:00
      expect(isBarOpen(regularSchedule, date)).toBe(true)
    })

    it('returns false when current time is before opening', () => {
      const date = new Date('2026-06-22T08:00:00') // Monday 08:00
      expect(isBarOpen(regularSchedule, date)).toBe(false)
    })

    it('returns false when current time is after closing', () => {
      const date = new Date('2026-06-22T19:00:00') // Monday 19:00
      expect(isBarOpen(regularSchedule, date)).toBe(false)
    })

    it('returns false on a day with no schedule', () => {
      const date = new Date('2026-06-21T12:00:00') // Sunday 12:00
      expect(isBarOpen(regularSchedule, date)).toBe(false)
    })
  })

  describe('overnight hours (close next day)', () => {
    it('returns true during evening before midnight', () => {
      const date = new Date('2026-06-26T22:00:00') // Friday 22:00
      expect(isBarOpen(overnightSchedule, date)).toBe(true)
    })

    it('returns true after midnight before close', () => {
      const date = new Date('2026-06-27T02:00:00') // Saturday 02:00 (Friday night slot)
      expect(isBarOpen(overnightSchedule, date)).toBe(true)
    })

    it('returns false after overnight close', () => {
      const date = new Date('2026-06-27T04:00:00') // Saturday 04:00
      expect(isBarOpen(overnightSchedule, date)).toBe(false)
    })

    it('returns false before overnight opening', () => {
      const date = new Date('2026-06-26T18:00:00') // Friday 18:00
      expect(isBarOpen(overnightSchedule, date)).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('returns true exactly at opening time', () => {
      const date = new Date('2026-06-22T09:00:00') // Monday 09:00
      expect(isBarOpen(regularSchedule, date)).toBe(true)
    })

    it('returns true exactly at closing time', () => {
      const date = new Date('2026-06-22T18:00:00') // Monday 18:00
      expect(isBarOpen(regularSchedule, date)).toBe(true)
    })

    it('handles multiple slots on same day', () => {
      const multiSlotSchedule: ScheduleSlot[] = [
        { day: 1, open: '09:00', close: '12:00' },
        { day: 1, open: '14:00', close: '18:00' },
      ]

      const morning = new Date('2026-06-22T10:00:00') // Monday
      const afternoon = new Date('2026-06-22T15:00:00') // Monday
      const lunch = new Date('2026-06-22T13:00:00') // Monday

      expect(isBarOpen(multiSlotSchedule, morning)).toBe(true)
      expect(isBarOpen(multiSlotSchedule, afternoon)).toBe(true)
      expect(isBarOpen(multiSlotSchedule, lunch)).toBe(false)
    })
  })
})
