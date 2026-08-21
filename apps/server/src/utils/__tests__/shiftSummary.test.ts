import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildShiftSummary, generateShiftSummary, ShiftSummaryError } from '../shiftSummary'
import Shift, { ShiftSummaryStatus } from '../../models/Shift'
import Consumption, { ConsumptionStatus } from '../../models/Consumption'
import PointsTransaction from '../../models/PointsTransaction'

vi.mock('../../models/Shift', () => ({
  default: {
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
  ShiftSummaryStatus: { PENDING: 'PENDING', VIEWED: 'VIEWED' },
}))

vi.mock('../../models/Consumption', () => ({
  default: { find: vi.fn() },
  ConsumptionStatus: {
    PENDING_LEADER_CONFIRMATION: 'PENDING_LEADER_CONFIRMATION',
    CONFIRMED: 'CONFIRMED',
    REJECTED: 'REJECTED',
    DISPUTED: 'DISPUTED',
  },
}))

vi.mock('../../models/PointsTransaction', () => ({
  default: { find: vi.fn() },
}))

function selectLeanQuery<T>(value: T) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(value),
    }),
  }
}

describe('shift summaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('counts confirmed, pending, rejected and disputed consumptions', () => {
    const summary = buildShiftSummary([
      { outing: 'outing-1', amount: 1000, status: ConsumptionStatus.CONFIRMED },
      { outing: 'outing-2', amount: 2000, status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION },
      { outing: 'outing-3', amount: 3000, status: ConsumptionStatus.REJECTED },
      { outing: 'outing-4', amount: 4000, status: ConsumptionStatus.DISPUTED },
    ] as any, 7, new Date('2026-08-18T22:00:00.000Z'))

    expect(summary).toEqual(expect.objectContaining({
      status: ShiftSummaryStatus.PENDING,
      totalConsumptions: 4,
      confirmedConsumptions: 1,
      pendingConsumptions: 1,
      rejectedConsumptions: 1,
      disputedConsumptions: 1,
      totalAmount: 1000,
      pointsAwarded: 7,
      redemptionCount: 0,
      redemptionsAvailable: false,
    }))
  })

  it('persists a summary once and includes points linked to the shift outings', async () => {
    const shift = {
      _id: { toString: () => 'shift-1' },
      user: 'cashier-1',
      bar: 'bar-1',
      startedAt: new Date('2026-08-18T20:00:00.000Z'),
      endedAt: new Date('2026-08-19T04:00:00.000Z'),
      summary: undefined,
    }
    const persistedSummary = {
      status: ShiftSummaryStatus.PENDING,
      totalConsumptions: 1,
      confirmedConsumptions: 1,
      pendingConsumptions: 0,
      rejectedConsumptions: 0,
      disputedConsumptions: 0,
      totalAmount: 5000,
      pointsAwarded: 3,
      redemptionCount: 0,
      redemptionsAvailable: false,
      generatedAt: new Date(),
    }

    vi.mocked(Shift.findById).mockResolvedValue(shift as any)
    vi.mocked(Consumption.find).mockReturnValue(selectLeanQuery([
      { outing: 'outing-1', amount: 5000, status: ConsumptionStatus.CONFIRMED },
    ]) as any)
    vi.mocked(PointsTransaction.find).mockReturnValue(selectLeanQuery([{ amount: 3 }]) as any)
    vi.mocked(Shift.findOneAndUpdate).mockResolvedValue({ summary: persistedSummary } as any)

    const result = await generateShiftSummary('shift-1')

    expect(PointsTransaction.find).toHaveBeenCalledWith({ outing: { $in: ['outing-1'] } })
    expect(Shift.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: shift._id, summary: { $exists: false } }),
      expect.objectContaining({ $set: { summary: expect.any(Object) } }),
      { new: true },
    )
    expect(result).toBe(persistedSummary)
  })

  it('returns an already persisted concurrent result when this call loses the atomic update', async () => {
    const shift = {
      _id: { toString: () => 'shift-1' },
      user: 'cashier-1',
      bar: 'bar-1',
      startedAt: new Date('2026-08-18T20:00:00.000Z'),
      endedAt: new Date('2026-08-19T04:00:00.000Z'),
    }
    const existingSummary = { status: ShiftSummaryStatus.PENDING }

    vi.mocked(Shift.findById)
      .mockResolvedValueOnce(shift as any)
      .mockReturnValueOnce(selectLeanQuery({ summary: existingSummary }) as any)
    vi.mocked(Consumption.find).mockReturnValue(selectLeanQuery([]) as any)
    vi.mocked(Shift.findOneAndUpdate).mockResolvedValue(null)

    await expect(generateShiftSummary('shift-1')).resolves.toBe(existingSummary)
  })

  it('rejects open shifts', async () => {
    vi.mocked(Shift.findById).mockResolvedValue({ _id: 'shift-1', endedAt: undefined } as any)

    await expect(generateShiftSummary('shift-1')).rejects.toBeInstanceOf(ShiftSummaryError)
  })
})
