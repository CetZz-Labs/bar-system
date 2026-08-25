import { vi, describe, it, expect, beforeEach } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { RedemptionController } from '../RedemptionController'
import Redemption, { RedemptionStatus } from '../../models/Redemption'
import Reward, { RewardStatus } from '../../models/Reward'
import Outing, { OutingStatus } from '../../models/Outing'
import Group from '../../models/Group'
import { writeAuditLog } from '../../utils/auditLogService'
import * as redemptionQr from '../../utils/redemptionQr'
import * as redemptionAvailability from '../../utils/redemptionAvailability'
import * as redemptionExpiry from '../../utils/redemptionExpiry'
import * as pointsHub from '../../websocket/pointsHub'
import { MembershipRole } from '../../models/User'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

// LB-68 (segunda pasada). Ruta anidada bajo /api/groups/:groupId/redemptions
// (groupId viene de req.params, no de req.body/query — ver
// routes/groupRedemptionsRoute.ts).

vi.mock('../../models/Redemption', () => ({
  default: {
    create: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
  },
  RedemptionStatus: {
    HELD: 'HELD',
    VALIDATED: 'VALIDATED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
    ABANDONED: 'ABANDONED',
  },
}))

vi.mock('../../models/Reward', () => ({
  default: {
    findOne: vi.fn(),
    findById: vi.fn(),
  },
  RewardStatus: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
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

vi.mock('../../models/Group', () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock('../../utils/auditLogService', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('../../utils/redemptionQr', () => ({
  generate: vi.fn(),
}))

vi.mock('../../utils/redemptionAvailability', () => ({
  getAvailablePointsForBar: vi.fn(),
  getAvailableStock: vi.fn(),
}))

vi.mock('../../utils/redemptionExpiry', () => ({
  expireStaleRedemptions: vi.fn(),
}))

vi.mock('../../websocket/pointsHub', () => ({
  emitAvailablePointsForBar: vi.fn(),
}))

function mockGroupMemberships(memberships: Array<{ user: string; role: MembershipRole }>) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ memberships }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(writeAuditLog).mockReset()
  vi.mocked(pointsHub.emitAvailablePointsForBar).mockImplementation(() => {})
  // Credenciales por default para los tests de `create` que llegan a
  // llamar `generate()` (antes de abrir la transacción) pero no verifican
  // el contenido del QR — los que sí lo verifican lo sobreescriben.
  vi.mocked(redemptionQr.generate).mockResolvedValue({
    qrData: 'data:image/png;base64,default',
    qrToken: 'default-token',
    manualCode: '000000',
    expiresAt: new Date(Date.now() + 20 * 60 * 1000),
  })
})

describe('RedemptionController.create', () => {
  it('returns 403 when the user is not leader/co-leader of the group', async () => {
    const userId = new Types.ObjectId().toString()
    const groupId = new Types.ObjectId().toString()

    vi.mocked(Group.findById).mockReturnValue(
      mockGroupMemberships([{ user: userId, role: MembershipRole.MEMBER }]) as any
    )

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { groupId },
      body: { rewardId: new Types.ObjectId().toString() },
    })
    const res = buildMockResponse()

    await RedemptionController.create(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(Reward.findOne).not.toHaveBeenCalled()
  })

  it('returns 403 when there is no active check-in at the reward bar', async () => {
    const userId = new Types.ObjectId().toString()
    const groupId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const reward = { _id: new Types.ObjectId(), bar: barId, status: RewardStatus.ACTIVE, deletedAt: null }

    vi.mocked(Group.findById).mockReturnValue(
      mockGroupMemberships([{ user: userId, role: MembershipRole.LEADER }]) as any
    )
    vi.mocked(Reward.findOne).mockResolvedValue(reward as any)
    vi.mocked(Outing.findOne).mockResolvedValue(null as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { groupId },
      body: { rewardId: reward._id.toString() },
    })
    const res = buildMockResponse()

    await RedemptionController.create(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('check-in activo') })
    )
  })

  it('returns 409 when there are not enough available points in the bar', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    const userId = new Types.ObjectId().toString()
    const groupId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const outingId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()
    const reward = { _id: rewardId, bar: barId, status: RewardStatus.ACTIVE, deletedAt: null, pointsRequired: 100 }

    vi.mocked(Group.findById).mockReturnValue(
      mockGroupMemberships([{ user: userId, role: MembershipRole.LEADER }]) as any
    )
    vi.mocked(Reward.findOne).mockResolvedValue(reward as any)
    vi.mocked(Outing.findOne).mockResolvedValue({ _id: outingId, bar: barId, status: OutingStatus.ACTIVE } as any)
    vi.mocked(Reward.findById).mockReturnValue({
      session: vi.fn().mockResolvedValue(reward),
    } as any)
    vi.mocked(redemptionAvailability.getAvailablePointsForBar).mockResolvedValue(50)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { groupId },
      body: { rewardId: rewardId.toString() },
    })
    const res = buildMockResponse()

    await RedemptionController.create(req, res)

    expect(session.abortTransaction).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('puntos disponibles') })
    )
    expect(Redemption.create).not.toHaveBeenCalled()
  })

  it('returns 409 when there is no available stock left', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    const userId = new Types.ObjectId().toString()
    const groupId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const outingId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()
    const reward = {
      _id: rewardId,
      bar: barId,
      status: RewardStatus.ACTIVE,
      deletedAt: null,
      pointsRequired: 100,
      unlimitedStock: false,
      stock: 0,
    }

    vi.mocked(Group.findById).mockReturnValue(
      mockGroupMemberships([{ user: userId, role: MembershipRole.CO_LEADER }]) as any
    )
    vi.mocked(Reward.findOne).mockResolvedValue(reward as any)
    vi.mocked(Outing.findOne).mockResolvedValue({ _id: outingId, bar: barId, status: OutingStatus.ACTIVE } as any)
    vi.mocked(Reward.findById).mockReturnValue({
      session: vi.fn().mockResolvedValue(reward),
    } as any)
    vi.mocked(redemptionAvailability.getAvailablePointsForBar).mockResolvedValue(200)
    vi.mocked(redemptionAvailability.getAvailableStock).mockResolvedValue(0)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { groupId },
      body: { rewardId: rewardId.toString() },
    })
    const res = buildMockResponse()

    await RedemptionController.create(req, res)

    expect(session.abortTransaction).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('stock') }))
    expect(Redemption.create).not.toHaveBeenCalled()
  })

  it('creates a HELD redemption with QR + manual code on success', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    const userId = new Types.ObjectId().toString()
    const groupId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const outingId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000)
    const reward = {
      _id: rewardId,
      bar: barId,
      status: RewardStatus.ACTIVE,
      deletedAt: null,
      pointsRequired: 100,
      name: 'Chopp gratis',
      unlimitedStock: true,
    }
    const createdRedemption = {
      _id: new Types.ObjectId(),
      group: new Types.ObjectId(groupId),
      outing: outingId,
      bar: barId,
      reward: rewardId,
      rewardNameSnapshot: 'Chopp gratis',
      pointsRequiredSnapshot: 100,
      status: RedemptionStatus.HELD,
      manualCode: '123456',
      expiresAt,
      createdAt: new Date(),
    }

    vi.mocked(Group.findById).mockReturnValue(
      mockGroupMemberships([{ user: userId, role: MembershipRole.LEADER }]) as any
    )
    vi.mocked(Reward.findOne).mockResolvedValue(reward as any)
    vi.mocked(Outing.findOne).mockResolvedValue({ _id: outingId, bar: barId, status: OutingStatus.ACTIVE } as any)
    vi.mocked(Reward.findById).mockReturnValue({
      session: vi.fn().mockResolvedValue(reward),
    } as any)
    vi.mocked(redemptionAvailability.getAvailablePointsForBar)
      .mockResolvedValueOnce(200) // check dentro de la transacción
      .mockResolvedValueOnce(100) // recálculo post-commit para el evento/response
    vi.mocked(redemptionAvailability.getAvailableStock).mockResolvedValue(null)
    vi.mocked(redemptionQr.generate).mockResolvedValue({
      qrData: 'data:image/png;base64,xxx',
      qrToken: 'jwt-token',
      manualCode: '123456',
      expiresAt,
    })
    vi.mocked(Redemption.create).mockResolvedValue([createdRedemption] as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { groupId },
      body: { rewardId: rewardId.toString() },
    })
    const res = buildMockResponse()

    await RedemptionController.create(req, res)

    expect(session.commitTransaction).toHaveBeenCalled()
    expect(Redemption.create).toHaveBeenCalledWith(
      [expect.objectContaining({ group: groupId, status: RedemptionStatus.HELD, manualCode: '123456' })],
      { session }
    )
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'redemption.generated' })
    )
    expect(pointsHub.emitAvailablePointsForBar).toHaveBeenCalledWith(groupId, barId.toString(), 100)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        qrData: 'data:image/png;base64,xxx',
        manualCode: '123456',
        availablePoints: 100,
        status: RedemptionStatus.HELD,
      })
    )
  })
})

