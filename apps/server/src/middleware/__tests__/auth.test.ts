import { vi, describe, it, expect, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { Types } from 'mongoose'
import { authenticate } from '../auth'
import User from '../../models/User'
import { buildMockRequest, buildMockResponse, buildMockNext } from '../../__tests__/helpers/mockHelpers'

// Mock User model
vi.mock('../../models/User', () => {
  return {
    default: { findById: vi.fn() },
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

      const middleware = authenticate()
      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ message: 'No Autorizado' })
    })

    it('does not call next()', async () => {
      const req = buildMockRequest({ cookies: {} })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate()
      await middleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when token is valid', () => {
    it('calls next()', async () => {
      const mockUser = { _id: new Types.ObjectId(), isActive: true }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate()
      await middleware(req, res, next)

      expect(next).toHaveBeenCalled()
    })

    it('attaches user to req.user', async () => {
      const mockUser = { _id: new Types.ObjectId(), isActive: true }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate()
      await middleware(req, res, next)

      expect(req.user).toBe(mockUser)
    })

    it('queries User without selecting `role` (LB-84: el campo fue eliminado del modelo)', async () => {
      const mockUser = { _id: new Types.ObjectId(), isActive: true }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate()
      await middleware(req, res, next)

      expect(mockSelect).toHaveBeenCalledWith('_id name lastName email isActive')
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

      const middleware = authenticate()
      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ message: 'Token No Válido o expirado' })
    })
  })

  describe('when token is expired', () => {
    it('returns 500 with "Token No Válido o expirado" (LB-84: edge case explícito de la matriz de auditoría)', async () => {
      const expiredError = new Error('jwt expired')
      expiredError.name = 'TokenExpiredError'
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw expiredError
      })

      const req = buildMockRequest({ cookies: { access_token: 'expired-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate()
      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ message: 'Token No Válido o expirado' })
      expect(next).not.toHaveBeenCalled()
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

      const middleware = authenticate()
      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ message: 'Token No Válido o usuario inexistente' })
    })
  })

  describe('when user is inactive', () => {
    it('returns 401 with "La cuenta está desactivada"', async () => {
      const mockUser = { _id: new Types.ObjectId(), isActive: false }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      const middleware = authenticate()
      await middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ message: 'La cuenta está desactivada' })
    })

    it('reflects a mid-session deactivation on the very next request (regression: re-consulta fresca a Mongo, no confía en el JWT)', async () => {
      const userId = new Types.ObjectId()
      const decoded = { id: userId.toString() }
      vi.mocked(jwt.verify).mockReturnValue(decoded as any)

      // Primera request: la cuenta todavía está activa.
      const firstSelect = vi.fn().mockResolvedValue({ _id: userId, isActive: true })
      vi.mocked(User.findById).mockReturnValueOnce({ select: firstSelect } as any)

      const req1 = buildMockRequest({ cookies: { access_token: 'same-token' } })
      const res1 = buildMockResponse()
      const next1 = buildMockNext()
      await authenticate()(req1, res1, next1)
      expect(next1).toHaveBeenCalled()

      // El OWNER desactiva al usuario entre una request y la siguiente —
      // mismo token, pero ahora `isActive: false` en Mongo.
      const secondSelect = vi.fn().mockResolvedValue({ _id: userId, isActive: false })
      vi.mocked(User.findById).mockReturnValueOnce({ select: secondSelect } as any)

      const req2 = buildMockRequest({ cookies: { access_token: 'same-token' } })
      const res2 = buildMockResponse()
      const next2 = buildMockNext()
      await authenticate()(req2, res2, next2)

      expect(next2).not.toHaveBeenCalled()
      expect(res2.status).toHaveBeenCalledWith(401)
      expect(res2.json).toHaveBeenCalledWith({ message: 'La cuenta está desactivada' })
    })
  })
})
