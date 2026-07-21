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

describe('Onboarding Flow Integration', () => {
  beforeEach(() => {
    vi.mocked(User.findById).mockReset()
  })

  describe('complete onboarding flow', () => {
    it('new user → session shows profileComplete=false → onboarding → session shows profileComplete=true', async () => {
      const userId = new Types.ObjectId()

      // Step 1: Session shows profileComplete=false
      const userWithoutProfile = {
        _id: userId,
        name: 'Juan',
        lastName: 'Perez',
        email: 'juan@example.com',
        role: 'USER',
        isActive: true,
        profileComplete: false,
        birthdate: undefined,
        avatarUrl: undefined,
      }
      const mockSelect1 = vi.fn().mockResolvedValue(userWithoutProfile)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect1 } as any)

      const sessionReq1 = buildMockRequest({ user: { _id: userId } as any })
      const sessionRes1 = buildMockResponse()
      await AuthController.session(sessionReq1, sessionRes1)

      expect(sessionRes1.json).toHaveBeenCalledWith(
        expect.objectContaining({ profileComplete: false })
      )

      // Step 2: Onboarding sets profileComplete=true
      const userForOnboarding = {
        _id: userId,
        name: 'Juan',
        lastName: 'Perez',
        birthdate: undefined,
        profileComplete: false,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(userForOnboarding as any)

      const onboardingReq = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          fullName: 'Juan Perez',
          birthdate: '1990-01-15',
        },
      })
      const onboardingRes = buildMockResponse()
      await AuthController.onboarding(onboardingReq, onboardingRes)

      expect(onboardingRes.status).toHaveBeenCalledWith(201)
      expect(userForOnboarding.profileComplete).toBe(true)
      expect(userForOnboarding.name).toBe('Juan')
      expect(userForOnboarding.lastName).toBe('Perez')
      expect(userForOnboarding.birthdate).toBeInstanceOf(Date)

      // Step 3: Session shows profileComplete=true
      const userWithProfile = {
        ...userWithoutProfile,
        profileComplete: true,
        birthdate: new Date('1990-01-15'),
      }
      const mockSelect2 = vi.fn().mockResolvedValue(userWithProfile)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect2 } as any)

      const sessionReq2 = buildMockRequest({ user: { _id: userId } as any })
      const sessionRes2 = buildMockResponse()
      await AuthController.session(sessionReq2, sessionRes2)

      expect(sessionRes2.json).toHaveBeenCalledWith(
        expect.objectContaining({ profileComplete: true })
      )
    })
  })

  describe('duplicate onboarding prevention', () => {
    it('returns 409 when user already completed onboarding', async () => {
      const userId = new Types.ObjectId()

      const userWithProfile = {
        _id: userId,
        profileComplete: true,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(userWithProfile as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          fullName: 'Juan Perez',
          birthdate: '1990-01-15',
        },
      })
      const res = buildMockResponse()

      await AuthController.onboarding(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith({
        message: 'El perfil ya fue completado',
      })
    })
  })

  describe('profile retrieval after onboarding', () => {
    it('returns user with profile data when profileComplete=true', async () => {
      const userId = new Types.ObjectId()

      const userWithProfile = {
        _id: userId,
        name: 'Juan',
        lastName: 'Perez',
        email: 'juan@example.com',
        role: 'USER',
        isActive: true,
        profileComplete: true,
        birthdate: new Date('1990-01-15'),
        avatarUrl: 'https://example.com/avatar.jpg',
      }
      const mockSelect = vi.fn().mockResolvedValue(userWithProfile)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)

      const req = buildMockRequest({ user: { _id: userId } as any })
      const res = buildMockResponse()

      await AuthController.getProfile(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        user: userWithProfile,
        profile: {
          fullName: 'Juan Perez',
          birthdate: userWithProfile.birthdate,
          avatarUrl: userWithProfile.avatarUrl,
        },
      })
    })

    it('returns user with profile: null when profileComplete=false', async () => {
      const userId = new Types.ObjectId()

      const userWithoutProfile = {
        _id: userId,
        name: 'Juan',
        lastName: 'Perez',
        email: 'juan@example.com',
        role: 'USER',
        isActive: true,
        profileComplete: false,
        birthdate: undefined,
        avatarUrl: undefined,
      }
      const mockSelect = vi.fn().mockResolvedValue(userWithoutProfile)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)

      const req = buildMockRequest({ user: { _id: userId } as any })
      const res = buildMockResponse()

      await AuthController.getProfile(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        user: userWithoutProfile,
        profile: null,
      })
    })
  })
})