describe('RedemptionController.cancel', () => {
  it('returns 404 when the redemption does not belong to the group in the URL', async () => {
    vi.mocked(Redemption.findOne).mockResolvedValue(null as any)

    const req = buildMockRequest({
      user: { _id: new Types.ObjectId().toString() } as any,
      params: { groupId: new Types.ObjectId().toString(), id: new Types.ObjectId().toString() },
    })
    const res = buildMockResponse()

    await RedemptionController.cancel(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('allows a different leader/co-leader of the same group (not the creator) to cancel', async () => {
    const creatorId = new Types.ObjectId().toString()
    const cancelerId = new Types.ObjectId().toString()
    const groupId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const save = vi.fn().mockResolvedValue(undefined)
    const redemption = {
      _id: new Types.ObjectId(),
      group: new Types.ObjectId(groupId),
      bar: barId,
      outing: new Types.ObjectId(),
      leader: creatorId,
      status: RedemptionStatus.HELD,
      pointsRequiredSnapshot: 100,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      save,
    }

    vi.mocked(Redemption.findOne).mockResolvedValue(redemption as any)
    vi.mocked(Group.findById).mockReturnValue(
      mockGroupMemberships([
        { user: creatorId, role: MembershipRole.LEADER },
        { user: cancelerId, role: MembershipRole.CO_LEADER },
      ]) as any
    )
    vi.mocked(redemptionAvailability.getAvailablePointsForBar).mockResolvedValue(150)

    const req = buildMockRequest({
      user: { _id: cancelerId } as any,
      params: { groupId, id: redemption._id.toString() },
    })
    const res = buildMockResponse()

    await RedemptionController.cancel(req, res)

    expect(redemption.status).toBe(RedemptionStatus.CANCELLED)
    expect(save).toHaveBeenCalled()
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'redemption.cancelled' })
    )
    expect(pointsHub.emitAvailablePointsForBar).toHaveBeenCalledWith(groupId, barId.toString(), 150)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('is idempotent when the redemption is already CANCELLED (no re-save, no re-audit)', async () => {
    const userId = new Types.ObjectId().toString()
    const groupId = new Types.ObjectId().toString()
    const save = vi.fn()
    const redemption = {
      _id: new Types.ObjectId(),
      group: new Types.ObjectId(groupId),
      bar: new Types.ObjectId(),
      status: RedemptionStatus.CANCELLED,
      pointsRequiredSnapshot: 100,
      save,
    }

    vi.mocked(Redemption.findOne).mockResolvedValue(redemption as any)
    vi.mocked(Group.findById).mockReturnValue(
      mockGroupMemberships([{ user: userId, role: MembershipRole.LEADER }]) as any
    )

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { groupId, id: redemption._id.toString() },
    })
    const res = buildMockResponse()

    await RedemptionController.cancel(req, res)

    expect(save).not.toHaveBeenCalled()
    expect(writeAuditLog).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('resolves an already-expired HELD redemption as EXPIRED instead of CANCELLED', async () => {
    const userId = new Types.ObjectId().toString()
    const groupId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const save = vi.fn().mockResolvedValue(undefined)
    const redemption = {
      _id: new Types.ObjectId(),
      group: new Types.ObjectId(groupId),
      bar: barId,
      outing: new Types.ObjectId(),
      status: RedemptionStatus.HELD,
      pointsRequiredSnapshot: 100,
      expiresAt: new Date(Date.now() - 60 * 1000),
      save,
    }

    vi.mocked(Redemption.findOne).mockResolvedValue(redemption as any)
    vi.mocked(Group.findById).mockReturnValue(
      mockGroupMemberships([{ user: userId, role: MembershipRole.LEADER }]) as any
    )
    vi.mocked(redemptionAvailability.getAvailablePointsForBar).mockResolvedValue(200)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { groupId, id: redemption._id.toString() },
    })
    const res = buildMockResponse()

    await RedemptionController.cancel(req, res)

    expect(redemption.status).toBe(RedemptionStatus.EXPIRED)
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'redemption.expired' })
    )
    expect(res.status).toHaveBeenCalledWith(409)
  })
})

