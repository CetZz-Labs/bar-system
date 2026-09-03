import { vi, describe, it, expect, beforeEach } from 'vitest'
import { GroupController } from '../../controllers/GroupController'
import Group from '../../models/Group'
import { MembershipRole } from '../../models/User'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'

vi.mock('../../models/Group', () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock('../../models/User', () => ({
  default: {},
  MembershipRole: {
    ADMIN: 'ADMIN',
    MEMBER: 'MEMBER',
    LEADER: 'LEADER',
    CO_LEADER: 'CO_LEADER',
  },
}))

function buildMockQuery(mockGroup: any) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(mockGroup),
  }
}

describe('GroupController.getGroupById', () => {
  beforeEach(() => {
    vi.mocked(Group.findById).mockReset()
  })

  describe('group not found', () => {
    it('returns 404', async () => {
      vi.mocked(Group.findById).mockReturnValue(buildMockQuery(null) as any)

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        params: { id: new Types.ObjectId().toString() },
      })
      const res = buildMockResponse()

      await GroupController.getGroupById(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ message: 'Grupo no encontrado' })
    })
  })

  describe('user is not a member', () => {
    it('returns 403', async () => {
      const outsiderId = new Types.ObjectId()
      const memberId = new Types.ObjectId()
      const mockGroup = {
        _id: new Types.ObjectId(),
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'OPEN',
        inviteCode: 'BAN4K2',
        avatarUrl: undefined,
        memberships: [
          { user: memberId, role: MembershipRole.MEMBER, joinedAt: new Date() },
        ],
      }
      vi.mocked(Group.findById).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: outsiderId } as any,
        params: { id: mockGroup._id.toString() },
      })
      const res = buildMockResponse()

      await GroupController.getGroupById(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: 'No tenés acceso a este grupo' })
    })
  })

  describe('user is a regular member', () => {
    it('returns 200 without inviteCode', async () => {
      const memberId = new Types.ObjectId()
      const leaderId = new Types.ObjectId()
      const mockGroup = {
        _id: new Types.ObjectId(),
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'OPEN',
        inviteCode: 'BAN4K2',
        avatarUrl: '/uploads/group-avatars/photo.jpg',
        memberships: [
          { user: leaderId, role: MembershipRole.LEADER, joinedAt: new Date('2024-01-01') },
          { user: memberId, role: MembershipRole.MEMBER, joinedAt: new Date('2024-02-01') },
        ],
      }
      vi.mocked(Group.findById).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: memberId } as any,
        params: { id: mockGroup._id.toString() },
      })
      const res = buildMockResponse()

      await GroupController.getGroupById(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const response = (res.json as any).mock.calls[0][0]
      expect(response.name).toBe('Los De Siempre')
      expect(response.slug).toBe('los-de-siempre')
      expect(response.type).toBe('OPEN')
      expect(response.avatarUrl).toBe('/uploads/group-avatars/photo.jpg')
      expect(response.memberCount).toBe(2)
      expect(response.inviteCode).toBeUndefined()
    })
  })

  describe('user is leader or co-leader', () => {
    it('returns 200 with inviteCode for leader', async () => {
      const leaderId = new Types.ObjectId()
      const mockGroup = {
        _id: new Types.ObjectId(),
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'OPEN',
        inviteCode: 'BAN4K2',
        avatarUrl: undefined,
        memberships: [
          { user: leaderId, role: MembershipRole.LEADER, joinedAt: new Date('2024-01-01') },
        ],
      }
      vi.mocked(Group.findById).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: leaderId } as any,
        params: { id: mockGroup._id.toString() },
      })
      const res = buildMockResponse()

      await GroupController.getGroupById(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const response = (res.json as any).mock.calls[0][0]
      expect(response.inviteCode).toBe('BAN4K2')
    })

    it('returns 200 with inviteCode for co-leader', async () => {
      const coLeaderId = new Types.ObjectId()
      const leaderId = new Types.ObjectId()
      const mockGroup = {
        _id: new Types.ObjectId(),
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'OPEN',
        inviteCode: 'BAN4K2',
        avatarUrl: undefined,
        memberships: [
          { user: leaderId, role: MembershipRole.LEADER, joinedAt: new Date('2024-01-01') },
          { user: coLeaderId, role: MembershipRole.CO_LEADER, joinedAt: new Date('2024-02-01') },
        ],
      }
      vi.mocked(Group.findById).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: coLeaderId } as any,
        params: { id: mockGroup._id.toString() },
      })
      const res = buildMockResponse()

      await GroupController.getGroupById(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const response = (res.json as any).mock.calls[0][0]
      expect(response.inviteCode).toBe('BAN4K2')
    })
  })

  describe('server error', () => {
    it('returns 500 when findById throws', async () => {
      vi.mocked(Group.findById).mockImplementation(() => {
        throw new Error('DB error')
      })

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        params: { id: new Types.ObjectId().toString() },
      })
      const res = buildMockResponse()

      await GroupController.getGroupById(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ message: 'Hubo un error al obtener el grupo' })
    })
  })
})
