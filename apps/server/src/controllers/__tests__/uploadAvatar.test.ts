import { vi, describe, it, expect, beforeEach } from 'vitest'
import { UserController } from '../../controllers/UserController'
import User from '../../models/User'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'
import fs from 'fs/promises'

// Mock User model
vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
}))

// Mock fs
vi.mock('fs/promises', () => ({
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('UserController.uploadAvatar', () => {
  beforeEach(() => {
    vi.mocked(User.findById).mockReset()
    vi.mocked(fs.writeFile).mockReset()
    vi.mocked(fs.mkdir).mockReset()
    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)
  })

  describe('when valid image file is uploaded', () => {
    it('returns 201 with avatarUrl', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        profileComplete: true,
        avatarUrl: undefined,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)

      const fileBuffer = Buffer.from('fake-image-data')
      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
        file: {
          buffer: fileBuffer,
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
        } as any,
      })
      const res = buildMockResponse()

      await UserController.uploadAvatar(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarUrl: expect.stringMatching(/^\/uploads\/avatars\/.*\.jpg$/),
        })
      )
      expect(mockUser.avatarUrl).toMatch(/^\/uploads\/avatars\/.*\.jpg$/)
      expect(mockUser.save).toHaveBeenCalled()
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/uploads\\avatars\\.*\.jpg$/),
        fileBuffer
      )
    })
  })

  describe('when no file is uploaded', () => {
    it('returns 400 with file required message', async () => {
      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        file: undefined,
      })
      const res = buildMockResponse()

      await UserController.uploadAvatar(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Se requiere un archivo',
      })
    })
  })

  describe('when file exceeds 2MB', () => {
    it('returns 400 with size limit message', async () => {
      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        file: {
          buffer: Buffer.alloc(3 * 1024 * 1024), // 3MB
          originalname: 'large.jpg',
          mimetype: 'image/jpeg',
          size: 3 * 1024 * 1024,
        } as any,
      })
      const res = buildMockResponse()

      await UserController.uploadAvatar(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'El archivo supera el límite de 2 MB',
      })
    })
  })

  describe('when file type is not allowed', () => {
    it('returns 400 with invalid type message', async () => {
      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        file: {
          buffer: Buffer.from('fake-data'),
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
          size: 1024,
        } as any,
      })
      const res = buildMockResponse()

      await UserController.uploadAvatar(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Tipo de archivo no permitido. Use JPEG, PNG o WebP',
      })
    })
  })

  describe('when user is not found', () => {
    it('returns 404', async () => {
      vi.mocked(User.findById).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: new Types.ObjectId() } as any,
        file: {
          buffer: Buffer.from('fake-data'),
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
        } as any,
      })
      const res = buildMockResponse()

      await UserController.uploadAvatar(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuario no encontrado',
      })
    })
  })

  describe('when file write fails', () => {
    it('returns 500 with upload error', async () => {
      const mockUser = {
        _id: new Types.ObjectId(),
        profileComplete: true,
        save: vi.fn().mockResolvedValue(true),
      }
      vi.mocked(User.findById).mockResolvedValue(mockUser as any)
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write failed'))

      const req = buildMockRequest({
        user: { _id: mockUser._id } as any,
        file: {
          buffer: Buffer.from('fake-data'),
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
        } as any,
      })
      const res = buildMockResponse()

      await UserController.uploadAvatar(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Hubo un error al subir el avatar',
      })
    })
  })
})
