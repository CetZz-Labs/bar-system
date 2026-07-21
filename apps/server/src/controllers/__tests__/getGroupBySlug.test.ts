import { vi, describe, it, expect, beforeEach } from 'vitest'
import { GroupController } from '../../controllers/GroupController'
import Group from '../../models/Group'
import JoinRequest from '../../models/JoinRequest'
import { MembershipRole } from '../../models/User'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'

vi.mock('../../models/Group', () => ({
  default: {
    findOne: vi.fn(),
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

vi.mock('../../models/JoinRequest', () => ({
  default: {
    countDocuments: vi.fn().mockResolvedValue(0),
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    }),
  },
  JoinRequestStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
  },
}))

function buildMockQuery(mockGroup: any) {
  return {
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(mockGroup),
  }
}

describe('GroupController.getGroupBySlug', () => {
  beforeEach(() => {
    vi.mocked(Group.findOne).mockReset()
    vi.mocked(JoinRequest.countDocuments).mockReset().mockResolvedValue(0)
  })

  describe('happy path as leader', () => {
    it('returns group with inviteCode, inviteLink and canManage=true', async () => {
      const userId = new Types.ObjectId()
      const mockGroup = {
        _id: new Types.ObjectId(),
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'OPEN',
        description: 'Banda de rock',
        avatarUrl: '/uploads/group-avatars/photo.jpg',
        inviteCode: 'BAN4K2',
        memberships: [
          {
            user: { _id: userId, name: 'Juan', lastName: 'Pérez', avatarUrl: '/uploads/avatars/juan.jpg' },
            role: MembershipRole.LEADER,
            joinedAt: new Date('2024-01-01'),
          },
        ],
      }
      vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        params: { slug: 'los-de-siempre' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupBySlug(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Los De Siempre',
          slug: 'los-de-siempre',
          type: 'OPEN',
          description: 'Banda de rock',
          avatarUrl: '/uploads/group-avatars/photo.jpg',
          memberCount: 1,
          inviteCode: 'BAN4K2',
          inviteLink: 'labanda.app/unirse/BAN4K2',
          canManage: true,
          currentUserRole: MembershipRole.LEADER,
          members: [
            expect.objectContaining({
              name: 'Juan Pérez',
              role: MembershipRole.LEADER,
            }),
          ],
        })
      )
    })
  })

  describe('happy path as co-leader', () => {
    it('returns inviteCode and inviteLink but canManage=false', async () => {
      const coLeaderId = new Types.ObjectId()
      const leaderId = new Types.ObjectId()
      const mockGroup = {
        _id: new Types.ObjectId(),
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'CLOSED',
        inviteCode: 'COLEAD',
        memberships: [
          {
            user: { _id: leaderId, name: 'Ana', lastName: 'García', avatarUrl: undefined },
            role: MembershipRole.LEADER,
            joinedAt: new Date('2024-01-01'),
          },
          {
            user: { _id: coLeaderId, name: 'Luis', lastName: 'Torres', avatarUrl: undefined },
            role: MembershipRole.CO_LEADER,
            joinedAt: new Date('2024-02-01'),
          },
        ],
      }
      vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: coLeaderId } as any,
        params: { slug: 'los-de-siempre' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupBySlug(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const response = (res.json as any).mock.calls[0][0]
      expect(response.inviteCode).toBe('COLEAD')
      expect(response.inviteLink).toBe('labanda.app/unirse/COLEAD')
      expect(response.canManage).toBe(false)
      expect(response.currentUserRole).toBe(MembershipRole.CO_LEADER)
    })
  })

  describe('happy path as regular member', () => {
    it('does not return inviteCode or inviteLink', async () => {
      const memberId = new Types.ObjectId()
      const leaderId = new Types.ObjectId()
      const mockGroup = {
        _id: new Types.ObjectId(),
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'OPEN',
        inviteCode: 'BAN4K2',
        memberships: [
          {
            user: { _id: leaderId, name: 'Ana', lastName: 'García', avatarUrl: undefined },
            role: MembershipRole.LEADER,
            joinedAt: new Date('2024-01-01'),
          },
          {
            user: { _id: memberId, name: 'Pedro', lastName: 'López', avatarUrl: undefined },
            role: MembershipRole.MEMBER,
            joinedAt: new Date('2024-03-01'),
          },
        ],
      }
      vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: memberId } as any,
        params: { slug: 'los-de-siempre' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupBySlug(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const response = (res.json as any).mock.calls[0][0]
      expect(response.inviteCode).toBeUndefined()
      expect(response.inviteLink).toBeUndefined()
      expect(response.canManage).toBe(false)
      expect(response.currentUserRole).toBe(MembershipRole.MEMBER)
    })
  })

  describe('member ordering', () => {
    it('orders members by role priority then joinedAt', async () => {
      const userId = new Types.ObjectId()
      const leaderId = new Types.ObjectId()
      const coLeader1Id = new Types.ObjectId()
      const coLeader2Id = new Types.ObjectId()
      const member1Id = new Types.ObjectId()
      const member2Id = new Types.ObjectId()

      const mockGroup = {
        _id: new Types.ObjectId(),
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'OPEN',
        inviteCode: 'ORDER1',
        memberships: [
          {
            user: { _id: member2Id, name: 'M2', lastName: 'A', avatarUrl: undefined },
            role: MembershipRole.MEMBER,
            joinedAt: new Date('2024-04-01'),
          },
          {
            user: { _id: coLeader2Id, name: 'C2', lastName: 'A', avatarUrl: undefined },
            role: MembershipRole.CO_LEADER,
            joinedAt: new Date('2024-03-01'),
          },
          {
            user: { _id: leaderId, name: 'Leader', lastName: 'A', avatarUrl: undefined },
            role: MembershipRole.LEADER,
            joinedAt: new Date('2024-05-01'),
          },
          {
            user: { _id: member1Id, name: 'M1', lastName: 'A', avatarUrl: undefined },
            role: MembershipRole.MEMBER,
            joinedAt: new Date('2024-02-01'),
          },
          {
            user: { _id: coLeader1Id, name: 'C1', lastName: 'A', avatarUrl: undefined },
            role: MembershipRole.CO_LEADER,
            joinedAt: new Date('2024-01-01'),
          },
          {
            user: { _id: userId, name: 'Viewer', lastName: 'A', avatarUrl: undefined },
            role: MembershipRole.MEMBER,
            joinedAt: new Date('2024-06-01'),
          },
        ],
      }
      vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        params: { slug: 'los-de-siempre' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupBySlug(req, res)

      const response = (res.json as any).mock.calls[0][0]
      const memberNames = response.members.map((m: any) => m.name)
      expect(memberNames).toEqual([
        'Leader A',
        'C1 A',
        'C2 A',
        'M1 A',
        'M2 A',
        'Viewer A',
      ])
    })
  })

  describe('group not found', () => {
    it('returns 404', async () => {
      vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(null) as any)

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        params: { slug: 'no-existe' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupBySlug(req, res)

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
        memberships: [
          {
            user: { _id: memberId, name: 'Member', lastName: 'One', avatarUrl: undefined },
            role: MembershipRole.MEMBER,
            joinedAt: new Date(),
          },
        ],
      }
      vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: outsiderId } as any,
        params: { slug: 'los-de-siempre' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupBySlug(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: 'No tenés acceso a este grupo' })
    })
  })

  describe('server error', () => {
    it('returns 500 when findOne throws', async () => {
      vi.mocked(Group.findOne).mockImplementation(() => {
        throw new Error('DB error')
      })

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        params: { slug: 'los-de-siempre' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupBySlug(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ message: 'Hubo un error al obtener el grupo' })
    })
  })
})
