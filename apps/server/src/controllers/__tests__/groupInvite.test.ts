import { vi, describe, it, expect, beforeEach } from 'vitest'
import { GroupController } from '../../controllers/GroupController'
import Group from '../../models/Group'
import User, { MembershipRole } from '../../models/User'
import JoinRequest from '../../models/JoinRequest'
import GroupBan from '../../models/GroupBan'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'
import QRCode from 'qrcode'

vi.mock('../../models/Group', () => ({
  default: {
    findOne: vi.fn(),
  },
  GroupType: {
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
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

vi.mock('../../models/JoinRequest', () => ({
  default: {
    exists: vi.fn().mockResolvedValue(false),
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    }),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
  JoinRequestStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
  },
}))

vi.mock('../../models/GroupBan', () => ({
  default: {
    exists: vi.fn().mockResolvedValue(false),
  },
}))

vi.mock('qrcode', () => ({
  default: {
    toBuffer: vi.fn(),
  },
}))

function buildMockQuery(mockGroup: any) {
  return {
    populate: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(mockGroup),
  }
}

describe('GroupController.getGroupByInviteCode', () => {
  beforeEach(() => {
    vi.mocked(Group.findOne).mockReset()
    vi.mocked(JoinRequest.exists).mockReset().mockResolvedValue(false)
    vi.mocked(GroupBan.exists).mockReset().mockResolvedValue(false)
  })

  describe('happy path', () => {
    it('returns public group info by invite code', async () => {
      const mockGroup = {
        _id: new Types.ObjectId(),
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'OPEN',
        description: 'Banda de rock',
        avatarUrl: '/uploads/group-avatars/photo.jpg',
        inviteCode: 'BAN4K2',
        memberships: [
          { user: new Types.ObjectId(), role: MembershipRole.LEADER, joinedAt: new Date() },
          { user: new Types.ObjectId(), role: MembershipRole.MEMBER, joinedAt: new Date() },
        ],
      }
      vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        params: { inviteCode: 'BAN4K2' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupByInviteCode(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Los De Siempre',
          slug: 'los-de-siempre',
          type: 'OPEN',
          description: 'Banda de rock',
          avatarUrl: '/uploads/group-avatars/photo.jpg',
          memberCount: 2,
          inviteCode: 'BAN4K2',
        })
      )
    })
  })

  describe('group not found', () => {
    it('returns 404', async () => {
      vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(null) as any)

      const req = buildMockRequest({
        params: { inviteCode: 'NOEXIST' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupByInviteCode(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ message: 'Grupo no encontrado' })
    })
  })

  describe('server error', () => {
    it('returns 500 when findOne throws', async () => {
      vi.mocked(Group.findOne).mockImplementation(() => {
        throw new Error('DB error')
      })

      const req = buildMockRequest({
        params: { inviteCode: 'BAN4K2' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupByInviteCode(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ message: 'Hubo un error al obtener el grupo' })
    })
  })
})

describe('GroupController.joinGroup', () => {
  beforeEach(() => {
    vi.mocked(Group.findOne).mockReset()
    vi.mocked(User.findById).mockReset()
    vi.mocked(JoinRequest.exists).mockReset().mockResolvedValue(false)
    vi.mocked(GroupBan.exists).mockReset().mockResolvedValue(false)
  })

  describe('happy path', () => {
    it('adds user as member to the group', async () => {
      const userId = new Types.ObjectId()
      const groupId = new Types.ObjectId()

      const mockGroup = {
        _id: groupId,
        name: 'Los De Siempre',
        slug: 'los-de-siempre',
        type: 'OPEN',
        inviteCode: 'BAN4K2',
        memberships: [],
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(Group.findOne).mockResolvedValue(mockGroup as any)

      const mockUser = {
        _id: userId,
        memberships: [],
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: { inviteCode: 'BAN4K2' },
      })
      const res = buildMockResponse()

      await GroupController.joinGroup(req, res)

      expect(mockGroup.memberships).toHaveLength(1)
      expect(mockGroup.memberships[0].user.toString()).toBe(userId.toString())
      expect(mockGroup.memberships[0].role).toBe(MembershipRole.MEMBER)

      expect(mockUser.memberships).toHaveLength(1)
      expect(mockUser.memberships[0].group.toString()).toBe(groupId.toString())
      expect(mockUser.memberships[0].role).toBe(MembershipRole.MEMBER)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Te uniste al grupo exitosamente',
          group: expect.objectContaining({
            name: 'Los De Siempre',
            slug: 'los-de-siempre',
          }),
        })
      )
    })
  })

  describe('group not found', () => {
    it('returns 404', async () => {
      vi.mocked(Group.findOne).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        body: { inviteCode: 'NOEXIST' },
      })
      const res = buildMockResponse()

      await GroupController.joinGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ message: 'Grupo no encontrado' })
    })
  })

  describe('user is already a member', () => {
    it('returns 409', async () => {
      const userId = new Types.ObjectId()

      const mockGroup = {
        _id: new Types.ObjectId(),
        type: 'OPEN',
        inviteCode: 'BAN4K2',
        memberships: [
          { user: userId, role: MembershipRole.MEMBER, joinedAt: new Date() },
        ],
        save: vi.fn(),
      }
      vi.mocked(Group.findOne).mockResolvedValue(mockGroup as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: { inviteCode: 'BAN4K2' },
      })
      const res = buildMockResponse()

      await GroupController.joinGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith({ message: 'Ya sos parte de este grupo' })
      expect(mockGroup.save).not.toHaveBeenCalled()
    })
  })

  describe('user not found', () => {
    it('returns 404', async () => {
      const userId = new Types.ObjectId()

      const mockGroup = {
        _id: new Types.ObjectId(),
        type: 'OPEN',
        inviteCode: 'BAN4K2',
        memberships: [],
        save: vi.fn(),
      }
      vi.mocked(Group.findOne).mockResolvedValue(mockGroup as any)
      vi.mocked(User.findById).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: { inviteCode: 'BAN4K2' },
      })
      const res = buildMockResponse()

      await GroupController.joinGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ message: 'Usuario no encontrado' })
    })
  })

  describe('save failure', () => {
    it('returns 500 when group save fails', async () => {
      const userId = new Types.ObjectId()

      const mockGroup = {
        _id: new Types.ObjectId(),
        type: 'OPEN',
        inviteCode: 'BAN4K2',
        memberships: [],
        save: vi.fn().mockRejectedValue(new Error('Save failed')),
      }
      vi.mocked(Group.findOne).mockResolvedValue(mockGroup as any)

      const mockUser = {
        _id: userId,
        memberships: [],
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: { inviteCode: 'BAN4K2' },
      })
      const res = buildMockResponse()

      await GroupController.joinGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ message: 'Hubo un error al unirte al grupo' })
    })
  })

  describe('server error', () => {
    it('returns 500 when findOne throws', async () => {
      vi.mocked(Group.findOne).mockImplementation(() => {
        throw new Error('DB error')
      })

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        body: { inviteCode: 'BAN4K2' },
      })
      const res = buildMockResponse()

      await GroupController.joinGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ message: 'Hubo un error al unirte al grupo' })
    })
  })
})

