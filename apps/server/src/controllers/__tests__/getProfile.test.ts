import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuthController } from '../../controllers/AuthController'
import User from '../../models/User'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'

// Mock User model
vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
}))

describe('AuthController.getProfile', () => {
  beforeEach(() => {
    vi.mocked(User.findById).mockReset()
  })

  describe('when user has a profile', () => {
    it('returns 200 with user and profile data', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        name: 'Juan',
        lastName: 'Perez',
        email: 'juan@example.com',
        role: 'USER',
        isActive: true,
        profileComplete: true,
        birthdate: new Date('1990-01-15'),
        avatarUrl: 'https://example.com/avatar.jpg',
      }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
      })
      const res = buildMockResponse()

      await AuthController.getProfile(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        user: mockUser,
        profile: {
          fullName: 'Juan Perez',
          birthdate: mockUser.birthdate,
          avatarUrl: mockUser.avatarUrl,
        },
      })
    })
  })

  describe('when user does not have a profile', () => {
    it('returns 200 with user and profile: null', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        name: 'Juan',
        lastName: 'Perez',
        email: 'juan@example.com',
        role: 'USER',
        isActive: true,
        profileComplete: false,
        birthdate: undefined,
        avatarUrl: undefined,
      }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
      })
      const res = buildMockResponse()

      await AuthController.getProfile(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        user: mockUser,
        profile: null,
      })
    })
  })

  describe('when user is not found', () => {
    it('returns 404', async () => {
      const mockSelect = vi.fn().mockResolvedValue(null)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
      })
      const res = buildMockResponse()

      await AuthController.getProfile(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuario no encontrado',
      })
    })
  })
})
