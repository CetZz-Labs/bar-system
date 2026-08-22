import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import Outing, { OutingStatus } from '../../models/Outing'
import Consumption, { ConsumptionStatus } from '../../models/Consumption'
import PointsTransaction, { PointsTransactionType } from '../../models/PointsTransaction'
import Redemption from '../../models/Redemption'
import BarUser, { BarUserRole } from '../../models/BarUser'
import User from '../../models/User'
import {
  exceedsMaxRange,
  getActivityTable,
  getCashierTable,
  getDashboardStatCards,
  getDisputesPanel,
  resolveDashboardPeriod,
} from '../barDashboard'

vi.mock('../../models/Outing', async () => {
  const actual = await vi.importActual<typeof import('../../models/Outing')>('../../models/Outing')
  return { ...actual, default: { aggregate: vi.fn(), collection: { name: 'outings' } } }
})

vi.mock('../../models/Consumption', async () => {
  const actual = await vi.importActual<typeof import('../../models/Consumption')>('../../models/Consumption')
  return { ...actual, default: { aggregate: vi.fn(), collection: { name: 'consumptions' } } }
})

vi.mock('../../models/PointsTransaction', async () => {
  const actual = await vi.importActual<typeof import('../../models/PointsTransaction')>('../../models/PointsTransaction')
  return { ...actual, default: { aggregate: vi.fn(), collection: { name: 'pointstransactions' } } }
})

vi.mock('../../models/Redemption', async () => {
  const actual = await vi.importActual<typeof import('../../models/Redemption')>('../../models/Redemption')
  return { ...actual, default: { aggregate: vi.fn(), collection: { name: 'redemptions' } } }
})

vi.mock('../../models/BarUser', async () => {
  const actual = await vi.importActual<typeof import('../../models/BarUser')>('../../models/BarUser')
  return { ...actual, default: { find: vi.fn() } }
})

vi.mock('../../models/Group', async () => {
  const actual = await vi.importActual<typeof import('../../models/Group')>('../../models/Group')
  return { ...actual, default: { collection: { name: 'groups' } } }
})

vi.mock('../../models/User', async () => {
  const actual = await vi.importActual<typeof import('../../models/User')>('../../models/User')
  return { ...actual, default: { find: vi.fn(), collection: { name: 'users' } } }
})

function leanQuery<T>(data: T) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(data) }) }
}

const barId = new Types.ObjectId().toString()

