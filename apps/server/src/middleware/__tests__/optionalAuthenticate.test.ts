import { vi, describe, it, expect, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { Types } from 'mongoose'
import { optionalAuthenticate } from '../auth'
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

describe('optionalAuthenticate middleware', () => {
  beforeEach(() => {
    vi.mocked(jwt.verify).mockReset()
    vi.mocked(User.findById).mockReset()
  })

  describe('when no token provided', () => {
    it('calls next() without querying the database', async () => {
      const req = buildMockRequest({ cookies: {} })
      const res = buildMockResponse()
      const next = buildMockNext()

      await optionalAuthenticate(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(User.findById).not.toHaveBeenCalled()
      expect(req.user).toBeUndefined()
    })
  })

  describe('when token decodes without an id', () => {
    it('does not query the database and calls next()', async () => {
      vi.mocked(jwt.verify).mockReturnValue({} as any)

      const req = buildMockRequest({ cookies: { access_token: 'token-without-id' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      await optionalAuthenticate(req, res, next)

      expect(User.findById).not.toHaveBeenCalled()
      expect(req.user).toBeUndefined()
      expect(next).toHaveBeenCalled()
    })
  })

  describe('when token is valid and user is active', () => {
    it('attaches req.user and calls next()', async () => {
      const mockUser = { _id: new Types.ObjectId(), isActive: true, role: Role.USER }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      await optionalAuthenticate(req, res, next)

      expect(req.user).toBe(mockUser)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('when token is valid but user is inactive', () => {
    it('does not attach req.user but still calls next()', async () => {
      const mockUser = { _id: new Types.ObjectId(), isActive: false, role: Role.USER }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      await optionalAuthenticate(req, res, next)

      expect(req.user).toBeUndefined()
      expect(next).toHaveBeenCalled()
    })
  })

  describe('when token is valid but the user no longer exists', () => {
    it('does not attach req.user but still calls next()', async () => {
      const mockSelect = vi.fn().mockResolvedValue(null)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)
      vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

      const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      await optionalAuthenticate(req, res, next)

      expect(req.user).toBeUndefined()
      expect(next).toHaveBeenCalled()
    })
  })

  describe('when token verification throws', () => {
    it('swallows the error and calls next() without a user', async () => {
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error('invalid token')
      })

      const req = buildMockRequest({ cookies: { access_token: 'invalid-token' } })
      const res = buildMockResponse()
      const next = buildMockNext()

      await optionalAuthenticate(req, res, next)

      expect(req.user).toBeUndefined()
      expect(next).toHaveBeenCalled()
    })
  })
})
