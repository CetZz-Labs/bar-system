import { vi, describe, it, expect, beforeEach } from 'vitest'
import { GroupController } from '../../controllers/GroupController'
import Group from '../../models/Group'
import User, { MembershipRole } from '../../models/User'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'
import sharp from 'sharp'
import { saveGroupAvatar } from '../../utils/storage'

let lastCreatedGroup: any = null

// Mock Group model
vi.mock('../../models/Group', () => {
  const mockSave = vi.fn().mockResolvedValue(true)
  const mockDeleteOne = vi.fn().mockResolvedValue(true)

  function MockGroup(data: any) {
    const instance = {
      ...data,
      _id: new Types.ObjectId(),
      slug: 'test-group-ab12',
      inviteCode: 'ABC123',
      save: mockSave,
      deleteOne: mockDeleteOne,
    }
    lastCreatedGroup = instance
    return instance
  }

  MockGroup.findOne = vi.fn()

  return {
    default: MockGroup,
  }
})

// Mock User model
vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
  MembershipRole: {
    ADMIN: 'ADMIN',
    MEMBER: 'MEMBER',
    LEADER: 'LEADER',
  },
}))

// Mock sharp
vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('resized-image')),
  })),
}))

// Mock saveGroupAvatar
vi.mock('../../utils/storage', () => ({
  saveGroupAvatar: vi.fn().mockResolvedValue('/uploads/group-avatars/test-file.jpg'),
}))

describe('GroupController.createGroup', () => {
  beforeEach(() => {
    vi.mocked(Group.findOne).mockReset()
    vi.mocked(User.findById).mockReset()
    vi.mocked(saveGroupAvatar).mockClear()
    vi.mocked(sharp).mockClear()
    lastCreatedGroup = null
  })

  describe('happy path without photo', () => {
    it('returns 201 with group object containing slug and inviteCode', async () => {
      const userId = new Types.ObjectId()
      const mockUser = {
        _id: userId,
        memberships: [],
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)
      vi.mocked(Group.findOne).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'Los De Siempre',
          type: 'OPEN',
          description: 'Un grupo de prueba',
        },
      })
      const res = buildMockResponse()

      await GroupController.createGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'test-group-ab12',
          inviteCode: 'ABC123',
        })
      )
    })
  })

  describe('happy path with photo', () => {
    it('calls sharp and uploadToSupabase and sets avatarUrl', async () => {
      const userId = new Types.ObjectId()
      const mockUser = {
        _id: userId,
        memberships: [],
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)
      vi.mocked(Group.findOne).mockResolvedValue(null)

      const fileBuffer = Buffer.from('fake-image-data')
      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'Los De Siempre',
          type: 'CLOSED',
        },
        file: {
          buffer: fileBuffer,
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
        } as any,
      })
      const res = buildMockResponse()

      await GroupController.createGroup(req, res)

      expect(sharp).toHaveBeenCalledWith(fileBuffer)
      expect(saveGroupAvatar).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarUrl: '/uploads/group-avatars/test-file.jpg',
        })
      )
    })
  })

  describe('validation error: name too short', () => {
    it('returns 400', async () => {
      const userId = new Types.ObjectId()
      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'ab',
          type: 'OPEN',
        },
      })
      const res = buildMockResponse()

      await GroupController.createGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'El nombre debe tener entre 3 y 40 caracteres alfanuméricos, espacios y guiones',
      })
    })
  })

  describe('validation error: invalid characters in name', () => {
    it('returns 400', async () => {
      const userId = new Types.ObjectId()
      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'Los@De#Siempre!',
          type: 'OPEN',
        },
      })
      const res = buildMockResponse()

      await GroupController.createGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'El nombre debe tener entre 3 y 40 caracteres alfanuméricos, espacios y guiones',
      })
    })
  })

  describe('validation error: description too long', () => {
    it('returns 400', async () => {
      const userId = new Types.ObjectId()
      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'Los De Siempre',
          type: 'OPEN',
          description: 'a'.repeat(121),
        },
      })
      const res = buildMockResponse()

      await GroupController.createGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'La descripción no puede superar los 120 caracteres',
      })
    })
  })

  describe('business error: duplicate name (case-insensitive)', () => {
    it('returns 409', async () => {
      const userId = new Types.ObjectId()
      const mockUser = {
        _id: userId,
        memberships: [],
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)
      vi.mocked(Group.findOne).mockResolvedValue({ _id: new Types.ObjectId() } as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'los de siempre',
          type: 'OPEN',
        },
      })
      const res = buildMockResponse()

      await GroupController.createGroup(req, res)

      expect(Group.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.objectContaining({
            $regex: expect.any(RegExp),
          }),
        })
      )
      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Ya existe un grupo con ese nombre',
      })
    })
  })

  describe('business error: leader limit exceeded (4th group)', () => {
    it('returns 403', async () => {
      const userId = new Types.ObjectId()
      const mockUser = {
        _id: userId,
        memberships: [
          { group: new Types.ObjectId(), role: MembershipRole.LEADER },
          { group: new Types.ObjectId(), role: MembershipRole.LEADER },
          { group: new Types.ObjectId(), role: MembershipRole.LEADER },
        ],
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'Los De Siempre',
          type: 'OPEN',
        },
      })
      const res = buildMockResponse()

      await GroupController.createGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        message: 'No podés liderar más de 3 grupos',
      })
    })
  })

  describe('business error: total membership limit exceeded (4 groups)', () => {
    it('returns 403', async () => {
      const userId = new Types.ObjectId()
      const mockUser = {
        _id: userId,
        memberships: [
          { group: new Types.ObjectId(), role: MembershipRole.MEMBER },
          { group: new Types.ObjectId(), role: MembershipRole.MEMBER },
          { group: new Types.ObjectId(), role: MembershipRole.MEMBER },
          { group: new Types.ObjectId(), role: MembershipRole.MEMBER },
        ],
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'Los De Siempre',
          type: 'OPEN',
        },
      })
      const res = buildMockResponse()

      await GroupController.createGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        message: 'No podés estar en más de 4 grupos al mismo tiempo',
      })
    })
  })

  describe('photo error: file too large', () => {
    it('returns 400', async () => {
      const userId = new Types.ObjectId()
      const mockUser = {
        _id: userId,
        memberships: [],
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)
      vi.mocked(Group.findOne).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'Los De Siempre',
          type: 'OPEN',
        },
        file: {
          buffer: Buffer.alloc(3 * 1024 * 1024),
          originalname: 'large.jpg',
          mimetype: 'image/jpeg',
          size: 3 * 1024 * 1024,
        } as any,
      })
      const res = buildMockResponse()

      await GroupController.createGroup(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'El archivo supera el límite de 2 MB',
      })
    })
  })

  describe('server error: user save fails after group created', () => {
    it('returns 500 and deletes the group', async () => {
      const userId = new Types.ObjectId()
      const mockUser = {
        _id: userId,
        memberships: [],
        save: vi.fn().mockRejectedValue(new Error('Save failed')),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)
      vi.mocked(Group.findOne).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'Los De Siempre',
          type: 'OPEN',
        },
      })
      const res = buildMockResponse()

      await GroupController.createGroup(req, res)

      expect(lastCreatedGroup).not.toBeNull()
      expect(lastCreatedGroup.deleteOne).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Hubo un error al crear el grupo',
      })
    })
  })
})
