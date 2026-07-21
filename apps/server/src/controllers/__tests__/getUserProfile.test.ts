import { vi, describe, it, expect, beforeEach } from 'vitest'
import { UserController } from '../../controllers/UserController'
import User from '../../models/User'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'

// Mock User model
vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
}))

describe('UserController.getUserProfile', () => {
  beforeEach(() => {
    vi.mocked(User.findById).mockReset()
  })

  describe('when user exists', () => {
    it('returns user with fullName', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        name: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        role: 'USER',
        isActive: true,
        profileComplete: true,
        birthdate: new Date('1990-01-15'),
        avatarUrl: 'https://example.com/avatar.jpg',
        toObject: vi.fn().mockReturnValue({
          _id: new Types.ObjectId(),
          name: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          role: 'USER',
          isActive: true,
          profileComplete: true,
          birthdate: new Date('1990-01-15'),
          avatarUrl: 'https://example.com/avatar.jpg',
        }),
      }
      vi.mocked(User.findById).mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
      })
      const res = buildMockResponse()

      await UserController.getUserProfile(req, res)

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'John',
          lastName: 'Doe',
          fullName: 'John Doe',
        })
      )
    })
  })

  describe('when user is not found', () => {
    it('returns 404', async () => {
      vi.mocked(User.findById).mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      } as any)

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
      })
      const res = buildMockResponse()

      await UserController.getUserProfile(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuario no encontrado',
      })
    })
  })
})

describe('UserController.updateUserProfile', () => {
  beforeEach(() => {
    vi.mocked(User.findById).mockReset()
  })

  describe('partial update', () => {
    it('only updates provided fields', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        name: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
        body: { name: 'Jane' },
      })
      const res = buildMockResponse()

      await UserController.updateUserProfile(req, res)

      expect(mockUser.name).toBe('Jane')
      expect(mockUser.lastName).toBe('Doe')
      expect(mockUser.save).toHaveBeenCalled()
      expect(res.send).toHaveBeenCalledWith('Perfil actualizado correctamente')
    })
  })

  describe('when all required fields are provided', () => {
    it('sets profileComplete to true', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        name: '',
        lastName: '',
        email: 'john@example.com',
        birthdate: undefined,
        profileComplete: false,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
        body: { name: 'John', lastName: 'Doe', birthdate: '1990-01-15' },
      })
      const res = buildMockResponse()

      await UserController.updateUserProfile(req, res)

      expect(mockUser.name).toBe('John')
      expect(mockUser.lastName).toBe('Doe')
      expect(mockUser.birthdate).toEqual(new Date('1990-01-15'))
      expect(mockUser.profileComplete).toBe(true)
      expect(mockUser.save).toHaveBeenCalled()
      expect(res.send).toHaveBeenCalledWith('Perfil actualizado correctamente')
    })
  })

  describe('when required fields are missing', () => {
    it('does not set profileComplete to true', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        name: 'John',
        lastName: '',
        email: 'john@example.com',
        birthdate: undefined,
        profileComplete: false,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
        body: { name: 'John' },
      })
      const res = buildMockResponse()

      await UserController.updateUserProfile(req, res)

      expect(mockUser.profileComplete).toBe(false)
      expect(mockUser.save).toHaveBeenCalled()
      expect(res.send).toHaveBeenCalledWith('Perfil actualizado correctamente')
    })
  })

  describe('when user is not found', () => {
    it('returns 404', async () => {
      vi.mocked(User.findById).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        body: { name: 'Jane' },
      })
      const res = buildMockResponse()

      await UserController.updateUserProfile(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuario no encontrado',
      })
    })
  })
})

describe('UserController.getUserGroups', () => {
  beforeEach(() => {
    vi.mocked(User.findById).mockReset()
  })

  describe('when user has memberships', () => {
    it('returns populated groups with role', async () => {
      const groupId = new Types.ObjectId()
      const mockUser = {
        _id: new Types.ObjectId(),
        memberships: [
          {
            group: { _id: groupId, name: 'Banda Norte', slug: 'banda-norte', avatarUrl: 'https://example.com/group.jpg' },
            role: 'ADMIN',
          },
        ],
      }
      vi.mocked(User.findById).mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockUser),
      } as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
      })
      const res = buildMockResponse()

      await UserController.getUserGroups(req, res)

      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'Banda Norte',
          slug: 'banda-norte',
          avatarUrl: 'https://example.com/group.jpg',
          role: 'ADMIN',
        }),
      ])
    })
  })

  describe('when user has no memberships', () => {
    it('returns an empty array', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        memberships: [],
      }
      vi.mocked(User.findById).mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockUser),
      } as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
      })
      const res = buildMockResponse()

      await UserController.getUserGroups(req, res)

      expect(res.json).toHaveBeenCalledWith([])
    })
  })

  describe('when user is not found', () => {
    it('returns 404', async () => {
      vi.mocked(User.findById).mockReturnValue({
        populate: vi.fn().mockResolvedValue(null),
      } as any)

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
      })
      const res = buildMockResponse()

      await UserController.getUserGroups(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuario no encontrado',
      })
    })
  })
})
