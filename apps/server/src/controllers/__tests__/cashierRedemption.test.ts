import { vi, describe, it, expect, beforeEach } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { CashierRedemptionController } from '../CashierRedemptionController'
import Redemption, { RedemptionStatus } from '../../models/Redemption'
import Reward from '../../models/Reward'
import Outing, { OutingStatus } from '../../models/Outing'
import Group from '../../models/Group'
import User from '../../models/User'
import Notification from '../../models/Notification'
import PointsTransaction from '../../models/PointsTransaction'
import { writeAuditLog } from '../../utils/auditLogService'
import { sendPushToUsers } from '../../utils/pushService'
import * as redemptionQr from '../../utils/redemptionQr'
import * as redemptionExpiry from '../../utils/redemptionExpiry'
import * as redemptionAvailability from '../../utils/redemptionAvailability'
import * as pointsHub from '../../websocket/pointsHub'
import { MembershipRole } from '../../models/User'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

// LB-69: cajero valida/entrega/rechaza un canje generado por el líder
// (LB-68). Ruta NO anidada bajo groupId — ver routes/cashierRedemptionRoute.ts.

vi.mock('../../models/Redemption', () => ({
  default: {
    findById: vi.fn(),
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
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}))

vi.mock('../../models/Outing', () => ({
  default: {
    findById: vi.fn(),
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
    findByIdAndUpdate: vi.fn(),
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

vi.mock('../../models/Notification', () => ({
  default: {
    insertMany: vi.fn(),
  },
  NotificationType: {
    REDEMPTION_VALIDATED: 'REDEMPTION_VALIDATED',
    REDEMPTION_REJECTED: 'REDEMPTION_REJECTED',
  },
}))

vi.mock('../../utils/auditLogService', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('../../utils/pushService', () => ({
  sendPushToUsers: vi.fn(),
}))

vi.mock('../../models/PointsTransaction', () => ({
  default: {
    create: vi.fn(),
  },
  PointsTransactionType: {
    REDEMPTION: 'REDEMPTION',
  },
}))

vi.mock('../../utils/redemptionQr', () => ({
  validate: vi.fn(),
  isBlocked: vi.fn(),
  registerFailedAttempt: vi.fn(),
  resetAttempts: vi.fn(),
}))

vi.mock('../../utils/redemptionExpiry', () => ({
  expireStaleRedemptions: vi.fn(),
}))

vi.mock('../../utils/redemptionAvailability', () => ({
  getAvailablePointsForBar: vi.fn(),
}))

vi.mock('../../websocket/pointsHub', () => ({
  emitAvailablePointsForBar: vi.fn(),
}))

function buildCashierContext(overrides: Record<string, unknown> = {}) {
  return {
    user: { _id: new Types.ObjectId() },
    bar: new Types.ObjectId(),
    barUser: { role: 'CASHIER' },
    shift: { deviceInfo: 'test-device' },
    ...overrides,
  }
}

function buildRedemptionDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    group: new Types.ObjectId(),
    outing: new Types.ObjectId(),
    bar: new Types.ObjectId(),
    reward: new Types.ObjectId(),
    leader: new Types.ObjectId(),
    rewardNameSnapshot: 'Chopp gratis',
    pointsRequiredSnapshot: 100,
    status: RedemptionStatus.HELD,
    invalidatedAt: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(redemptionQr.isBlocked).mockReturnValue(false)
  vi.mocked(redemptionQr.registerFailedAttempt).mockImplementation(() => {})
  vi.mocked(redemptionQr.resetAttempts).mockImplementation(() => {})
  vi.mocked(redemptionExpiry.expireStaleRedemptions).mockResolvedValue(undefined)
  vi.mocked(redemptionAvailability.getAvailablePointsForBar).mockResolvedValue(50)
  vi.mocked(pointsHub.emitAvailablePointsForBar).mockImplementation(() => {})
  vi.mocked(writeAuditLog).mockReset()
  vi.mocked(Notification.insertMany).mockResolvedValue([] as any)
  vi.mocked(Group.findById).mockReturnValue({
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ memberships: [] }) }),
  } as any)
})

