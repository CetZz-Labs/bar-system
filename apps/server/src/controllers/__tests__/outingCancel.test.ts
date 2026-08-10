import { vi, describe, it, expect, beforeEach } from 'vitest'
import { OutingController } from '../../controllers/OutingController'
import Outing from '../../models/Outing'
import Notification from '../../models/Notification'
import Group from '../../models/Group'
import Bar from '../../models/Bar'
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

function buildLeanQuery(data: any) {
  return { lean: vi.fn().mockResolvedValue(data) }
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

describe('OutingController.cancelOuting', () => {
  let leaderId: Types.ObjectId
  let coLeaderId: Types.ObjectId
  let memberId1: Types.ObjectId
  let groupId: Types.ObjectId
  let barId: Types.ObjectId
  let outingId: Types.ObjectId
  let mockGroup: any
  let mockBar: any
  let mockOuting: any
  let mockSession: ReturnType<typeof buildMockSession>

  beforeEach(() => {
    leaderId = new Types.ObjectId()
    coLeaderId = new Types.ObjectId()
    memberId1 = new Types.ObjectId()
    groupId = new Types.ObjectId()
    barId = new Types.ObjectId()
    outingId = new Types.ObjectId()

    mockGroup = {
      _id: groupId,
      leader: leaderId,
      memberships: [
        { user: leaderId, role: MembershipRole.LEADER, joinedAt: new Date() },
        { user: coLeaderId, role: MembershipRole.CO_LEADER, joinedAt: new Date() },
        { user: memberId1, role: MembershipRole.MEMBER, joinedAt: new Date() },
      ],
    }

    mockBar = { _id: barId, name: 'Bar de Prueba', status: 'active' }

    mockOuting = {
      _id: outingId,
      group: groupId,
      bar: barId,
      createdBy: leaderId,
      status: 'PENDING',
      note: undefined,
      invitees: [leaderId, coLeaderId, memberId1],
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
      canceledBy: undefined,
      canceledAt: undefined,
      save: vi.fn().mockResolvedValue(true),
    }

    mockSession = buildMockSession()

    vi.mocked(mongoose.startSession).mockReset().mockResolvedValue(mockSession as any)
    vi.mocked(Group.findById).mockReset().mockReturnValue(buildLeanQuery(mockGroup) as any)
    vi.mocked(Bar.findById).mockReset().mockReturnValue(buildSelectLeanQuery(mockBar) as any)
    vi.mocked(Outing.findOne).mockReset().mockResolvedValue(mockOuting)
    vi.mocked(Outing.findById).mockReset().mockReturnValue(buildPopulateQuery({ ...mockOuting }) as any)
    vi.mocked(Notification.insertMany).mockReset().mockResolvedValue(true as any)
  })

  describe('happy path', () => {
    it('cancels the outing and returns 200', async () => {
      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: {},
      })
      const res = buildMockResponse()

      await OutingController.cancelOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockOuting.save).toHaveBeenCalled()
      expect(mockOuting.status).toBe('CANCELLED')
      expect(mockOuting.canceledBy).toBe(leaderId.toString())
      expect(mockOuting.canceledAt).toBeInstanceOf(Date)
      expect(mockSession.commitTransaction).toHaveBeenCalled()
    })

    it('allows a co-leader to cancel the outing', async () => {
      const req = buildMockRequest({
        user: { _id: coLeaderId } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: {},
      })
      const res = buildMockResponse()

      await OutingController.cancelOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockOuting.save).toHaveBeenCalled()
    })

    it('creates OUTING_CANCELLED notifications for every invitee', async () => {
      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: {},
      })
      const res = buildMockResponse()

      await OutingController.cancelOuting(req, res)

      expect(Notification.insertMany).toHaveBeenCalledTimes(1)
      const notifications = vi.mocked(Notification.insertMany).mock.calls[0][0] as any[]
      expect(notifications).toHaveLength(3)
      expect(notifications.every((n) => n.type === 'OUTING_CANCELLED')).toBe(true)
      expect(notifications.every((n) => n.message.includes('Bar de Prueba'))).toBe(true)
      expect(notifications.every((n) => n.relatedOuting === outingId)).toBe(true)
    })
  })

  describe('authorization', () => {
    it('returns 403 when the user is not leader/co-leader', async () => {
      const req = buildMockRequest({
        user: { _id: memberId1 } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: {},
      })
      const res = buildMockResponse()

      await OutingController.cancelOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(mockOuting.save).not.toHaveBeenCalled()
      expect(Notification.insertMany).not.toHaveBeenCalled()
    })
  })

  describe('status guard', () => {
    it('returns 409 when the outing is already ACTIVE (checked in)', async () => {
      vi.mocked(Outing.findOne).mockResolvedValue({ ...mockOuting, status: 'ACTIVE' })

      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: {},
      })
      const res = buildMockResponse()

      await OutingController.cancelOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(mockOuting.save).not.toHaveBeenCalled()
      expect(Notification.insertMany).not.toHaveBeenCalled()
    })

    it('returns 409 when the outing is already COMPLETED', async () => {
      vi.mocked(Outing.findOne).mockResolvedValue({ ...mockOuting, status: 'COMPLETED' })

      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: {},
      })
      const res = buildMockResponse()

      await OutingController.cancelOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(mockOuting.save).not.toHaveBeenCalled()
    })
  })

  describe('idempotency', () => {
    it('returns 200 without re-notifying when the outing is already CANCELLED', async () => {
      const alreadyCancelled = { ...mockOuting, status: 'CANCELLED', canceledBy: leaderId, canceledAt: new Date() }
      vi.mocked(Outing.findOne).mockResolvedValue(alreadyCancelled)
      vi.mocked(Outing.findById).mockReturnValue(buildPopulateQuery(alreadyCancelled) as any)

      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: {},
      })
      const res = buildMockResponse()

      await OutingController.cancelOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'CANCELLED' }))
      expect(mockOuting.save).not.toHaveBeenCalled()
      expect(Notification.insertMany).not.toHaveBeenCalled()
      expect(mockSession.startTransaction).not.toHaveBeenCalled()
    })

    it('is safe to call twice in a row (second call does not duplicate notifications)', async () => {
      const req1 = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: {},
      })
      const res1 = buildMockResponse()

      await OutingController.cancelOuting(req1, res1)

      expect(Notification.insertMany).toHaveBeenCalledTimes(1)

      // Second tap: outing is now CANCELLED.
      vi.mocked(Outing.findOne).mockResolvedValue({ ...mockOuting, status: 'CANCELLED' })
      vi.mocked(Outing.findById).mockReturnValue(buildPopulateQuery({ ...mockOuting, status: 'CANCELLED' }) as any)

      const req2 = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: {},
      })
      const res2 = buildMockResponse()

      await OutingController.cancelOuting(req2, res2)

      expect(res2.status).toHaveBeenCalledWith(200)
      expect(Notification.insertMany).toHaveBeenCalledTimes(1)
    })
  })
})