describe('resolveDashboardPeriod', () => {
  it('resolves "today" to the bar-day range containing `now`', () => {
    const now = new Date('2026-08-21T15:00:00Z')
    const range = resolveDashboardPeriod('today', undefined, undefined, '06:00', now)

    expect(range.to.getHours()).toBe(6)
    expect(range.to.getMinutes()).toBe(0)
    expect(range.to.getTime()).toBeGreaterThan(now.getTime())
    expect(range.from.getTime()).toBeLessThan(now.getTime())
  })

  it('resolves "week" to a 7-day window ending at the bar-day close of `now`', () => {
    const now = new Date('2026-08-21T15:00:00Z')
    const range = resolveDashboardPeriod('week', undefined, undefined, '06:00', now)
    const todayRange = resolveDashboardPeriod('today', undefined, undefined, '06:00', now)

    expect(range.to.getTime()).toBe(todayRange.to.getTime())
    expect(todayRange.to.getTime() - range.from.getTime()).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('resolves "month" to a 30-day window ending at the bar-day close of `now`', () => {
    const now = new Date('2026-08-21T15:00:00Z')
    const range = resolveDashboardPeriod('month', undefined, undefined, '06:00', now)
    const todayRange = resolveDashboardPeriod('today', undefined, undefined, '06:00', now)

    expect(range.to.getTime()).toBe(todayRange.to.getTime())
    expect(todayRange.to.getTime() - range.from.getTime()).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('resolves "custom" to the exact from/to query values, without bar-day adjustment', () => {
    const range = resolveDashboardPeriod('custom', '2026-01-01T00:00:00.000Z', '2026-01-31T00:00:00.000Z', '06:00')

    expect(range.from.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(range.to.toISOString()).toBe('2026-01-31T00:00:00.000Z')
  })
})

describe('exceedsMaxRange', () => {
  it('returns false for a range within 3 months', () => {
    expect(exceedsMaxRange(new Date('2026-01-01'), new Date('2026-03-15'))).toBe(false)
  })

  it('returns false for a range exactly 3 months long', () => {
    expect(exceedsMaxRange(new Date('2026-01-01'), new Date('2026-04-01'))).toBe(false)
  })

  it('returns true for a range longer than 3 months', () => {
    expect(exceedsMaxRange(new Date('2026-01-01'), new Date('2026-04-02'))).toBe(true)
  })
})

describe('getDashboardStatCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns zeroed defaults when there is no data in the period', async () => {
    vi.mocked(Outing.aggregate).mockResolvedValue([])
    vi.mocked(Consumption.aggregate).mockResolvedValue([])
    vi.mocked(PointsTransaction.aggregate).mockResolvedValue([])
    vi.mocked(Redemption.aggregate).mockResolvedValue([])

    const result = await getDashboardStatCards(barId, { from: new Date('2026-01-01'), to: new Date('2026-01-02') })

    expect(result).toEqual({
      groupsCount: 0,
      consumptionTotalArs: 0,
      pointsAwarded: { consumption: 0, attendance: 0, total: 0 },
      redemptions: { count: 0, arsEquivalent: 0 },
    })
  })

  it('combines the 4 aggregation results into the stat cards DTO', async () => {
    vi.mocked(Outing.aggregate).mockResolvedValue([{ count: 5 }])
    vi.mocked(Consumption.aggregate).mockResolvedValue([{ _id: null, total: 150000 }])
    vi.mocked(PointsTransaction.aggregate).mockResolvedValue([
      { _id: PointsTransactionType.CONSUMPTION, total: 120 },
      { _id: PointsTransactionType.ATTENDANCE, total: 30 },
    ])
    vi.mocked(Redemption.aggregate).mockResolvedValue([{ _id: null, count: 3, pointsTotal: 40 }])

    const result = await getDashboardStatCards(barId, { from: new Date('2026-01-01'), to: new Date('2026-01-02') })

    expect(result).toEqual({
      groupsCount: 5,
      consumptionTotalArs: 150000,
      pointsAwarded: { consumption: 120, attendance: 30, total: 150 },
      redemptions: { count: 3, arsEquivalent: 40000 },
    })
  })

  it('excludes CANCELLED outings from the match stage', async () => {
    vi.mocked(Outing.aggregate).mockResolvedValue([])
    vi.mocked(Consumption.aggregate).mockResolvedValue([])
    vi.mocked(PointsTransaction.aggregate).mockResolvedValue([])
    vi.mocked(Redemption.aggregate).mockResolvedValue([])

    await getDashboardStatCards(barId, { from: new Date('2026-01-01'), to: new Date('2026-01-02') })

    const pipeline = vi.mocked(Outing.aggregate).mock.calls[0][0] as Record<string, unknown>[]
    expect(pipeline[0]).toEqual({
      $match: { bar: expect.any(Types.ObjectId), status: { $ne: OutingStatus.CANCELLED } },
    })
  })
})

describe('getActivityTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps the aggregate rows to ActivityRow DTOs', async () => {
    const outingId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const cashierId = new Types.ObjectId()

    vi.mocked(Outing.aggregate).mockResolvedValue([
      {
        _id: outingId,
        groupId,
        groupName: 'Los Pibes',
        checkedInAt: new Date('2026-08-21T02:00:00Z'),
        consumptionArs: 5000,
        pointsAwarded: 5,
        cashierId,
        cashierName: 'Juan Cajero',
        outingStatus: OutingStatus.ACTIVE,
        estado: 'en_curso',
      },
    ])

    const rows = await getActivityTable(barId, { from: new Date('2026-01-01'), to: new Date('2026-01-02') })

    expect(rows).toEqual([
      {
        outingId: outingId.toString(),
        groupId: groupId.toString(),
        groupName: 'Los Pibes',
        checkedInAt: new Date('2026-08-21T02:00:00Z'),
        consumptionArs: 5000,
        pointsAwarded: 5,
        cashierId: cashierId.toString(),
        cashierName: 'Juan Cajero',
        status: 'en_curso',
      },
    ])
  })

  it('adds a $match stage on checkedInBy when filters.cashierId is provided', async () => {
    vi.mocked(Outing.aggregate).mockResolvedValue([])
    const cashierId = new Types.ObjectId().toString()

    await getActivityTable(barId, { from: new Date('2026-01-01'), to: new Date('2026-01-02') }, { cashierId })

    const pipeline = vi.mocked(Outing.aggregate).mock.calls[0][0] as Record<string, unknown>[]
    expect(pipeline).toContainEqual({ $match: { checkedInBy: expect.any(Types.ObjectId) } })
  })

  it('adds a $match stage on the derived "estado" when filters.status is provided', async () => {
    vi.mocked(Outing.aggregate).mockResolvedValue([])

    await getActivityTable(barId, { from: new Date('2026-01-01'), to: new Date('2026-01-02') }, { status: 'disputa' })

    const pipeline = vi.mocked(Outing.aggregate).mock.calls[0][0] as Record<string, unknown>[]
    expect(pipeline).toContainEqual({ $match: { estado: 'disputa' } })
  })
})

describe('getDisputesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps the aggregate rows to DisputeRow DTOs', async () => {
    const consumptionId = new Types.ObjectId()
    const outingId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const cashierId = new Types.ObjectId()

    vi.mocked(Consumption.aggregate).mockResolvedValue([
      {
        _id: consumptionId,
        outingId,
        groupId,
        groupName: 'Los Pibes',
        amount: 8000,
        cashierId,
        cashierName: 'Juan Cajero',
        createdAt: new Date('2026-08-21T03:00:00Z'),
        rejectCount: 4,
      },
    ])

    const rows = await getDisputesPanel(barId, { from: new Date('2026-01-01'), to: new Date('2026-01-02') })

    expect(rows).toEqual([
      {
        consumptionId: consumptionId.toString(),
        outingId: outingId.toString(),
        groupId: groupId.toString(),
        groupName: 'Los Pibes',
        amount: 8000,
        cashierId: cashierId.toString(),
        cashierName: 'Juan Cajero',
        createdAt: new Date('2026-08-21T03:00:00Z'),
        rejectCount: 4,
      },
    ])

    const pipeline = vi.mocked(Consumption.aggregate).mock.calls[0][0] as Record<string, unknown>[]
    expect(pipeline[0]).toEqual({
      $match: {
        bar: expect.any(Types.ObjectId),
        status: ConsumptionStatus.DISPUTED,
        createdAt: { $gte: expect.any(Date), $lte: expect.any(Date) },
      },
    })
  })
})

