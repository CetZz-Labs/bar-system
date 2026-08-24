import { vi, describe, it, expect, beforeEach } from 'vitest'
import { BarController } from '../../controllers/BarController'
import Bar, { BarStatus } from '../../models/Bar'
import BarUser, { BarUserRole } from '../../models/BarUser'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'
import fs from 'fs/promises'
import sharp from 'sharp'

const validSchedule = [
  { day: 1, open: '20:00', close: '03:00' },
]

// Mock Bar model
vi.mock('../../models/Bar', () => ({
  default: {
    findById: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
  },
  BarStatus: {
    PENDING: 'pending',
    ACTIVE: 'active',
    REJECTED: 'rejected',
  },
}))

// Mock BarUser model
vi.mock('../../models/BarUser', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
  },
  BarUserRole: {
    OWNER: 'OWNER',
    CASHIER: 'CASHIER',
  },
}))

// Mock Outing model (LB-76: BarController now imports Outing at module
// scope for getPublicBarDetail; mocked here — instead of letting the real
// Outing.ts load — so its schema definition doesn't need the real
// `attendancePointsByDaySchema` export from the mocked Bar module above).
vi.mock('../../models/Outing', () => ({
  default: {
    findOne: vi.fn(),
  },
  OutingStatus: {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    CANCELLED: 'CANCELLED',
    COMPLETED: 'COMPLETED',
    NO_SHOW: 'NO_SHOW',
  },
}))

// Mock fs
vi.mock('fs/promises', () => ({
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock sharp
vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ width: 400, height: 400 }),
  })),
}))

const zeroAttendancePoints = {
  monday: 0,
  tuesday: 0,
  wednesday: 0,
  thursday: 0,
  friday: 0,
  saturday: 0,
  sunday: 0,
}

function buildMockBar(overrides: any = {}) {
  return {
    _id: new Types.ObjectId(),
    name: 'El Bar de Juan',
    slug: 'el-bar-de-juan-ab12',
    address: {
      street: 'Av. Siempre Viva',
      number: '123',
      neighborhood: 'Centro',
      city: 'Buenos Aires',
    },
    phone: '+54 11 1234-5678',
    schedule: validSchedule,
    description: 'Un bar con buena onda',
    status: BarStatus.ACTIVE,
    logoUrl: undefined,
    coverUrl: undefined,
    closingTime: '06:00',
    attendancePointsByDay: { ...zeroAttendancePoints },
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('BarController.getBarProfile', () => {
  beforeEach(() => {
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(Bar.findById).mockReset()
  })

  it('returns 200 with bar profile when user has access', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockBar = buildMockBar({ _id: barId, logoUrl: '/uploads/bar-logos/logo.jpg' })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
    })
    const res = buildMockResponse()

    await BarController.getBarProfile(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: barId,
        name: mockBar.name,
        logoUrl: mockBar.logoUrl,
      })
    )
  })

  it('returns 403 when user does not have access', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
    })
    const res = buildMockResponse()

    await BarController.getBarProfile(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 404 when bar not found', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
    })
    const res = buildMockResponse()

    await BarController.getBarProfile(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('includes attendancePointsByDay in the response (LB-59)', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockBar = buildMockBar({
      _id: barId,
      attendancePointsByDay: { ...zeroAttendancePoints, friday: 100, saturday: 150 },
    })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
    })
    const res = buildMockResponse()

    await BarController.getBarProfile(req, res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        attendancePointsByDay: expect.objectContaining({ friday: 100, saturday: 150 }),
      })
    )
  })
})

