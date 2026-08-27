import { vi, describe, it, expect, beforeEach } from 'vitest'
import { OutingController } from '../../controllers/OutingController'
import Outing from '../../models/Outing'
import Notification from '../../models/Notification'
import Group from '../../models/Group'
import Bar from '../../models/Bar'
import { writeAuditLog } from '../../utils/auditLogService'
import { sendPushToUsers } from '../../utils/pushService'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'
import mongoose from 'mongoose'

vi.mock('../../models/Outing', () => ({
  default: {
    findOne: vi.fn(),
    findById: vi.fn(),
  },
  OutingStatus: {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    CANCELLED: 'CANCELLED',
    COMPLETED: 'COMPLETED',
  },
}))

vi.mock('../../models/Notification', () => ({
  default: {
    insertMany: vi.fn().mockResolvedValue(true),
  },
  NotificationType: {
    OUTING_CREATED: 'OUTING_CREATED',
    OUTING_UPDATED: 'OUTING_UPDATED',
    OUTING_CANCELLED: 'OUTING_CANCELLED',
    OUTING_CHECKED_IN: 'OUTING_CHECKED_IN',
  },
}))

vi.mock('../../models/Group', () => ({
  default: {
    findById: vi.fn(),
  },
}))

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
  MembershipRole: {
    ADMIN: 'ADMIN',
    MEMBER: 'MEMBER',
    LEADER: 'LEADER',
    CO_LEADER: 'CO_LEADER',
  },
}))

vi.mock('../../utils/auditLogService', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('../../utils/pushService', () => ({
  sendPushToUsers: vi.fn(),
}))

vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>()
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: vi.fn(),
    },
  }
})

const MembershipRole = {
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  LEADER: 'LEADER',
  CO_LEADER: 'CO_LEADER',
}

function buildSelectLeanQuery(data: any) {
  const query: any = {}
  query.select = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(data)
  return query
}

function buildPopulateQuery(data: any) {
  const query: any = {}
  query.populate = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(data)
  return query
}

function buildMockSession() {
  return {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn(),
    inTransaction: vi.fn().mockReturnValue(true),
  }
}

const HOUR_MS = 60 * 60 * 1000

