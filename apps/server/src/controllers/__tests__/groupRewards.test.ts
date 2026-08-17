import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { GroupRewardsController } from '../../controllers/GroupRewardsController'
import Reward, { RewardStatus } from '../../models/Reward'
import Group from '../../models/Group'
import Outing, { OutingStatus } from '../../models/Outing'
import PointsTransaction from '../../models/PointsTransaction'
import Redemption, { RedemptionStatus } from '../../models/Redemption'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

// LB-72. Mockea también PointsTransaction/Redemption porque
// GroupRewardsController.getAvailable importa (sin modificar)
// getAvailablePointsForBar de utils/redemptionAvailability.ts (LB-68), que
// consulta esos dos modelos directamente.

vi.mock('../../models/Reward', () => ({
  default: {
    find: vi.fn(),
  },
  RewardStatus: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
  },
}))

vi.mock('../../models/Group', () => ({
  default: {
    findById: vi.fn(),
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

vi.mock('../../models/PointsTransaction', () => ({
  default: {
    find: vi.fn(),
  },
}))

vi.mock('../../models/Redemption', () => ({
  default: {
    find: vi.fn(),
  },
  RedemptionStatus: {
    HELD: 'HELD',
    VALIDATED: 'VALIDATED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
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

function buildSelectQuery(data: unknown) {
  const query: Record<string, unknown> = {}
  query.select = vi.fn().mockReturnValue(query)
  // getAvailablePointsForBar/getAvailableStock call `.lean()` directly on
  // the query returned by `.select(...)`, without an intervening `.session()`
  // in these tests (no session is passed).
  query.lean = vi.fn().mockResolvedValue(data)
  return query
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
  vi.mocked(Reward.find).mockReset()
  vi.mocked(Group.findById).mockReset()
  vi.mocked(Outing.findOne).mockReset()
  vi.mocked(PointsTransaction.find).mockReset()
  vi.mocked(Redemption.find).mockReset()
})

describe('GroupRewardsController.getAvailable', () => {
  it('returns 404 when the group does not exist', async () => {
    const userId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    vi.mocked(Group.findById).mockReturnValue(buildSelectLeanQuery(null) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { groupId: groupId.toString() } })
    const res = buildMockResponse()

    await GroupRewardsController.getAvailable(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 403 when the user is not a member of the group', async () => {
    const userId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    vi.mocked(Group.findById).mockReturnValue(
      buildSelectLeanQuery({ memberships: [{ user: new Types.ObjectId() }] }) as any
    )

    const req = buildMockRequest({ user: { _id: userId } as any, params: { groupId: groupId.toString() } })
    const res = buildMockResponse()

    await GroupRewardsController.getAvailable(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 200 with an empty rewards list and balance 0 when there is no ACTIVE outing', async () => {
    const userId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    vi.mocked(Group.findById).mockReturnValue(
      buildSelectLeanQuery({ memberships: [{ user: userId }] }) as any
    )
    vi.mocked(Outing.findOne).mockReturnValue(buildSelectLeanQuery(null) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { groupId: groupId.toString() } })
    const res = buildMockResponse()

    await GroupRewardsController.getAvailable(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ rewards: [], balance: 0 })
    expect(Reward.find).not.toHaveBeenCalled()
  })

  it('ignores req.query.barId and resolves the bar from the ACTIVE outing', async () => {
    const userId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const clientProvidedBarId = new Types.ObjectId().toString()
    const reward = buildMockReward({ bar: barId })

    vi.mocked(Group.findById).mockReturnValue(
      buildSelectLeanQuery({ memberships: [{ user: userId }] }) as any
    )
    vi.mocked(Outing.findOne).mockReturnValue(buildSelectLeanQuery({ bar: barId }) as any)
    vi.mocked(Reward.find).mockReturnValue(buildSortQuery([reward]) as any)
    vi.mocked(PointsTransaction.find).mockReturnValue(buildSelectQuery([{ amount: 50 }]) as any)
    vi.mocked(Redemption.find).mockReturnValue(buildSelectQuery([]) as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { groupId: groupId.toString() },
      query: { barId: clientProvidedBarId },
    })
    const res = buildMockResponse()

    await GroupRewardsController.getAvailable(req, res)

    expect(Outing.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ group: groupId.toString(), status: OutingStatus.ACTIVE })
    )
    expect(Reward.find).toHaveBeenCalledWith(
      expect.objectContaining({
        bar: barId,
        status: RewardStatus.ACTIVE,
        deletedAt: null,
        $or: [{ unlimitedStock: true }, { stock: { $gt: 0 } }],
      })
    )
    // getAvailablePointsForBar debe consultar con el barId de la Outing
    // ACTIVE, no con el que vino en el query param del cliente.
    expect(PointsTransaction.find).toHaveBeenCalledWith(
      expect.objectContaining({ group: groupId.toString(), bar: barId.toString() })
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      rewards: [expect.objectContaining({ id: reward._id.toString(), pointsRequired: 100 })],
      balance: 50,
    })
  })

  it('subtracts pending HELD redemptions from the earned points when computing balance', async () => {
    const userId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(Group.findById).mockReturnValue(
      buildSelectLeanQuery({ memberships: [{ user: userId }] }) as any
    )
    vi.mocked(Outing.findOne).mockReturnValue(buildSelectLeanQuery({ bar: barId }) as any)
    vi.mocked(Reward.find).mockReturnValue(buildSortQuery([]) as any)
    vi.mocked(PointsTransaction.find).mockReturnValue(buildSelectQuery([{ amount: 100 }]) as any)
    vi.mocked(Redemption.find).mockReturnValue(buildSelectQuery([{ pointsRequiredSnapshot: 40 }]) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { groupId: groupId.toString() } })
    const res = buildMockResponse()

    await GroupRewardsController.getAvailable(req, res)

    expect(res.json).toHaveBeenCalledWith({ rewards: [], balance: 60 })
  })
})
