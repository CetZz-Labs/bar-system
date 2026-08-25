import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { BarController } from '../../controllers/BarController'
import { RewardController } from '../../controllers/RewardController'
import Bar, { BarStatus } from '../../models/Bar'
import User from '../../models/User'
import Outing, { OutingStatus } from '../../models/Outing'
import Reward, { RewardStatus } from '../../models/Reward'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

// LB-76: ficha pública de bar + recompensas activas por barId directo,
// ambas sin `verifyBarAccess` (a diferencia de getBarProfile/listRewards).

vi.mock('../../models/Bar', () => ({
  default: {
    findById: vi.fn(),
  },
  BarStatus: {
    PENDING: 'pending',
    ACTIVE: 'active',
    REJECTED: 'rejected',
  },
}))

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
  MembershipRole: {
    ADMIN: 'ADMIN',
    MEMBER: 'MEMBER',
    LEADER: 'LEADER',
    CO_LEADER: 'CO_LEADER',
  },
}))

vi.mock('../../models/Outing', () => ({
  default: {
    findOne: vi.fn(),
  },
  OutingStatus: {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    CANCELLED: 'CANCELLED',
    COMPLETED: 'COMPLETED',
    NO_SHOW: 'NO_SHOW',
  },
}))

vi.mock('../../models/Reward', () => ({
  default: {
    find: vi.fn(),
  },
  RewardStatus: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
  },
}))

function buildSelectLeanQuery(data: unknown) {
  const query: Record<string, unknown> = {}
  query.select = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(data)
  return query
}

function buildSortQuery(data: unknown) {
  return { sort: vi.fn().mockResolvedValue(data) }
}

const zeroAttendancePoints = {
  monday: 0,
  tuesday: 0,
  wednesday: 0,
  thursday: 0,
  friday: 0,
  saturday: 0,
  sunday: 0,
}

function buildMockBar(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: 'El Bar de Juan',
    address: {
      street: 'Av. Siempre Viva',
      number: '123',
      neighborhood: 'Centro',
      city: 'Buenos Aires',
    },
    status: BarStatus.ACTIVE,
    closingTime: '06:00',
    attendancePointsByDay: { ...zeroAttendancePoints, friday: 100 },
    ...overrides,
  }
}

function buildMockReward(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    bar: new Types.ObjectId(),
    name: 'Chopp gratis',
    description: undefined,
    pointsRequired: 100,
    unlimitedStock: false,
    stock: 10,
    status: RewardStatus.ACTIVE,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(Bar.findById).mockReset()
  vi.mocked(User.findById).mockReset()
  vi.mocked(Outing.findOne).mockReset()
  vi.mocked(Reward.find).mockReset()
})

describe('BarController.getPublicBarDetail', () => {
  it('returns 404 when the bar does not exist', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(Bar.findById).mockResolvedValue(null)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { id: barId.toString() } })
    const res = buildMockResponse()

    await BarController.getPublicBarDetail(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 404 when the bar exists but is not ACTIVE', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(Bar.findById).mockResolvedValue(buildMockBar({ _id: barId, status: BarStatus.PENDING }) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { id: barId.toString() } })
    const res = buildMockResponse()

    await BarController.getPublicBarDetail(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 200 with the public fields for any authenticated client, without checking BarUser', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockBar = buildMockBar({ _id: barId })

    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)
    vi.mocked(User.findById).mockReturnValue(buildSelectLeanQuery({ memberships: [] }) as any)
    vi.mocked(Outing.findOne).mockReturnValue(buildSelectLeanQuery(null) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { id: barId.toString() } })
    const res = buildMockResponse()

    await BarController.getPublicBarDetail(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: barId,
        name: mockBar.name,
        address: mockBar.address,
        closingTime: mockBar.closingTime,
        attendancePointsByDay: mockBar.attendancePointsByDay,
        hasActiveCheckIn: false,
      })
    )
  })

  it('sets hasActiveCheckIn=true when an ACTIVE outing exists for one of the user groups in this bar', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const mockBar = buildMockBar({ _id: barId })

    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)
    vi.mocked(User.findById).mockReturnValue(buildSelectLeanQuery({ memberships: [{ group: groupId }] }) as any)
    vi.mocked(Outing.findOne).mockReturnValue(buildSelectLeanQuery({ _id: new Types.ObjectId() }) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { id: barId.toString() } })
    const res = buildMockResponse()

    await BarController.getPublicBarDetail(req, res)

    expect(Outing.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        group: { $in: [groupId] },
        bar: barId,
        status: OutingStatus.ACTIVE,
      })
    )
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ hasActiveCheckIn: true }))
  })

  it('does not leak which group has the check-in (only the boolean)', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockBar = buildMockBar({ _id: barId })

    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)
    vi.mocked(User.findById).mockReturnValue(buildSelectLeanQuery({ memberships: [{ group: new Types.ObjectId() }] }) as any)
    vi.mocked(Outing.findOne).mockReturnValue(buildSelectLeanQuery({ _id: new Types.ObjectId() }) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { id: barId.toString() } })
    const res = buildMockResponse()

    await BarController.getPublicBarDetail(req, res)

    const [payload] = vi.mocked(res.json).mock.calls[0]
    expect(payload).not.toHaveProperty('group')
    expect(payload).not.toHaveProperty('activeOutingId')
  })
})

describe('RewardController.getAvailableRewardsForBar', () => {
  it('returns 404 when the bar does not exist', async () => {
    const barId = new Types.ObjectId()

    vi.mocked(Bar.findById).mockReturnValue(buildSelectLeanQuery(null) as any)

    const req = buildMockRequest({ params: { id: barId.toString() } })
    const res = buildMockResponse()

    await RewardController.getAvailableRewardsForBar(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(Reward.find).not.toHaveBeenCalled()
  })

  it('returns 404 when the bar is not ACTIVE', async () => {
    const barId = new Types.ObjectId()

    vi.mocked(Bar.findById).mockReturnValue(buildSelectLeanQuery({ status: BarStatus.PENDING }) as any)

    const req = buildMockRequest({ params: { id: barId.toString() } })
    const res = buildMockResponse()

    await RewardController.getAvailableRewardsForBar(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(Reward.find).not.toHaveBeenCalled()
  })

  it('returns 200 with active rewards resolved directly from the :id param, without requiring BarUser', async () => {
    const barId = new Types.ObjectId()
    const reward = buildMockReward({ bar: barId })

    vi.mocked(Bar.findById).mockReturnValue(buildSelectLeanQuery({ status: BarStatus.ACTIVE }) as any)
    vi.mocked(Reward.find).mockReturnValue(buildSortQuery([reward]) as any)

    const req = buildMockRequest({ params: { id: barId.toString() } })
    const res = buildMockResponse()

    await RewardController.getAvailableRewardsForBar(req, res)

    expect(Reward.find).toHaveBeenCalledWith(
      expect.objectContaining({
        bar: barId.toString(),
        status: RewardStatus.ACTIVE,
        deletedAt: null,
        $or: [{ unlimitedStock: true }, { stock: { $gt: 0 } }],
      })
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ id: reward._id.toString() })])
  })
})