describe('getCashierTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty rows/totals without querying aggregations when the bar has no cashiers', async () => {
    vi.mocked(BarUser.find).mockReturnValue(leanQuery([]) as any)

    const result = await getCashierTable(barId, { from: new Date('2026-01-01'), to: new Date('2026-01-02') })

    expect(result).toEqual({
      rows: [],
      totals: { checkIns: 0, consumptionArs: 0, pointsAwarded: 0, redemptionsCount: 0, redemptionsArs: 0, net: 0 },
    })
    expect(Outing.aggregate).not.toHaveBeenCalled()
  })

  it('assembles rows with the net (consumo - canjes ARS) and a totals row summing every column', async () => {
    const cashier1 = new Types.ObjectId()
    const cashier2 = new Types.ObjectId()

    vi.mocked(BarUser.find).mockReturnValue(leanQuery([{ user: cashier1 }, { user: cashier2 }]) as any)
    vi.mocked(User.find).mockReturnValue(
      leanQuery([
        { _id: cashier1, name: 'Juan', lastName: 'Cajero' },
        { _id: cashier2, name: 'Ana', lastName: 'Barman' },
      ]) as any
    )

    vi.mocked(Outing.aggregate).mockResolvedValue([{ _id: cashier1, count: 4 }])
    vi.mocked(Consumption.aggregate).mockResolvedValue([
      { _id: cashier1, total: 20000 },
      { _id: cashier2, total: 5000 },
    ])
    vi.mocked(PointsTransaction.aggregate).mockResolvedValue([{ _id: cashier1, total: 15 }])
    vi.mocked(Redemption.aggregate).mockResolvedValue([{ _id: cashier1, count: 2, pointsTotal: 3 }])

    const result = await getCashierTable(barId, { from: new Date('2026-01-01'), to: new Date('2026-01-02') })

    expect(result.rows).toEqual([
      {
        cashierId: cashier1.toString(),
        cashierName: 'Juan Cajero',
        checkIns: 4,
        consumptionArs: 20000,
        pointsAwarded: 15,
        redemptionsCount: 2,
        redemptionsArs: 3000,
        net: 17000,
      },
      {
        cashierId: cashier2.toString(),
        cashierName: 'Ana Barman',
        checkIns: 0,
        consumptionArs: 5000,
        pointsAwarded: 0,
        redemptionsCount: 0,
        redemptionsArs: 0,
        net: 5000,
      },
    ])
    expect(result.totals).toEqual({
      checkIns: 4,
      consumptionArs: 25000,
      pointsAwarded: 15,
      redemptionsCount: 2,
      redemptionsArs: 3000,
      net: 22000,
    })
  })

  it('scopes the cashier membership query to a single cashier when filters.cashierId is provided', async () => {
    const cashierId = new Types.ObjectId().toString()
    vi.mocked(BarUser.find).mockReturnValue(leanQuery([]) as any)

    await getCashierTable(barId, { from: new Date('2026-01-01'), to: new Date('2026-01-02') }, { cashierId })

    expect(BarUser.find).toHaveBeenCalledWith(
      expect.objectContaining({
        role: BarUserRole.CASHIER,
        isActive: true,
        user: expect.any(Types.ObjectId),
      })
    )
  })
})
