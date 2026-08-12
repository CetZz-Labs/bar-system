import { vi, describe, it, expect, beforeEach } from 'vitest'
import { OutingController } from '../../controllers/OutingController'
import Outing from '../../models/Outing'
import Notification from '../../models/Notification'
import Group from '../../models/Group'
import Bar from '../../models/Bar'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'
import mongoose from 'mongoose'
import { ATTENDANCE_POINTS_DAY_KEYS } from '../../models/Bar'
import { getBarDayOfWeek } from '../../utils/barDay'

vi.mock('../../models/Outing', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
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
  ATTENDANCE_POINTS_DAY_KEYS: [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  ],
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

describe('OutingController.createOuting', () => {
  let leaderId: Types.ObjectId
  let coLeaderId: Types.ObjectId
  let memberId1: Types.ObjectId
  let memberId2: Types.ObjectId
  let groupId: Types.ObjectId
  let barId: Types.ObjectId
  let mockGroup: any
  let mockBar: any
  let mockSession: ReturnType<typeof buildMockSession>

  beforeEach(() => {
    leaderId = new Types.ObjectId()
    coLeaderId = new Types.ObjectId()
    memberId1 = new Types.ObjectId()
    memberId2 = new Types.ObjectId()
    groupId = new Types.ObjectId()
    barId = new Types.ObjectId()

    mockGroup = {
      _id: groupId,
      leader: leaderId,
      memberships: [
        { user: leaderId, role: MembershipRole.LEADER, joinedAt: new Date() },
        { user: coLeaderId, role: MembershipRole.CO_LEADER, joinedAt: new Date() },
        { user: memberId1, role: MembershipRole.MEMBER, joinedAt: new Date() },
        { user: memberId2, role: MembershipRole.MEMBER, joinedAt: new Date() },
      ],
    }

    mockBar = {
      _id: barId,
      name: 'Bar de Prueba',
      status: 'active',
      closingTime: '06:00',
      attendancePointsByDay: {
        sunday: 10,
        monday: 20,
        tuesday: 30,
        wednesday: 40,
        thursday: 50,
        friday: 60,
        saturday: 70,
      },
    }

    mockSession = buildMockSession()

    vi.mocked(mongoose.startSession).mockReset().mockResolvedValue(mockSession as any)
    vi.mocked(Group.findById).mockReset().mockReturnValue(buildLeanQuery(mockGroup) as any)
    vi.mocked(Bar.findById).mockReset().mockReturnValue(buildLeanQuery(mockBar) as any)
    vi.mocked(Outing.findOne).mockReset().mockResolvedValue(null)
    vi.mocked(Outing.create).mockReset()
    vi.mocked(Outing.findById).mockReset()
    vi.mocked(Notification.insertMany).mockReset().mockResolvedValue(true as any)
  })

  function mockCreatedOuting(overrides: any = {}) {
    const outingId = new Types.ObjectId()
    const created = {
      _id: outingId,
      group: groupId,
      bar: barId,
      createdBy: leaderId,
      status: 'PENDING',
      invitees: [],
      ...overrides,
    }
    vi.mocked(Outing.create).mockResolvedValue([created] as any)
    vi.mocked(Outing.findById).mockReturnValue(buildPopulateQuery({ ...created }) as any)
    return created
  }

  function validScheduledFor() {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }

  describe('happy path with default invitees (all members)', () => {
    it('returns 201 and includes every group member as invitee', async () => {
      mockCreatedOuting()

      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor: validScheduledFor(),
          note: 'Vamos con todo el grupo',
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      const createCallArgs = vi.mocked(Outing.create).mock.calls[0][0] as any[]
      const invitees = createCallArgs[0].invitees as string[]

      expect(invitees).toEqual(
        expect.arrayContaining([
          leaderId.toString(),
          coLeaderId.toString(),
          memberId1.toString(),
          memberId2.toString(),
        ])
      )
      expect(invitees).toHaveLength(4)
      expect(mockSession.commitTransaction).toHaveBeenCalled()
    })

    it('creates a notification for every invitee', async () => {
      mockCreatedOuting()

      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor: validScheduledFor(),
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      expect(Notification.insertMany).toHaveBeenCalledTimes(1)
      const notifications = vi.mocked(Notification.insertMany).mock.calls[0][0] as any[]
      expect(notifications).toHaveLength(4)
      expect(notifications.every((n) => n.type === 'OUTING_CREATED')).toBe(true)
    })
  })

  describe('happy path with selected invitees', () => {
    it('forces the group leader and the creator into invitees even if excluded', async () => {
      mockCreatedOuting()

      const req = buildMockRequest({
        user: { _id: coLeaderId } as any, // co-leader creates the outing
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor: validScheduledFor(),
          inviteeIds: [memberId1.toString()], // deliberately excludes leader and creator
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      const createCallArgs = vi.mocked(Outing.create).mock.calls[0][0] as any[]
      const invitees = createCallArgs[0].invitees as string[]

      expect(invitees).toEqual(
        expect.arrayContaining([leaderId.toString(), coLeaderId.toString(), memberId1.toString()])
      )
      expect(invitees).not.toContain(memberId2.toString())
    })
  })

  describe('authorization', () => {
    it('returns 403 when the user is a regular member (not leader/co-leader)', async () => {
      const req = buildMockRequest({
        user: { _id: memberId1 } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor: validScheduledFor(),
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(Outing.create).not.toHaveBeenCalled()
    })

    it('returns 403 when the user is not a member of the group at all', async () => {
      const outsiderId = new Types.ObjectId()
      const req = buildMockRequest({
        user: { _id: outsiderId } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor: validScheduledFor(),
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
    })
  })

  describe('bar validation', () => {
    it('returns 400 when the bar is not active', async () => {
      vi.mocked(Bar.findById).mockReturnValue(buildLeanQuery({ _id: barId, name: 'Bar Pendiente', status: 'pending' }) as any)

      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor: validScheduledFor(),
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(Outing.create).not.toHaveBeenCalled()
    })

    it('returns 400 when the bar does not exist', async () => {
      vi.mocked(Bar.findById).mockReturnValue(buildLeanQuery(null) as any)

      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: new Types.ObjectId().toString(),
          scheduledFor: validScheduledFor(),
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe('date validation', () => {
    it('returns 400 when scheduledFor is in the past', async () => {
      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(Outing.create).not.toHaveBeenCalled()
    })

    it('returns 400 when scheduledFor is more than 30 days in the future', async () => {
      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(Outing.create).not.toHaveBeenCalled()
    })
  })

  describe('note validation', () => {
    it('returns 400 when note exceeds 200 characters', async () => {
      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor: validScheduledFor(),
          note: 'a'.repeat(201),
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(Outing.create).not.toHaveBeenCalled()
    })
  })

  describe('active outing conflict', () => {
    it('returns 409 with the existing outing id when the group already has an active outing', async () => {
      const existingOutingId = new Types.ObjectId()
      vi.mocked(Outing.findOne).mockResolvedValue({ _id: existingOutingId } as any)

      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor: validScheduledFor(),
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          existingOutingId,
        })
      )
      expect(Outing.create).not.toHaveBeenCalled()
      expect(mockSession.abortTransaction).toHaveBeenCalled()
    })
  })

  describe('attendance points snapshot (LB-59)', () => {
    it('snapshots bar.attendancePointsByDay for the bar-day of scheduledFor at creation time', async () => {
      mockCreatedOuting()

      const scheduledFor = validScheduledFor()
      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor,
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      const expectedDayIndex = getBarDayOfWeek(new Date(scheduledFor), mockBar.closingTime)
      const expectedKey = ATTENDANCE_POINTS_DAY_KEYS[expectedDayIndex] as keyof typeof mockBar.attendancePointsByDay
      const expectedSnapshot = mockBar.attendancePointsByDay[expectedKey]

      const createCallArgs = vi.mocked(Outing.create).mock.calls[0][0] as any[]
      expect(createCallArgs[0].attendancePointsSnapshot).toBe(expectedSnapshot)
    })

    it('falls back to 0 when the bar has no attendancePointsByDay configured (legacy bar)', async () => {
      mockCreatedOuting()
      vi.mocked(Bar.findById).mockReturnValue(buildLeanQuery({ ...mockBar, attendancePointsByDay: undefined }) as any)

      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: {
          barId: barId.toString(),
          scheduledFor: validScheduledFor(),
        },
      })
      const res = buildMockResponse()

      await OutingController.createOuting(req, res)

      const createCallArgs = vi.mocked(Outing.create).mock.calls[0][0] as any[]
      expect(createCallArgs[0].attendancePointsSnapshot).toBe(0)
    })

    it('each outing snapshots the bar config in effect at its own creation time (later edits do not retroactively change a past snapshot)', async () => {
      const scheduledFor = validScheduledFor()
      const expectedDayIndex = getBarDayOfWeek(new Date(scheduledFor), mockBar.closingTime)
      const expectedKey = ATTENDANCE_POINTS_DAY_KEYS[expectedDayIndex] as keyof typeof mockBar.attendancePointsByDay

      // First outing: created while the config for that day is its original value.
      mockCreatedOuting()
      const req1 = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: { barId: barId.toString(), scheduledFor },
      })
      await OutingController.createOuting(req1, buildMockResponse())
      const firstSnapshot = (vi.mocked(Outing.create).mock.calls[0][0] as any[])[0].attendancePointsSnapshot

      // The OWNER edits the bar's config for that same day (simulates a PATCH
      // to /bar/:id/perfil between the two outings).
      mockBar.attendancePointsByDay[expectedKey] = firstSnapshot + 999
      vi.mocked(Outing.create).mockClear()

      // Second outing: created after the edit, for the same weekday.
      mockCreatedOuting()
      const req2 = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { groupId: groupId.toString() },
        body: { barId: barId.toString(), scheduledFor },
      })
      await OutingController.createOuting(req2, buildMockResponse())
      const secondSnapshot = (vi.mocked(Outing.create).mock.calls[0][0] as any[])[0].attendancePointsSnapshot

      // The first outing's already-persisted snapshot is a plain number
      // written to Mongo, immune to the later config edit; the second
      // reflects the new live value at its own creation time.
      expect(firstSnapshot).not.toBe(secondSnapshot)
      expect(secondSnapshot).toBe(firstSnapshot + 999)
    })
  })
})
