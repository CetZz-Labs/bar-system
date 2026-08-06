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

describe('OutingController.updateOuting', () => {
  let leaderId: Types.ObjectId
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
    memberId1 = new Types.ObjectId()
    groupId = new Types.ObjectId()
    barId = new Types.ObjectId()
    outingId = new Types.ObjectId()

    mockGroup = {
      _id: groupId,
      leader: leaderId,
      memberships: [
        { user: leaderId, role: MembershipRole.LEADER, joinedAt: new Date() },
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
      invitees: [leaderId, memberId1],
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
      save: vi.fn().mockResolvedValue(true),
    }

    mockSession = buildMockSession()

    vi.mocked(mongoose.startSession).mockReset().mockResolvedValue(mockSession as any)
    vi.mocked(Group.findById).mockReset().mockReturnValue(buildLeanQuery(mockGroup) as any)
    vi.mocked(Bar.findById).mockReset().mockReturnValue(buildLeanQuery(mockBar) as any)
    vi.mocked(Outing.findOne).mockReset().mockResolvedValue(mockOuting)
    vi.mocked(Outing.findById).mockReset().mockReturnValue(buildPopulateQuery({ ...mockOuting }) as any)
    vi.mocked(Notification.insertMany).mockReset().mockResolvedValue(true as any)
  })

  function validScheduledFor() {
    return new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
  }

  describe('happy path', () => {
    it('updates the outing and returns 200', async () => {
      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: { note: 'Nueva nota', scheduledFor: validScheduledFor() },
      })
      const res = buildMockResponse()

      await OutingController.updateOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockOuting.save).toHaveBeenCalled()
      expect(mockOuting.note).toBe('Nueva nota')
      expect(mockSession.commitTransaction).toHaveBeenCalled()
    })

    it('creates OUTING_UPDATED notifications for current invitees', async () => {
      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: { note: 'Nueva nota' },
      })
      const res = buildMockResponse()

      await OutingController.updateOuting(req, res)

      expect(Notification.insertMany).toHaveBeenCalledTimes(1)
      const notifications = vi.mocked(Notification.insertMany).mock.calls[0][0] as any[]
      expect(notifications.every((n) => n.type === 'OUTING_UPDATED')).toBe(true)
    })
  })

  describe('authorization', () => {
    it('returns 403 when the user is not leader/co-leader', async () => {
      const req = buildMockRequest({
        user: { _id: memberId1 } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: { note: 'Intento no autorizado' },
      })
      const res = buildMockResponse()

      await OutingController.updateOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(mockOuting.save).not.toHaveBeenCalled()
    })
  })

  describe('status guard', () => {
    it('returns 409 when the outing is no longer PENDING', async () => {
      vi.mocked(Outing.findOne).mockResolvedValue({ ...mockOuting, status: 'ACTIVE' })

      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString(), outingId: outingId.toString() },
        body: { note: 'Ya empezó' },
      })
      const res = buildMockResponse()

      await OutingController.updateOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(mockOuting.save).not.toHaveBeenCalled()
    })
  })
})
