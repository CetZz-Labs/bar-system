import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { RewardController } from '../../controllers/RewardController'
import Reward, { RewardStatus } from '../../models/Reward'
import BarUser, { BarUserRole } from '../../models/BarUser'
import Group from '../../models/Group'
import Outing, { OutingStatus } from '../../models/Outing'
import { writeAuditLog } from '../../utils/auditLogService'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

vi.mock('../../models/Reward', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
  RewardStatus: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
  },
}))

vi.mock('../../models/BarUser', () => ({
  default: {
    findOne: vi.fn(),
  },
  BarUserRole: {
    OWNER: 'OWNER',
    CASHIER: 'CASHIER',
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

vi.mock('../../utils/auditLogService', () => ({
  writeAuditLog: vi.fn(),
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
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(BarUser.findOne).mockReset()
  vi.mocked(Reward.find).mockReset()
  vi.mocked(Reward.findOne).mockReset()
  vi.mocked(Reward.create).mockReset()
  vi.mocked(Group.findById).mockReset()
  vi.mocked(Outing.findOne).mockReset()
  vi.mocked(writeAuditLog).mockReset()
})

describe('RewardController.listRewards', () => {
  it('returns 200 with mapped rewards for any BarUser (OWNER or CASHIER)', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const reward = buildMockReward({ bar: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)
    vi.mocked(Reward.find).mockReturnValue(buildSortQuery([reward]) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { barId: barId.toString() } })
    const res = buildMockResponse()

    await RewardController.listRewards(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: reward._id.toString(), name: 'Chopp gratis' }),
    ])
  })

  it('returns 403 when the user has no membership in the bar', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { barId: barId.toString() } })
    const res = buildMockResponse()

    await RewardController.listRewards(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe('RewardController.createReward', () => {
  it('returns 201 when the OWNER creates a valid reward', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const created = buildMockReward({ bar: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Reward.create).mockResolvedValue(created as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      body: { name: 'Chopp gratis', pointsRequired: 100, stock: 10 },
    })
    const res = buildMockResponse()

    await RewardController.createReward(req, res)

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'reward.created', actorType: 'OWNER', entityId: created._id })
    )
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'Chopp gratis' }))
  })

  it('returns 403 when the requester is a CASHIER, not an OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      body: { name: 'Chopp gratis', pointsRequired: 100, stock: 10 },
    })
    const res = buildMockResponse()

    await RewardController.createReward(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(Reward.create).not.toHaveBeenCalled()
  })

  it('returns 403 when the user has no membership in the bar', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      body: { name: 'Chopp gratis', pointsRequired: 100, stock: 10 },
    })
    const res = buildMockResponse()

    await RewardController.createReward(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 409 when a reward with the same name already exists in the bar (E11000)', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Reward.create).mockRejectedValue({ code: 11000 })

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      body: { name: 'Chopp gratis', pointsRequired: 100, stock: 10 },
    })
    const res = buildMockResponse()

    await RewardController.createReward(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Ya existe una recompensa') })
    )
  })

  it('creates an unlimited-stock reward without a stock field', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const created = buildMockReward({ bar: barId, unlimitedStock: true, stock: undefined })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Reward.create).mockResolvedValue(created as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      body: { name: 'Remera', pointsRequired: 500, unlimitedStock: true },
    })
    const res = buildMockResponse()

    await RewardController.createReward(req, res)

    expect(Reward.create).toHaveBeenCalledWith(
      expect.objectContaining({ unlimitedStock: true, stock: undefined })
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })
})

describe('RewardController.updateReward', () => {
  it('returns 200 and updates fields including status (activate/deactivate)', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()
    const mockReward = buildMockReward({ _id: rewardId, bar: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Reward.findOne).mockResolvedValue(mockReward as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), rewardId: rewardId.toString() },
      body: { status: 'inactive' },
    })
    const res = buildMockResponse()

    await RewardController.updateReward(req, res)

    expect(mockReward.status).toBe('inactive')
    expect(mockReward.save).toHaveBeenCalled()
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'reward.edited', actorType: 'OWNER' })
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns 404 when the reward does not exist (or is soft-deleted)', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Reward.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), rewardId: rewardId.toString() },
      body: { status: 'inactive' },
    })
    const res = buildMockResponse()

    await RewardController.updateReward(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 403 when the requester is a CASHIER, not an OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), rewardId: rewardId.toString() },
      body: { status: 'inactive' },
    })
    const res = buildMockResponse()

    await RewardController.updateReward(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(Reward.findOne).not.toHaveBeenCalled()
  })

  it('returns 400 when turning off unlimitedStock without providing a stock', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()
    const mockReward = buildMockReward({ _id: rewardId, bar: barId, unlimitedStock: true, stock: undefined })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Reward.findOne).mockResolvedValue(mockReward as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), rewardId: rewardId.toString() },
      body: { unlimitedStock: false },
    })
    const res = buildMockResponse()

    await RewardController.updateReward(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockReward.save).not.toHaveBeenCalled()
  })

  it('clears stock when unlimitedStock is turned on', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()
    const mockReward = buildMockReward({ _id: rewardId, bar: barId, unlimitedStock: false, stock: 5 })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Reward.findOne).mockResolvedValue(mockReward as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), rewardId: rewardId.toString() },
      body: { unlimitedStock: true },
    })
    const res = buildMockResponse()

    await RewardController.updateReward(req, res)

    expect(mockReward.stock).toBeUndefined()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns 409 on a duplicate name (E11000)', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()
    const mockReward = buildMockReward({ _id: rewardId, bar: barId })
    mockReward.save = vi.fn().mockRejectedValue({ code: 11000 })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Reward.findOne).mockResolvedValue(mockReward as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), rewardId: rewardId.toString() },
      body: { name: 'Otro nombre repetido' },
    })
    const res = buildMockResponse()

    await RewardController.updateReward(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
  })
})

