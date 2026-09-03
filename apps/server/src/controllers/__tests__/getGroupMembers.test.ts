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
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(mockGroup),
  }
}

describe('GroupController.getGroupMembers', () => {
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

      await GroupController.getGroupMembers(req, res)

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
        memberships: [
          {
            user: { _id: memberId, name: 'Member', lastName: 'One', avatarUrl: undefined },
            role: MembershipRole.MEMBER,
            joinedAt: new Date(),
          },
        ],
      }
      vi.mocked(Group.findById).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: outsiderId } as any,
        params: { id: mockGroup._id.toString() },
      })
      const res = buildMockResponse()

      await GroupController.getGroupMembers(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: 'No tenés acceso a este grupo' })
    })
  })

  describe('user is a member', () => {
    it('returns 200 with the sorted members list', async () => {
      const leaderId = new Types.ObjectId()
      const memberId = new Types.ObjectId()
      const mockGroup = {
        _id: new Types.ObjectId(),
        memberships: [
          {
            user: { _id: memberId, name: 'Pedro', lastName: 'López', avatarUrl: undefined },
            role: MembershipRole.MEMBER,
            joinedAt: new Date('2024-02-01'),
          },
          {
            user: { _id: leaderId, name: 'Ana', lastName: 'García', avatarUrl: '/uploads/avatars/ana.jpg' },
            role: MembershipRole.LEADER,
            joinedAt: new Date('2024-01-01'),
          },
        ],
      }
      vi.mocked(Group.findById).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: memberId } as any,
        params: { id: mockGroup._id.toString() },
      })
      const res = buildMockResponse()

      await GroupController.getGroupMembers(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const response = (res.json as any).mock.calls[0][0]
      expect(response).toHaveLength(2)
      expect(response[0]).toEqual(
        expect.objectContaining({ name: 'Ana García', role: MembershipRole.LEADER })
      )
      expect(response[1]).toEqual(
        expect.objectContaining({ name: 'Pedro López', role: MembershipRole.MEMBER })
      )
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

      await GroupController.getGroupMembers(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ message: 'Hubo un error al obtener los miembros' })
    })
  })
})