describe('BarController.updateBarProfile', () => {
  beforeEach(() => {
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(Bar.findById).mockReset()
  })

  it('returns 200 and updates name, description and phone', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockBar = buildMockBar({ _id: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      body: {
        name: 'Nuevo Nombre',
        description: 'Nueva descripción',
        phone: '+54 11 9999-8888',
      },
    })
    const res = buildMockResponse()

    await BarController.updateBarProfile(req, res)

    expect(mockBar.save).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        bar: expect.objectContaining({
          name: 'Nuevo Nombre',
          description: 'Nueva descripción',
          phone: '+54 11 9999-8888',
        }),
      })
    )
  })

  it('returns 400 for invalid name length', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockBar = buildMockBar({ _id: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      body: { name: 'AB' },
    })
    const res = buildMockResponse()

    await BarController.updateBarProfile(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 400 for description too long', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockBar = buildMockBar({ _id: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      body: { description: 'a'.repeat(121) },
    })
    const res = buildMockResponse()

    await BarController.updateBarProfile(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 400 for empty phone', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockBar = buildMockBar({ _id: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      body: { phone: '   ' },
    })
    const res = buildMockResponse()

    await BarController.updateBarProfile(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 403 when user does not have access', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      body: { name: 'Nuevo Nombre' },
    })
    const res = buildMockResponse()

    await BarController.updateBarProfile(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 404 when bar not found', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      body: { name: 'Nuevo Nombre' },
    })
    const res = buildMockResponse()

    await BarController.updateBarProfile(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  describe('attendancePointsByDay (LB-59)', () => {
    it('updates all 7 days and returns them in the response', async () => {
      const userId = new Types.ObjectId()
      const barId = new Types.ObjectId()
      const mockBar = buildMockBar({ _id: barId })

      vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
      vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

      const newPoints = { ...zeroAttendancePoints, friday: 200, saturday: 300, sunday: 50 }
      const req = buildMockRequest({
        user: { _id: userId } as any,
        params: { id: barId.toString() },
        body: { attendancePointsByDay: newPoints },
      })
      const res = buildMockResponse()

      await BarController.updateBarProfile(req, res)

      expect(mockBar.attendancePointsByDay).toEqual(newPoints)
      expect(mockBar.save).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          bar: expect.objectContaining({ attendancePointsByDay: newPoints }),
        })
      )
    })

    it('returns 400 when a day is missing from the payload', async () => {
      const userId = new Types.ObjectId()
      const barId = new Types.ObjectId()
      const mockBar = buildMockBar({ _id: barId })

      vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
      vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

      const { monday: _monday, ...incompletePoints } = zeroAttendancePoints
      const req = buildMockRequest({
        user: { _id: userId } as any,
        params: { id: barId.toString() },
        body: { attendancePointsByDay: incompletePoints },
      })
      const res = buildMockResponse()

      await BarController.updateBarProfile(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(mockBar.save).not.toHaveBeenCalled()
    })

    it('returns 400 when a day value exceeds 1000', async () => {
      const userId = new Types.ObjectId()
      const barId = new Types.ObjectId()
      const mockBar = buildMockBar({ _id: barId })

      vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
      vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        params: { id: barId.toString() },
        body: { attendancePointsByDay: { ...zeroAttendancePoints, friday: 1001 } },
      })
      const res = buildMockResponse()

      await BarController.updateBarProfile(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(mockBar.save).not.toHaveBeenCalled()
    })

    it('returns 400 when a day value is negative', async () => {
      const userId = new Types.ObjectId()
      const barId = new Types.ObjectId()
      const mockBar = buildMockBar({ _id: barId })

      vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
      vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        params: { id: barId.toString() },
        body: { attendancePointsByDay: { ...zeroAttendancePoints, friday: -1 } },
      })
      const res = buildMockResponse()

      await BarController.updateBarProfile(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(mockBar.save).not.toHaveBeenCalled()
    })

    it('returns 400 when a day value is not an integer', async () => {
      const userId = new Types.ObjectId()
      const barId = new Types.ObjectId()
      const mockBar = buildMockBar({ _id: barId })

      vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
      vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        params: { id: barId.toString() },
        body: { attendancePointsByDay: { ...zeroAttendancePoints, friday: 12.5 } },
      })
      const res = buildMockResponse()

      await BarController.updateBarProfile(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(mockBar.save).not.toHaveBeenCalled()
    })

    it('leaves attendancePointsByDay untouched when not present in the body', async () => {
      const userId = new Types.ObjectId()
      const barId = new Types.ObjectId()
      const existingPoints = { ...zeroAttendancePoints, monday: 10 }
      const mockBar = buildMockBar({ _id: barId, attendancePointsByDay: existingPoints })

      vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
      vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        params: { id: barId.toString() },
        body: { name: 'Otro nombre' },
      })
      const res = buildMockResponse()

      await BarController.updateBarProfile(req, res)

      expect(mockBar.attendancePointsByDay).toEqual(existingPoints)
      expect(res.status).toHaveBeenCalledWith(200)
    })
  })
})