describe('RewardController.deleteReward', () => {
  it('soft-deletes a reward and returns 200', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()
    const mockReward = buildMockReward({ _id: rewardId, bar: barId, deletedAt: null })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Reward.findOne).mockResolvedValue(mockReward as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), rewardId: rewardId.toString() },
    })
    const res = buildMockResponse()

    await RewardController.deleteReward(req, res)

    expect(mockReward.deletedAt).toBeInstanceOf(Date)
    expect(mockReward.save).toHaveBeenCalled()
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'reward.deleted', actorType: 'OWNER' })
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('is idempotent: returns 200 without error when already deleted', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()
    const alreadyDeletedAt = new Date('2026-01-01T00:00:00.000Z')
    const mockReward = buildMockReward({ _id: rewardId, bar: barId, deletedAt: alreadyDeletedAt })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Reward.findOne).mockResolvedValue(mockReward as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), rewardId: rewardId.toString() },
    })
    const res = buildMockResponse()

    await RewardController.deleteReward(req, res)

    expect(mockReward.deletedAt).toBe(alreadyDeletedAt)
    expect(mockReward.save).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns 404 when the reward does not exist for that bar', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Reward.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), rewardId: rewardId.toString() },
    })
    const res = buildMockResponse()

    await RewardController.deleteReward(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 403 when the requester is a CASHIER, not an OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), rewardId: rewardId.toString() },
    })
    const res = buildMockResponse()

    await RewardController.deleteReward(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe('RewardController.getAvailableRewards', () => {
  it('returns 403 when the user is not a member of the group', async () => {
    const userId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    vi.mocked(Group.findById).mockReturnValue(
      buildSelectLeanQuery({ memberships: [{ user: new Types.ObjectId() }] }) as any
    )

    const req = buildMockRequest({ user: { _id: userId } as any, query: { groupId: groupId.toString() } })
    const res = buildMockResponse()

    await RewardController.getAvailableRewards(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 404 when the group does not exist', async () => {
    const userId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    vi.mocked(Group.findById).mockReturnValue(buildSelectLeanQuery(null) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, query: { groupId: groupId.toString() } })
    const res = buildMockResponse()

    await RewardController.getAvailableRewards(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 200 with an empty list when the group has no ACTIVE outing', async () => {
    const userId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    vi.mocked(Group.findById).mockReturnValue(
      buildSelectLeanQuery({ memberships: [{ user: userId }] }) as any
    )
    vi.mocked(Outing.findOne).mockReturnValue(buildSelectLeanQuery(null) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, query: { groupId: groupId.toString() } })
    const res = buildMockResponse()

    await RewardController.getAvailableRewards(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith([])
  })

  it('filters by the ACTIVE outing status only (not PENDING)', async () => {
    const userId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(Group.findById).mockReturnValue(
      buildSelectLeanQuery({ memberships: [{ user: userId }] }) as any
    )
    vi.mocked(Outing.findOne).mockReturnValue(buildSelectLeanQuery({ bar: barId }) as any)
    vi.mocked(Reward.find).mockReturnValue(buildSortQuery([]) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, query: { groupId: groupId.toString() } })
    const res = buildMockResponse()

    await RewardController.getAvailableRewards(req, res)

    expect(Outing.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ group: groupId.toString(), status: OutingStatus.ACTIVE })
    )
  })

  it('returns 200 with active rewards that have stock or are unlimited', async () => {
    const userId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const reward = buildMockReward({ bar: barId })

    vi.mocked(Group.findById).mockReturnValue(
      buildSelectLeanQuery({ memberships: [{ user: userId }] }) as any
    )
    vi.mocked(Outing.findOne).mockReturnValue(buildSelectLeanQuery({ bar: barId }) as any)
    vi.mocked(Reward.find).mockReturnValue(buildSortQuery([reward]) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, query: { groupId: groupId.toString() } })
    const res = buildMockResponse()

    await RewardController.getAvailableRewards(req, res)

    expect(Reward.find).toHaveBeenCalledWith(
      expect.objectContaining({
        bar: barId,
        status: RewardStatus.ACTIVE,
        deletedAt: null,
        $or: [{ unlimitedStock: true }, { stock: { $gt: 0 } }],
      })
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ id: reward._id.toString() })])
  })
})