describe('CashierRedemptionController.lookup', () => {
  it('returns 429 when the cashier is rate-limited', async () => {
    vi.mocked(redemptionQr.isBlocked).mockReturnValue(true)

    const cashierContext = buildCashierContext()
    const req = buildMockRequest({ params: { tokenOrCode: '123456' }, cashierContext } as any)
    const res = buildMockResponse()

    await CashierRedemptionController.lookup(req, res)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(redemptionQr.validate).not.toHaveBeenCalled()
  })

  it('returns a generic 403 and registers a failed attempt for an invalid code', async () => {
    vi.mocked(redemptionQr.validate).mockResolvedValue({ valid: false, error: 'Código o QR inválido' })

    const cashierContext = buildCashierContext()
    const req = buildMockRequest({ params: { tokenOrCode: 'xxx' }, cashierContext } as any)
    const res = buildMockResponse()

    await CashierRedemptionController.lookup(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ message: 'Código o QR inválido' })
    expect(redemptionQr.registerFailedAttempt).toHaveBeenCalledWith(cashierContext.user._id.toString())
  })

  it('returns a generic 403 (not a specific bar mismatch message) when the redemption belongs to another bar', async () => {
    const redemptionId = new Types.ObjectId().toString()
    const redemption = buildRedemptionDoc({ bar: new Types.ObjectId() })
    vi.mocked(redemptionQr.validate).mockResolvedValue({ valid: true, redemptionId })
    vi.mocked(Redemption.findById).mockResolvedValueOnce(redemption as any)

    const cashierContext = buildCashierContext({ bar: new Types.ObjectId() }) // distinto bar
    const req = buildMockRequest({ params: { tokenOrCode: '123456' }, cashierContext } as any)
    const res = buildMockResponse()

    await CashierRedemptionController.lookup(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ message: 'Código o QR inválido' })
    expect(redemptionQr.registerFailedAttempt).toHaveBeenCalled()
  })

  it('returns 409 "salida cerrada" when the redemption is ABANDONED', async () => {
    const redemptionId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const redemption = buildRedemptionDoc({ bar: barId, status: RedemptionStatus.ABANDONED })
    vi.mocked(redemptionQr.validate).mockResolvedValue({ valid: true, redemptionId })
    vi.mocked(Redemption.findById).mockResolvedValueOnce(redemption as any)

    const cashierContext = buildCashierContext({ bar: barId })
    const req = buildMockRequest({ params: { tokenOrCode: '123456' }, cashierContext } as any)
    const res = buildMockResponse()

    await CashierRedemptionController.lookup(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('salida se cerró') })
    )
    expect(redemptionQr.resetAttempts).toHaveBeenCalled()
  })

  it('returns 409 when the outing tied to the redemption is no longer ACTIVE', async () => {
    const redemptionId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const redemption = buildRedemptionDoc({ bar: barId, status: RedemptionStatus.HELD })
    vi.mocked(redemptionQr.validate).mockResolvedValue({ valid: true, redemptionId })
    vi.mocked(Redemption.findById).mockResolvedValueOnce(redemption as any)
    vi.mocked(Outing.findById).mockResolvedValue({ status: OutingStatus.COMPLETED } as any)

    const cashierContext = buildCashierContext({ bar: barId })
    const req = buildMockRequest({ params: { tokenOrCode: '123456' }, cashierContext } as any)
    const res = buildMockResponse()

    await CashierRedemptionController.lookup(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('salida se cerró') })
    )
  })

  it('returns the redemption preview DTO for a HELD redemption with an ACTIVE outing', async () => {
    const redemptionId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const leaderId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const redemption = buildRedemptionDoc({
      bar: barId,
      leader: leaderId,
      group: groupId,
      status: RedemptionStatus.HELD,
    })
    vi.mocked(redemptionQr.validate).mockResolvedValue({ valid: true, redemptionId })
    vi.mocked(Redemption.findById).mockResolvedValueOnce(redemption as any)
    vi.mocked(Outing.findById).mockResolvedValue({ status: OutingStatus.ACTIVE } as any)
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ name: 'Juan', lastName: 'Perez' }) }),
    } as any)
    vi.mocked(Group.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ name: 'Los Pibes' }) }),
    } as any)

    const cashierContext = buildCashierContext({ bar: barId })
    const req = buildMockRequest({ params: { tokenOrCode: '123456' }, cashierContext } as any)
    const res = buildMockResponse()

    await CashierRedemptionController.lookup(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        rewardName: 'Chopp gratis',
        pointsRequired: 100,
        group: { id: groupId.toString(), name: 'Los Pibes' },
        leader: { id: leaderId.toString(), name: 'Juan Perez' },
      })
    )
    expect(redemptionQr.resetAttempts).toHaveBeenCalled()
  })
})