describe('OutingController.confirmCheckIn', () => {
  let leaderId: Types.ObjectId
  let coLeaderId: Types.ObjectId
  let memberId1: Types.ObjectId
  let groupId: Types.ObjectId
  let barId: Types.ObjectId
  let outingId: Types.ObjectId
  let cashierUserId: Types.ObjectId
  let mockGroup: any
  let mockBar: any
  let mockOuting: any
  let mockSession: ReturnType<typeof buildMockSession>
  let cashierContext: any

  beforeEach(() => {
    leaderId = new Types.ObjectId()
    coLeaderId = new Types.ObjectId()
    memberId1 = new Types.ObjectId()
    groupId = new Types.ObjectId()
    barId = new Types.ObjectId()
    outingId = new Types.ObjectId()
    cashierUserId = new Types.ObjectId()

    mockGroup = {
      _id: groupId,
      memberships: [
        { user: leaderId, role: MembershipRole.LEADER, joinedAt: new Date() },
        { user: coLeaderId, role: MembershipRole.CO_LEADER, joinedAt: new Date() },
        { user: memberId1, role: MembershipRole.MEMBER, joinedAt: new Date() },
      ],
    }

    mockBar = { _id: barId, name: 'Bar de Prueba', checkInWindowHours: 4 }

    mockOuting = {
      _id: outingId,
      group: groupId,
      bar: barId,
      status: 'PENDING',
      scheduledFor: new Date(Date.now() - 1 * HOUR_MS),
      checkedInAt: undefined,
      checkedInBy: undefined,
      save: vi.fn().mockResolvedValue(true),
    }

    cashierContext = {
      user: { _id: cashierUserId },
      bar: barId,
      barUser: { role: 'CASHIER' },
      shift: { deviceInfo: 'test-device' },
    }

    mockSession = buildMockSession()

    vi.mocked(mongoose.startSession).mockReset().mockResolvedValue(mockSession as any)
    vi.mocked(Outing.findOne).mockReset().mockResolvedValue(mockOuting)
    vi.mocked(Outing.findById).mockReset().mockReturnValue(buildPopulateQuery({ ...mockOuting }) as any)
    vi.mocked(Group.findById).mockReset().mockReturnValue(buildSelectLeanQuery(mockGroup) as any)
    vi.mocked(Bar.findById).mockReset().mockReturnValue(buildSelectLeanQuery(mockBar) as any)
    vi.mocked(Notification.insertMany).mockReset().mockResolvedValue(true as any)
    vi.mocked(writeAuditLog).mockReset()
    vi.mocked(sendPushToUsers).mockReset()
  })

  function buildRequest(overrides: any = {}) {
    return buildMockRequest({
      cashierContext,
      params: { outingId: outingId.toString() },
      ...overrides,
    })
  }

  describe('happy path', () => {
    it('confirms the check-in, moves the outing to ACTIVE and notifies leader + co-leader', async () => {
      const req = buildRequest()
      const res = buildMockResponse()

      await OutingController.confirmCheckIn(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockOuting.save).toHaveBeenCalled()
      expect(mockOuting.status).toBe('ACTIVE')
      expect(mockOuting.checkedInAt).toBeInstanceOf(Date)
      expect(mockOuting.checkedInBy).toBe(cashierUserId)
      expect(mockSession.commitTransaction).toHaveBeenCalled()

      expect(Notification.insertMany).toHaveBeenCalledTimes(1)
      const notifications = vi.mocked(Notification.insertMany).mock.calls[0][0] as any[]
      expect(notifications).toHaveLength(2)
      expect(notifications.every((n) => n.type === 'OUTING_CHECKED_IN')).toBe(true)
      expect(notifications.every((n) => n.relatedOuting === outingId)).toBe(true)
      const recipients = notifications.map((n) => n.user.toString())
      expect(recipients).toContain(leaderId.toString())
      expect(recipients).toContain(coLeaderId.toString())
      expect(recipients).not.toContain(memberId1.toString())

      // LB-77: el check-in confirmado emite el evento de auditoría.
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          bar: barId,
          actorType: 'CASHIER',
          actorId: cashierUserId,
          eventType: 'checkin.confirmed',
          entityType: 'Checkin',
          entityId: outingId,
        })
      )
    })

    it('LB-80: fires a "salidas" push to the same leader + co-leader after commit', async () => {
      const req = buildRequest()
      const res = buildMockResponse()

      await OutingController.confirmCheckIn(req, res)

      expect(sendPushToUsers).toHaveBeenCalledTimes(1)
      const [recipients, payload] = vi.mocked(sendPushToUsers).mock.calls[0]
      const recipientIds = (recipients as any[]).map((r) => r.toString())
      expect(recipientIds).toContain(leaderId.toString())
      expect(recipientIds).toContain(coLeaderId.toString())
      expect(recipientIds).not.toContain(memberId1.toString())
      expect(payload).toEqual(
        expect.objectContaining({
          category: 'salidas',
          relatedOuting: outingId.toString(),
        })
      )
      // se envía después del commit de la transacción
      expect(mockSession.commitTransaction).toHaveBeenCalled()
    })

    it('LB-80: does not push on an idempotent second confirmation (already ACTIVE)', async () => {
      const activeOuting = { ...mockOuting, status: 'ACTIVE' }
      vi.mocked(Outing.findOne).mockResolvedValue(activeOuting)
      vi.mocked(Outing.findById).mockReturnValue(buildPopulateQuery(activeOuting) as any)

      const req = buildRequest()
      const res = buildMockResponse()

      await OutingController.confirmCheckIn(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(sendPushToUsers).not.toHaveBeenCalled()
    })
  })

  describe('authorization', () => {
    it('returns 403 when the outing belongs to a different bar than the cashier session', async () => {
      const otherBar = new Types.ObjectId()
      vi.mocked(Outing.findOne).mockResolvedValue({ ...mockOuting, bar: otherBar })

      const req = buildRequest()
      const res = buildMockResponse()

      await OutingController.confirmCheckIn(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: 'Esta salida no pertenece a tu bar' })
      expect(mockOuting.save).not.toHaveBeenCalled()
      expect(Notification.insertMany).not.toHaveBeenCalled()
    })
  })

  describe('outing not found', () => {
    it('returns 404', async () => {
      vi.mocked(Outing.findOne).mockResolvedValue(null)

      const req = buildRequest()
      const res = buildMockResponse()

      await OutingController.confirmCheckIn(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(Notification.insertMany).not.toHaveBeenCalled()
    })
  })

  describe('status guard', () => {
    it('returns 409 when the outing was CANCELLED', async () => {
      vi.mocked(Outing.findOne).mockResolvedValue({ ...mockOuting, status: 'CANCELLED' })

      const req = buildRequest()
      const res = buildMockResponse()

      await OutingController.confirmCheckIn(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(mockOuting.save).not.toHaveBeenCalled()
      expect(Notification.insertMany).not.toHaveBeenCalled()
    })

    it('returns 409 when the outing was already COMPLETED', async () => {
      vi.mocked(Outing.findOne).mockResolvedValue({ ...mockOuting, status: 'COMPLETED' })

      const req = buildRequest()
      const res = buildMockResponse()

      await OutingController.confirmCheckIn(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(mockOuting.save).not.toHaveBeenCalled()
    })
  })

  describe('check-in window', () => {
    it('returns 409 when it is still before the scheduled time', async () => {
      vi.mocked(Outing.findOne).mockResolvedValue({
        ...mockOuting,
        scheduledFor: new Date(Date.now() + 1 * HOUR_MS),
      })

      const req = buildRequest()
      const res = buildMockResponse()

      await OutingController.confirmCheckIn(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith({ message: 'Todavía no es la hora pactada de la salida' })
      expect(mockOuting.save).not.toHaveBeenCalled()
    })

    it('returns 409 when the check-in window (scheduledFor + checkInWindowHours) already expired', async () => {
      vi.mocked(Outing.findOne).mockResolvedValue({
        ...mockOuting,
        scheduledFor: new Date(Date.now() - 5 * HOUR_MS), // checkInWindowHours = 4 => expired 1h ago
      })

      const req = buildRequest()
      const res = buildMockResponse()

      await OutingController.confirmCheckIn(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith({ message: 'La ventana de check-in ya expiró' })
      expect(mockOuting.save).not.toHaveBeenCalled()
    })

    it('respects a custom checkInWindowHours configured on the bar', async () => {
      vi.mocked(Bar.findById).mockReturnValue(buildSelectLeanQuery({ ...mockBar, checkInWindowHours: 6 }) as any)
      vi.mocked(Outing.findOne).mockResolvedValue({
        ...mockOuting,
        scheduledFor: new Date(Date.now() - 5 * HOUR_MS), // still within a 6h window
      })

      const req = buildRequest()
      const res = buildMockResponse()

      await OutingController.confirmCheckIn(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockOuting.save).toHaveBeenCalled()
    })
  })

  describe('idempotency', () => {
    it('returns 200 without re-notifying or overwriting checkedInAt/checkedInBy when already ACTIVE', async () => {
      const previousCheckInDate = new Date(Date.now() - 30 * 60 * 1000)
      const previousCheckedInBy = new Types.ObjectId()
      const alreadyActive = {
        ...mockOuting,
        status: 'ACTIVE',
        checkedInAt: previousCheckInDate,
        checkedInBy: previousCheckedInBy,
      }
      vi.mocked(Outing.findOne).mockResolvedValue(alreadyActive)
      vi.mocked(Outing.findById).mockReturnValue(buildPopulateQuery(alreadyActive) as any)

      const req = buildRequest()
      const res = buildMockResponse()

      await OutingController.confirmCheckIn(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE' }))
      expect(alreadyActive.checkedInAt).toBe(previousCheckInDate)
      expect(alreadyActive.checkedInBy).toBe(previousCheckedInBy)
      expect(mockOuting.save).not.toHaveBeenCalled()
      expect(Notification.insertMany).not.toHaveBeenCalled()
      expect(mockSession.startTransaction).not.toHaveBeenCalled()
    })

    it('is safe to call twice in a row (second call does not duplicate notifications)', async () => {
      const req1 = buildRequest()
      const res1 = buildMockResponse()

      await OutingController.confirmCheckIn(req1, res1)

      expect(Notification.insertMany).toHaveBeenCalledTimes(1)

      // Second tap: outing is now ACTIVE.
      const activeOuting = { ...mockOuting, status: 'ACTIVE' }
      vi.mocked(Outing.findOne).mockResolvedValue(activeOuting)
      vi.mocked(Outing.findById).mockReturnValue(buildPopulateQuery(activeOuting) as any)

      const req2 = buildRequest()
      const res2 = buildMockResponse()

      await OutingController.confirmCheckIn(req2, res2)

      expect(res2.status).toHaveBeenCalledWith(200)
      expect(Notification.insertMany).toHaveBeenCalledTimes(1)
    })
  })
})
