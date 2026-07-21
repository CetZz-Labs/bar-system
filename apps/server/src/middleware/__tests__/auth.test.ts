import { vi, describe, it, expect, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { Types } from 'mongoose'
import { authenticate } from '../auth'
import User, { Role } from '../../models/User'
import { buildMockRequest, buildMockResponse, buildMockNext } from '../../__tests__/helpers/mockHelpers'

// Mock User model
vi.mock('../../models/User', () => {
  return {
    default: { findById: vi.fn() },
    Role: { ADMIN: 'ADMIN', USER: 'USER', OWNER: 'OWNER', WAITER: 'WAITER' },
  }
})

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}))

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.mocked(jwt.verify).mockReset()
    vi.mocked(User.findById).mockReset()
  })

  describe('when no token provided', () => {
    it('returns 401 with "No Autorizado"', async () => {
      const req = buildMockRequest({ cookies: {} })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate([Role.USER])
      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ message: 'No Autorizado' })
    })

    it('does not call next()', async () => {
      const req = buildMockRequest({ cookies: {} })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate([Role.USER])
      await middleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when token is valid', () => {
    it('calls next()', async () => {
      const mockUser = { _id: new Types.ObjectId(), isActive: true, role: Role.USER }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate([Role.USER])
      await middleware(req, res, next)

      expect(next).toHaveBeenCalled()
    })

    it('attaches user to req.user', async () => {
      const mockUser = { _id: new Types.ObjectId(), isActive: true, role: Role.USER }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate([Role.USER])
      await middleware(req, res, next)

      expect(req.user).toBe(mockUser)
    })
  })

  describe('when token is invalid', () => {
    it('returns 500 with "Token No Válido o expirado"', async () => {
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('invalid token')
      })

      const req = buildMockRequest({ cookies: { access_token: 'invalid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate([Role.USER])
      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ message: 'Token No Válido o expirado' })
    })
  })

  describe('when user not found', () => {
    it('returns 401 with "Token No Válido o usuario inexistente"', async () => {
      const mockSelect = vi.fn().mockResolvedValue(null)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate([Role.USER])
      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ message: 'Token No Válido o usuario inexistente' })
    })
  })

  describe('when user is inactive', () => {
    it('returns 401 with "La cuenta está desactivada"', async () => {
      const mockUser = { _id: new Types.ObjectId(), isActive: false, role: Role.USER }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate([Role.USER])
      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ message: 'La cuenta está desactivada' })
    })
  })

  describe('when user role not allowed', () => {
    it('returns 403 with "Acceso Denegado"', async () => {
      const mockUser = { _id: new Types.ObjectId(), isActive: true, role: Role.USER }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate([Role.ADMIN])
      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: 'Acceso Denegado: No tienes los permisos necesarios' })
    })
  })

  describe('when user role is allowed', () => {
    it('calls next()', async () => {
      const mockUser = { _id: new Types.ObjectId(), isActive: true, role: Role.ADMIN }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate([Role.ADMIN])
      await middleware(req, res, next)

      expect(next).toHaveBeenCalled()
    })
  })
})