describe('CashierRedemptionController.validate (deliver)', () => {
  it('debits points, decrements stock, marks VALIDATED and notifies the leaders', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    const redemptionId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const outingId = new Types.ObjectId()
    const rewardId = new Types.ObjectId()

    const redemption = buildRedemptionDoc({
      bar: barId,
      group: groupId,
      outing: outingId,
      reward: rewardId,
      status: RedemptionStatus.HELD,
    })

    vi.mocked(redemptionQr.validate).mockResolvedValue({ valid: true, redemptionId })
    // 1ra llamada: dentro de resolveHeldRedemption (await directo)
    // 2da llamada: dentro de deliver, encadenada con .session(session)
    vi.mocked(Redemption.findById)
      .mockResolvedValueOnce(redemption as any)
      .mockReturnValueOnce({ session: vi.fn().mockResolvedValue(redemption) } as any)
    vi.mocked(Outing.findById).mockResolvedValue({ status: OutingStatus.ACTIVE } as any)

    vi.mocked(Group.findByIdAndUpdate).mockReturnValue({
      select: vi.fn().mockResolvedValue({ pointsBalance: 400 }),
    } as any)
    vi.mocked(PointsTransaction.create).mockResolvedValue([{}] as any)

    vi.mocked(Reward.findById).mockReturnValue({
      session: vi.fn().mockResolvedValue({ _id: rewardId, unlimitedStock: false, stock: 5 }),
    } as any)
    vi.mocked(Reward.findByIdAndUpdate).mockReturnValue({
      select: vi.fn().mockResolvedValue({ stock: 4 }),
    } as any)

    vi.mocked(Group.findById).mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          memberships: [{ user: new Types.ObjectId(), role: MembershipRole.LEADER }],
        }),
      }),
    } as any)

    const cashierContext = buildCashierContext({ bar: barId })
    const req = buildMockRequest({
      params: { tokenOrCode: '123456' },
      body: { action: 'deliver' },
      cashierContext,
    } as any)
    const res = buildMockResponse()

    await CashierRedemptionController.validate(req, res)

    expect(session.commitTransaction).toHaveBeenCalled()
    expect(redemption.status).toBe(RedemptionStatus.VALIDATED)
    expect(redemption.save).toHaveBeenCalledWith({ session })
    expect(PointsTransaction.create).toHaveBeenCalledWith(
      [expect.objectContaining({ type: 'REDEMPTION', amount: -100, redemption: redemption._id })],
      { session }
    )
    expect(Group.findByIdAndUpdate).toHaveBeenCalledWith(
      groupId,
      { $inc: { pointsBalance: -100 } },
      { new: true, session }
    )
    expect(Reward.findByIdAndUpdate).toHaveBeenCalledWith(
      rewardId,
      { $inc: { stock: -1 } },
      { new: true, session }
    )
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'redemption.delivered' })
    )
    expect(Notification.insertMany).toHaveBeenCalled()

    // LB-80: push "canjes" a los mismos LEADER/CO_LEADER, post-commit.
    expect(sendPushToUsers).toHaveBeenCalledTimes(1)
    const [pushRecipients, pushPayload] = vi.mocked(sendPushToUsers).mock.calls[0]
    expect((pushRecipients as unknown[]).length).toBe(1)
    expect(pushPayload).toEqual(
      expect.objectContaining({ category: 'canjes', relatedOuting: outingId.toString() })
    )

    expect(pointsHub.emitAvailablePointsForBar).toHaveBeenCalledWith(groupId.toString(), barId.toString(), 50)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: RedemptionStatus.VALIDATED, pointsBalance: 400, stockRemaining: 4 })
    )
  })

  it('returns 409 without mutating anything if the double-check inside the transaction finds it already processed', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    const redemptionId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const redemption = buildRedemptionDoc({ bar: barId, status: RedemptionStatus.HELD })
    const alreadyValidated = { ...redemption, status: RedemptionStatus.VALIDATED }

    vi.mocked(redemptionQr.validate).mockResolvedValue({ valid: true, redemptionId })
    vi.mocked(Redemption.findById)
      .mockResolvedValueOnce(redemption as any)
      .mockReturnValueOnce({ session: vi.fn().mockResolvedValue(alreadyValidated) } as any)
    vi.mocked(Outing.findById).mockResolvedValue({ status: OutingStatus.ACTIVE } as any)

    const cashierContext = buildCashierContext({ bar: barId })
    const req = buildMockRequest({
      params: { tokenOrCode: '123456' },
      body: { action: 'deliver' },
      cashierContext,
    } as any)
    const res = buildMockResponse()

    await CashierRedemptionController.validate(req, res)

    expect(session.abortTransaction).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(PointsTransaction.create).not.toHaveBeenCalled()
  })
})

describe('CashierRedemptionController.validate (reject)', () => {
  it('marks REJECTED with the given reason, without touching points/stock', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    const redemptionId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const redemption = buildRedemptionDoc({ bar: barId, group: groupId, status: RedemptionStatus.HELD })

    vi.mocked(redemptionQr.validate).mockResolvedValue({ valid: true, redemptionId })
    vi.mocked(Redemption.findById)
      .mockResolvedValueOnce(redemption as any)
      .mockReturnValueOnce({ session: vi.fn().mockResolvedValue(redemption) } as any)
    vi.mocked(Outing.findById).mockResolvedValue({ status: OutingStatus.ACTIVE } as any)

    const cashierContext = buildCashierContext({ bar: barId })
    const req = buildMockRequest({
      params: { tokenOrCode: '123456' },
      body: { action: 'reject', reason: 'Sin stock físico' },
      cashierContext,
    } as any)
    const res = buildMockResponse()

    await CashierRedemptionController.validate(req, res)

    expect(session.commitTransaction).toHaveBeenCalled()
    expect(redemption.status).toBe(RedemptionStatus.REJECTED)
    expect((redemption as any).rejectionReason).toBe('Sin stock físico')
    expect(PointsTransaction.create).not.toHaveBeenCalled()
    expect(Reward.findByIdAndUpdate).not.toHaveBeenCalled()
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'redemption.rejected' })
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: RedemptionStatus.REJECTED, rejectionReason: 'Sin stock físico' })
    )
  })
})
