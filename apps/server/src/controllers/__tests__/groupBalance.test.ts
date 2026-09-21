import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GroupBalanceController } from '../GroupBalanceController'
import Group from '../../models/Group'
import PointsTransaction, { PointsTransactionType } from '../../models/PointsTransaction'
import Bar from '../../models/Bar'
import Consumption from '../../models/Consumption'
import User, { MembershipRole } from '../../models/User'
import { Types } from 'mongoose'

vi.mock('../../models/Group')
vi.mock('../../models/PointsTransaction')
vi.mock('../../models/Bar')
vi.mock('../../models/Consumption')
vi.mock('../../models/User', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../models/User')>()
  return {
    ...actual,
    default: { find: vi.fn() },
  }
})

function mockRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('GroupBalanceController.getBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns total and byBar for a member', async () => {
    const groupId = new Types.ObjectId()
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(Group.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          pointsBalance: 42,
          memberships: [{ user: userId, role: MembershipRole.MEMBER }],
        }),
      }),
    } as any)

    vi.mocked(PointsTransaction.aggregate).mockResolvedValue([
      { _id: barId, points: 42, lastActivityAt: new Date('2026-08-17T12:00:00Z') },
    ] as any)

    vi.mocked(Bar.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: barId, name: 'El Bar' }]),
      }),
    } as any)

    const req: any = { user: { _id: userId }, params: { groupId: groupId.toString() } }
    const res = mockRes()
    await GroupBalanceController.getBalance(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 42,
        byBar: [
          expect.objectContaining({
            barId: barId.toString(),
            barName: 'El Bar',
            points: 42,
          }),
        ],
      })
    )
  })

  it('returns 403 for non-members', async () => {
    const groupId = new Types.ObjectId()
    vi.mocked(Group.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          pointsBalance: 0,
          memberships: [{ user: new Types.ObjectId(), role: MembershipRole.MEMBER }],
        }),
      }),
    } as any)

    const req: any = {
      user: { _id: new Types.ObjectId() },
      params: { groupId: groupId.toString() },
    }
    const res = mockRes()
    await GroupBalanceController.getBalance(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe('GroupBalanceController.getHistory (LB-104 mapping)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps CONSUMPTION→consumo, ATTENDANCE→asistencia, REDEMPTION→canje', async () => {
    const groupId = new Types.ObjectId()
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const consumptionId = new Types.ObjectId()
    const cashierId = new Types.ObjectId()

    const txAttendanceId = new Types.ObjectId()
    const txConsumptionId = new Types.ObjectId()
    const txRedemptionId = new Types.ObjectId()
    const outingId = new Types.ObjectId()
    const createdAt = new Date('2026-09-02T12:00:00Z')

    vi.mocked(Group.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          memberships: [{ user: userId, role: MembershipRole.MEMBER }],
        }),
      }),
    } as any)

    vi.mocked(PointsTransaction.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              _id: txRedemptionId,
              bar: barId,
              outing: outingId,
              type: PointsTransactionType.REDEMPTION,
              amount: -80,
              label: 'Canje cerveza',
              createdAt,
            },
            {
              _id: txAttendanceId,
              bar: barId,
              outing: outingId,
              type: PointsTransactionType.ATTENDANCE,
              amount: 10,
              label: 'Asistencia',
              createdAt,
            },
            {
              _id: txConsumptionId,
              bar: barId,
              outing: outingId,
              type: PointsTransactionType.CONSUMPTION,
              amount: 50,
              label: 'Consumo',
              consumption: consumptionId,
              createdAt,
            },
          ]),
        }),
      }),
    } as any)

    vi.mocked(Bar.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: barId, name: 'El Bar' }]),
      }),
    } as any)

    vi.mocked(Consumption.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: consumptionId, amount: 5000, cashier: cashierId },
        ]),
      }),
    } as any)

    vi.mocked(User.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: cashierId, name: 'Cajero', lastName: 'Uno' },
        ]),
      }),
    } as any)

    const req: any = {
      user: { _id: userId },
      params: { groupId: groupId.toString() },
      query: {},
    }
    const res = mockRes()
    await GroupBalanceController.getHistory(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const payload = res.json.mock.calls[0][0]
    expect(payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: txRedemptionId.toString(),
          outingId: outingId.toString(),
          type: 'canje',
          points: -80,
        }),
        expect.objectContaining({
          id: txAttendanceId.toString(),
          outingId: outingId.toString(),
          type: 'asistencia',
          points: 10,
        }),
        expect.objectContaining({
          id: txConsumptionId.toString(),
          outingId: outingId.toString(),
          type: 'consumo',
          points: 50,
          metadata: expect.objectContaining({
            amount: 5000,
            cashierName: 'Cajero Uno',
          }),
        }),
      ])
    )
  })

  it('filters by outingId when provided and includes outingId in each item (LB-111)', async () => {
    const groupId = new Types.ObjectId()
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const outingId = new Types.ObjectId()
    const txId = new Types.ObjectId()
    const createdAt = new Date('2026-09-10T12:00:00Z')

    vi.mocked(Group.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          memberships: [{ user: userId, role: MembershipRole.MEMBER }],
        }),
      }),
    } as any)

    const findMock = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              _id: txId,
              bar: barId,
              outing: outingId,
              type: PointsTransactionType.ATTENDANCE,
              amount: 10,
              label: 'Asistencia',
              createdAt,
            },
          ]),
        }),
      }),
    })
    vi.mocked(PointsTransaction.find).mockImplementation(findMock)

    vi.mocked(Bar.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: barId, name: 'El Bar' }]),
      }),
    } as any)

    vi.mocked(Consumption.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    } as any)

    vi.mocked(User.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    } as any)

    const req: any = {
      user: { _id: userId },
      params: { groupId: groupId.toString() },
      query: { outingId: outingId.toString() },
    }
    const res = mockRes()
    await GroupBalanceController.getHistory(req, res)

    expect(res.status).toHaveBeenCalledWith(200)

    const filterArg = findMock.mock.calls[0][0]
    expect(filterArg.outing?.toString()).toBe(outingId.toString())

    const payload = res.json.mock.calls[0][0]
    expect(payload.items[0]).toEqual(
      expect.objectContaining({ id: txId.toString(), outingId: outingId.toString() })
    )
  })
})
