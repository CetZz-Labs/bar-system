import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GroupBalanceController } from '../GroupBalanceController'
import Group from '../../models/Group'
import PointsTransaction from '../../models/PointsTransaction'
import Bar from '../../models/Bar'
import { Types } from 'mongoose'
import { MembershipRole } from '../../models/User'

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
