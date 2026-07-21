import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuthController } from '../../controllers/AuthController'
import User from '../../models/User'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'

// Mock User model
vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
    create: vi.fn(),
  },
}))

describe('AuthController.onboarding', () => {
  beforeEach(() => {
    vi.mocked(User.findById).mockReset()
    vi.mocked(User.create).mockReset()
  })

  describe('when user is authenticated and has no profile', () => {
    it('creates profile and returns 201', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        name: 'Juan',
        lastName: 'Perez',
        birthdate: undefined,
        profileComplete: false,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
        body: {
          fullName: 'Juan Perez',
          birthdate: '1990-01-15',
        },
      })
      const res = buildMockResponse()

      await AuthController.onboarding(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Perfil completado correctamente',
      })
      expect(mockUser.profileComplete).toBe(true)
      expect(mockUser.name).toBe('Juan')
      expect(mockUser.lastName).toBe('Perez')
      expect(mockUser.birthdate).toBeInstanceOf(Date)
      expect(mockUser.save).toHaveBeenCalled()
    })
  })

  describe('when user already has profileComplete = true', () => {
    it('returns 409 with duplicate message', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        profileComplete: true,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
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

  describe('when fullName is missing', () => {
    it('returns 400 with validation error', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        profileComplete: false,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
        body: {
          birthdate: '1990-01-15',
        },
      })
      const res = buildMockResponse()

      await AuthController.onboarding(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'El nombre completo es requerido y debe tener entre 2 y 50 caracteres',
      })
    })
  })

  describe('when fullName has only one word', () => {
    it('returns 400 with validation error', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        profileComplete: false,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
        body: {
          fullName: 'Juan',
          birthdate: '1990-01-15',
        },
      })
      const res = buildMockResponse()

      await AuthController.onboarding(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'El nombre completo debe tener al menos 2 palabras',
      })
    })
  })

  describe('when birthdate is missing', () => {
    it('returns 400 with validation error', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        profileComplete: false,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
        body: {
          fullName: 'Juan Perez',
        },
      })
      const res = buildMockResponse()

      await AuthController.onboarding(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'La fecha de nacimiento es requerida',
      })
    })
  })

  describe('when birthdate is invalid', () => {
    it('returns 400 with validation error', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        profileComplete: false,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
        body: {
          fullName: 'Juan Perez',
          birthdate: 'not-a-date',
        },
      })
      const res = buildMockResponse()

      await AuthController.onboarding(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'La fecha de nacimiento es requerida',
      })
    })
  })

  describe('when user is not found', () => {
    it('returns 404', async () => {
      vi.mocked(User.findById).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        body: {
          fullName: 'Juan Perez',
          birthdate: '1990-01-15',
        },
      })
      const res = buildMockResponse()

      await AuthController.onboarding(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuario no encontrado',
      })
    })
  })
})