describe('BarController.uploadBarLogo', () => {
  beforeEach(() => {
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(Bar.findById).mockReset()
    vi.mocked(fs.writeFile).mockReset()
    vi.mocked(fs.mkdir).mockReset()
    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)
    vi.mocked(sharp).mockReturnValue({
      metadata: vi.fn().mockResolvedValue({ width: 400, height: 400 }),
    } as any)
  })

  it('returns 201 with logoUrl for valid image', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockBar = buildMockBar({ _id: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

    const fileBuffer = Buffer.from('fake-image-data')
    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: {
        buffer: fileBuffer,
        originalname: 'logo.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as any,
    })
    const res = buildMockResponse()

    await BarController.uploadBarLogo(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        logoUrl: expect.stringMatching(/^\/uploads\/bar-logos\/.*\.jpg$/),
      })
    )
    expect(mockBar.logoUrl).toMatch(/^\/uploads\/bar-logos\/.*\.jpg$/)
    expect(mockBar.save).toHaveBeenCalled()
  })

  it('returns 400 when no file is uploaded', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: undefined,
    })
    const res = buildMockResponse()

    await BarController.uploadBarLogo(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'Se requiere un archivo' })
  })

  it('returns 400 when file exceeds 2MB', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: {
        buffer: Buffer.alloc(3 * 1024 * 1024),
        originalname: 'large.jpg',
        mimetype: 'image/jpeg',
        size: 3 * 1024 * 1024,
      } as any,
    })
    const res = buildMockResponse()

    await BarController.uploadBarLogo(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'El archivo supera el límite de 2 MB' })
  })

  it('returns 400 when file type is not allowed', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: {
        buffer: Buffer.from('fake-data'),
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      } as any,
    })
    const res = buildMockResponse()

    await BarController.uploadBarLogo(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'Tipo de archivo no permitido. Use JPEG, PNG o WebP' })
  })

  it('returns 400 when image is smaller than 200x200', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockBar = buildMockBar({ _id: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)
    vi.mocked(sharp).mockReturnValue({
      metadata: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
    } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: {
        buffer: Buffer.from('fake-image-data'),
        originalname: 'small.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as any,
    })
    const res = buildMockResponse()

    await BarController.uploadBarLogo(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('al menos 200×200'),
      })
    )
  })

  it('returns 403 when user does not have access', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: {
        buffer: Buffer.from('fake-image-data'),
        originalname: 'logo.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as any,
    })
    const res = buildMockResponse()

    await BarController.uploadBarLogo(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 404 when bar not found', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: {
        buffer: Buffer.from('fake-image-data'),
        originalname: 'logo.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as any,
    })
    const res = buildMockResponse()

    await BarController.uploadBarLogo(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })
})

describe('BarController.uploadBarCover', () => {
  beforeEach(() => {
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(Bar.findById).mockReset()
    vi.mocked(fs.writeFile).mockReset()
    vi.mocked(fs.mkdir).mockReset()
    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)
  })

  it('returns 201 with coverUrl for valid image', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockBar = buildMockBar({ _id: barId })

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

    const fileBuffer = Buffer.from('fake-image-data')
    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: {
        buffer: fileBuffer,
        originalname: 'cover.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as any,
    })
    const res = buildMockResponse()

    await BarController.uploadBarCover(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        coverUrl: expect.stringMatching(/^\/uploads\/bar-covers\/.*\.jpg$/),
      })
    )
    expect(mockBar.coverUrl).toMatch(/^\/uploads\/bar-covers\/.*\.jpg$/)
    expect(mockBar.save).toHaveBeenCalled()
  })

  it('returns 400 when no file is uploaded', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: undefined,
    })
    const res = buildMockResponse()

    await BarController.uploadBarCover(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'Se requiere un archivo' })
  })

  it('returns 400 when file exceeds 3MB', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: {
        buffer: Buffer.alloc(4 * 1024 * 1024),
        originalname: 'large.jpg',
        mimetype: 'image/jpeg',
        size: 4 * 1024 * 1024,
      } as any,
    })
    const res = buildMockResponse()

    await BarController.uploadBarCover(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'El archivo supera el límite de 3 MB' })
  })

  it('returns 400 when file type is not allowed', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: {
        buffer: Buffer.from('fake-data'),
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      } as any,
    })
    const res = buildMockResponse()

    await BarController.uploadBarCover(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'Tipo de archivo no permitido. Use JPEG, PNG o WebP' })
  })

  it('returns 403 when user does not have access', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: {
        buffer: Buffer.from('fake-image-data'),
        originalname: 'cover.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as any,
    })
    const res = buildMockResponse()

    await BarController.uploadBarCover(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 404 when bar not found', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { id: barId.toString() },
      file: {
        buffer: Buffer.from('fake-image-data'),
        originalname: 'cover.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as any,
    })
    const res = buildMockResponse()

    await BarController.uploadBarCover(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })
})
