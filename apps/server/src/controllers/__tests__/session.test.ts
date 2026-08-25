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

describe('AuthController.session', () => {
  beforeEach(() => {
    vi.mocked(User.findById).mockReset()
  })

  describe('when user has profileComplete = true', () => {
    it('returns user data with profileComplete: true', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        name: 'Juan',
        lastName: 'Perez',
        email: 'juan@example.com',
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

      await AuthController.session(req, res)

      expect(res.json).toHaveBeenCalledWith(mockUser)
      expect(mockSelect).toHaveBeenCalledWith('_id name lastName email isActive profileComplete birthdate avatarUrl')
    })
  })

  describe('when user has profileComplete = false', () => {
    it('returns user data with profileComplete: false', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        name: 'Juan',
        lastName: 'Perez',
        email: 'juan@example.com',
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

      await AuthController.session(req, res)

      expect(res.json).toHaveBeenCalledWith(mockUser)
      expect(mockUser.profileComplete).toBe(false)
    })
  })
})