describe('GroupController.getGroupQR', () => {
  beforeEach(() => {
    vi.mocked(Group.findOne).mockReset()
    vi.mocked(QRCode.toBuffer).mockReset()
  })

  describe('happy path', () => {
    it('returns QR image as PNG buffer', async () => {
      const userId = new Types.ObjectId()
      const qrBuffer = Buffer.from('fake-qr-image')

      const mockGroup = {
        _id: new Types.ObjectId(),
        inviteCode: 'BAN4K2',
        memberships: [
          { user: userId, role: MembershipRole.MEMBER, joinedAt: new Date() },
        ],
      }
      vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)
      vi.mocked(QRCode.toBuffer).mockResolvedValue(qrBuffer)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        params: { slug: 'los-de-siempre' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupQR(req, res)

      expect(QRCode.toBuffer).toHaveBeenCalledWith('https://labanda.app/unirse/BAN4K2', {
        type: 'png',
        width: 512,
        margin: 2,
      })
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png')
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', qrBuffer.length)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.send).toHaveBeenCalledWith(qrBuffer)
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

      await GroupController.getGroupQR(req, res)

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
        inviteCode: 'BAN4K2',
        memberships: [
          { user: memberId, role: MembershipRole.MEMBER, joinedAt: new Date() },
        ],
      }
      vi.mocked(Group.findOne).mockReturnValue(buildMockQuery(mockGroup) as any)

      const req = buildMockRequest({
        user: { _id: outsiderId } as any,
        params: { slug: 'los-de-siempre' },
      })
      const res = buildMockResponse()

      await GroupController.getGroupQR(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: 'No tenés acceso a este grupo' })
      expect(QRCode.toBuffer).not.toHaveBeenCalled()
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

      await GroupController.getGroupQR(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ message: 'Hubo un error al generar el QR' })
    })
  })
})
