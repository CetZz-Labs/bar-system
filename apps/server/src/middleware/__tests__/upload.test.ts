import { vi, describe, it, expect, beforeEach } from 'vitest'
import { buildMockRequest, buildMockResponse, buildMockNext } from '../../__tests__/helpers/mockHelpers'

// Mock multer so we can (a) capture the `fileFilter` passed to it and
// exercise its branches directly, and (b) control what the `.any()`
// handler does inside `uploadSingle`, without depending on real
// multipart parsing.
const { mockAny, mockMulterFn } = vi.hoisted(() => {
  const mockAny = vi.fn()
  const mockMulterFn = vi.fn(() => ({ any: mockAny }))
  ;(mockMulterFn as any).memoryStorage = vi.fn(() => 'MEMORY_STORAGE_STUB')
  return { mockAny, mockMulterFn }
})

vi.mock('multer', () => ({
  default: mockMulterFn,
}))

import { upload, uploadLogo, uploadCover, uploadSingle } from '../upload'

// Captured once at import time: the `fileFilter` option is identical
// (same implementation) across every `createUploadMiddleware` call,
// so grabbing it from the first module-level invocation is enough to
// exercise both of its branches.
const capturedFileFilter = mockMulterFn.mock.calls[0][0].fileFilter as (
  req: unknown,
  file: { mimetype: string },
  cb: (error: Error | null, acceptFile?: boolean) => void
) => void

describe('upload middleware', () => {
  beforeEach(() => {
    mockAny.mockReset()
  })

  describe('module-level middleware instances', () => {
    it('creates upload, uploadLogo and uploadCover via multer(memoryStorage)', () => {
      expect(upload).toBeDefined()
      expect(uploadLogo).toBeDefined()
      expect(uploadCover).toBeDefined()
      expect(mockMulterFn.mock.calls.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('fileFilter', () => {
    it.each(['image/jpeg', 'image/png', 'image/webp'])(
      'accepts allowed mime type %s',
      (mimetype) => {
        const cb = vi.fn()
        capturedFileFilter({}, { mimetype }, cb)
        expect(cb).toHaveBeenCalledWith(null, true)
      }
    )

    it('rejects a disallowed mime type', () => {
      const cb = vi.fn()
      capturedFileFilter({}, { mimetype: 'application/pdf' }, cb)

      expect(cb).toHaveBeenCalledTimes(1)
      const [errArg, acceptArg] = cb.mock.calls[0]
      expect(errArg).toBeInstanceOf(Error)
      expect(errArg.message).toBe('Tipo de archivo no permitido. Use JPEG, PNG o WebP')
      expect(acceptArg).toBeUndefined()
    })
  })

  describe('uploadSingle', () => {
    it('forwards the error to next() when the underlying multer handler fails', async () => {
      mockAny.mockImplementation(() => (req: any, _res: any, cb: any) => {
        cb(new Error('multer failure'))
      })

      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = buildMockNext()

      uploadSingle(2 * 1024 * 1024)(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
      expect((next as any).mock.calls[0][0].message).toBe('multer failure')
      expect((req as any).file).toBeUndefined()
    })

    it('calls next() with no file when req.files is undefined', async () => {
      mockAny.mockImplementation(() => (req: any, _res: any, cb: any) => {
        cb(undefined)
      })

      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = buildMockNext()

      uploadSingle(2 * 1024 * 1024)(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect((req as any).file).toBeUndefined()
    })

    it('calls next() with no file when req.files is an empty array', async () => {
      mockAny.mockImplementation(() => (req: any, _res: any, cb: any) => {
        req.files = []
        cb(undefined)
      })

      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = buildMockNext()

      uploadSingle(2 * 1024 * 1024)(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect((req as any).file).toBeUndefined()
    })

    it('forwards an error to next() when more than one file is sent', async () => {
      mockAny.mockImplementation(() => (req: any, _res: any, cb: any) => {
        req.files = [
          { originalname: 'a.jpg', mimetype: 'image/jpeg' },
          { originalname: 'b.jpg', mimetype: 'image/jpeg' },
        ]
        cb(undefined)
      })

      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = buildMockNext()

      uploadSingle(2 * 1024 * 1024)(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
      expect((next as any).mock.calls[0][0].message).toBe('Solo se permite un archivo por solicitud')
      expect((req as any).file).toBeUndefined()
    })

    it('normalizes a single uploaded file onto req.file and calls next()', async () => {
      const singleFile = { originalname: 'photo.jpg', mimetype: 'image/jpeg' }
      mockAny.mockImplementation(() => (req: any, _res: any, cb: any) => {
        req.files = [singleFile]
        cb(undefined)
      })

      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = buildMockNext()

      uploadSingle(2 * 1024 * 1024)(req, res, next)

      expect((req as any).file).toBe(singleFile)
      expect(next).toHaveBeenCalledWith()
    })
  })
})
