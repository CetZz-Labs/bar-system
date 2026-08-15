import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { closeBar } from '../closeBar'
import Bar from '../../models/Bar'
import Shift, { ShiftEndReason } from '../../models/Shift'
import AuditLog, { AuditAction } from '../../models/AuditLog'
import { getLastClosingBoundary } from '../shift'
import { closeOutingsForBar, ClosureReason } from '../closeOuting'

vi.mock('../../models/Bar', () => ({
  default: { findById: vi.fn() },
}))

vi.mock('../../models/Shift', () => ({
  default: { find: vi.fn() },
  ShiftEndReason: { MANUAL: 'MANUAL', KICKED_OUT: 'KICKED_OUT', BAR_CLOSED: 'BAR_CLOSED' },
}))

vi.mock('../../models/AuditLog', () => ({
  default: { create: vi.fn() },
  AuditAction: {
    CASHIER_LOGIN: 'CASHIER_LOGIN',
    CASHIER_LOGOUT: 'CASHIER_LOGOUT',
    CASHIER_KICKED_OUT: 'CASHIER_KICKED_OUT',
    SHIFT_AUTO_CLOSED: 'SHIFT_AUTO_CLOSED',
  },
}))

vi.mock('../shift', () => ({
  getLastClosingBoundary: vi.fn(),
}))

vi.mock('../closeOuting', () => ({
  closeOutingsForBar: vi.fn().mockResolvedValue(0),
  ClosureReason: { MANUAL: 'MANUAL', BAR_CLOSED: 'BAR_CLOSED' },
}))

describe('closeBar', () => {
  const barId = new Types.ObjectId().toString()

  beforeEach(() => {
    vi.mocked(Bar.findById).mockReset()
    vi.mocked(Shift.find).mockReset()
    vi.mocked(AuditLog.create).mockReset()
    vi.mocked(getLastClosingBoundary).mockReset()
    vi.mocked(closeOutingsForBar).mockReset()
    vi.mocked(closeOutingsForBar).mockResolvedValue(0)
  })

  it('returns a no-op result when the bar does not exist', async () => {
    vi.mocked(Bar.findById).mockResolvedValue(null)

    const result = await closeBar(barId)

    expect(result).toEqual({ closedShifts: 0, closedOutings: 0 })
    expect(closeOutingsForBar).not.toHaveBeenCalled()
  })

  it('closes every stale shift (startedAt before the boundary) and audits each one', async () => {
    const boundary = new Date('2026-08-06T06:00:00')
    const staleShiftA = {
      user: new Types.ObjectId(),
      deviceInfo: 'POS-1',
      startedAt: new Date('2026-08-05T20:00:00'),
      endedAt: undefined,
      endReason: undefined,
      save: vi.fn().mockResolvedValue(true),
    }
    const staleShiftB = {
      user: new Types.ObjectId(),
      deviceInfo: 'POS-2',
      startedAt: new Date('2026-08-05T22:00:00'),
      endedAt: undefined,
      endReason: undefined,
      save: vi.fn().mockResolvedValue(true),
    }

    vi.mocked(Bar.findById).mockResolvedValue({ closingTime: '06:00' } as any)
    vi.mocked(getLastClosingBoundary).mockReturnValue(boundary)
    vi.mocked(Shift.find).mockResolvedValue([staleShiftA, staleShiftB] as any)
    vi.mocked(closeOutingsForBar).mockResolvedValue(3)

    const actorUserId = new Types.ObjectId().toString()
    const result = await closeBar(barId, { actorUserId, deviceInfo: 'POS-1', ip: '127.0.0.1' })

    expect(staleShiftA.endReason).toBe(ShiftEndReason.BAR_CLOSED)
    expect(staleShiftA.endedAt).toBe(boundary)
    expect(staleShiftA.save).toHaveBeenCalled()
    expect(staleShiftB.endReason).toBe(ShiftEndReason.BAR_CLOSED)
    expect(staleShiftB.save).toHaveBeenCalled()

    expect(AuditLog.create).toHaveBeenCalledTimes(2)
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ bar: barId, user: staleShiftA.user, action: AuditAction.SHIFT_AUTO_CLOSED })
    )
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ bar: barId, user: staleShiftB.user, action: AuditAction.SHIFT_AUTO_CLOSED })
    )

    expect(closeOutingsForBar).toHaveBeenCalledWith(
      barId,
      expect.objectContaining({ reason: ClosureReason.BAR_CLOSED, actorUserId, deviceInfo: 'POS-1', ip: '127.0.0.1' })
    )

    expect(result).toEqual({ closedShifts: 2, closedOutings: 3 })
  })

  it('still closes outings even when there are no stale shifts', async () => {
    const boundary = new Date('2026-08-06T06:00:00')
    vi.mocked(Bar.findById).mockResolvedValue({ closingTime: '06:00' } as any)
    vi.mocked(getLastClosingBoundary).mockReturnValue(boundary)
    vi.mocked(Shift.find).mockResolvedValue([] as any)
    vi.mocked(closeOutingsForBar).mockResolvedValue(1)

    const result = await closeBar(barId)

    expect(AuditLog.create).not.toHaveBeenCalled()
    expect(closeOutingsForBar).toHaveBeenCalled()
    expect(result).toEqual({ closedShifts: 0, closedOutings: 1 })
  })

  it('uses an explicit boundary override instead of recomputing it from the bar', async () => {
    const overrideBoundary = new Date('2026-08-01T06:00:00')
    vi.mocked(Bar.findById).mockResolvedValue({ closingTime: '06:00' } as any)
    vi.mocked(Shift.find).mockResolvedValue([] as any)

    await closeBar(barId, { boundary: overrideBoundary })

    expect(getLastClosingBoundary).not.toHaveBeenCalled()
    expect(Shift.find).toHaveBeenCalledWith(
      expect.objectContaining({ bar: barId, endedAt: null, startedAt: { $lt: overrideBoundary } })
    )
  })
})