describe('RedemptionController.list', () => {
  it('applies lazy expiration for the group before returning the list', async () => {
    const userId = new Types.ObjectId().toString()
    const groupId = new Types.ObjectId().toString()

    vi.mocked(Group.findById).mockReturnValue(
      mockGroupMemberships([{ user: userId, role: MembershipRole.LEADER }]) as any
    )
    vi.mocked(redemptionExpiry.expireStaleRedemptions).mockResolvedValue(undefined)
    vi.mocked(Redemption.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { groupId } })
    const res = buildMockResponse()

    await RedemptionController.list(req, res)

    expect(redemptionExpiry.expireStaleRedemptions).toHaveBeenCalledWith({ group: groupId })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith([])
  })

  it('returns 403 when the user is not leader/co-leader of the group', async () => {
    const userId = new Types.ObjectId().toString()
    const groupId = new Types.ObjectId().toString()

    vi.mocked(Group.findById).mockReturnValue(
      mockGroupMemberships([{ user: userId, role: MembershipRole.MEMBER }]) as any
    )

    const req = buildMockRequest({ user: { _id: userId } as any, params: { groupId } })
    const res = buildMockResponse()

    await RedemptionController.list(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(redemptionExpiry.expireStaleRedemptions).not.toHaveBeenCalled()
  })
})
