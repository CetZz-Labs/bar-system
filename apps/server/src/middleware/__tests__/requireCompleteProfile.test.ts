import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { requireCompleteProfile } from '../auth'
import User from '../../models/User'
import { buildMockRequest, buildMockResponse, buildMockNext } from '../../__tests__/helpers/mockHelpers'

// Mock User model
vi.mock('../../models/User', () => ({
  default: { findById: vi.fn() },
}))

describe('requireCompleteProfile middleware', () => {
  beforeEach(() => {
    vi.mocked(User.findById).mockReset()
  })

  describe('when user has profileComplete = true', () => {
    it('calls next()', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        profileComplete: true,
        save: vi.fn().mockResolvedValue(true),
      }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
      })
      const res = buildMockResponse()
      const next = buildMockNext()

      await requireCompleteProfile(req, res, next)

      expect(next).toHaveBeenCalled()
    })
  })

  describe('when user has profileComplete = false', () => {
    it('returns 403 with profile incomplete message', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        profileComplete: false,
        save: vi.fn().mockResolvedValue(true),
      }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
      })
      const res = buildMockResponse()
      const next = buildMockNext()

      await requireCompleteProfile(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Debes completar tu perfil antes de continuar',
      })
    })

    it('does not call next()', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        profileComplete: false,
        save: vi.fn().mockResolvedValue(true),
      }
      const mockSelect = vi.fn().mockResolvedValue(mockUser)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
      })
      const res = buildMockResponse()
      const next = buildMockNext()

      await requireCompleteProfile(req, res, next)

      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when user is not found', () => {
    it('returns 403 with profile incomplete message', async () => {
      const mockSelect = vi.fn().mockResolvedValue(null)
      vi.mocked(User.findById).mockReturnValue({ select: mockSelect } as any)

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
      })
      const res = buildMockResponse()
      const next = buildMockNext()

      await requireCompleteProfile(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Debes completar tu perfil antes de continuar',
      })
    })
  })

  describe('when req.user is undefined', () => {
    it('returns 403 without querying database', async () => {
      const req = buildMockRequest({ user: undefined })
      const res = buildMockResponse()
      const next = buildMockNext()

      await requireCompleteProfile(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Debes completar tu perfil antes de continuar',
      })
      expect(User.findById).not.toHaveBeenCalled()
    })
  })
})
