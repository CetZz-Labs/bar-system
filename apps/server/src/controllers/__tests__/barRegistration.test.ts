import { vi, describe, it, expect, beforeEach } from 'vitest'
import { BarController } from '../../controllers/BarController'
import Bar, { BarStatus } from '../../models/Bar'
import BarUser, { BarUserRole } from '../../models/BarUser'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'

const validSchedule = [
  { day: 1, open: '20:00', close: '03:00' },
  { day: 2, open: '20:00', close: '03:00' },
  { day: 3, open: '20:00', close: '03:00' },
  { day: 4, open: '20:00', close: '03:00' },
  { day: 5, open: '20:00', close: '03:00' },
  { day: 6, open: '20:00', close: '04:00' },
]

let lastCreatedBar: any = null
let lastCreatedBarUser: any = null

// Mock Bar model
vi.mock('../../models/Bar', () => {
  const mockSave = vi.fn().mockResolvedValue(true)

  function MockBar(data: any) {
    const instance = {
      ...data,
      _id: new Types.ObjectId(),
      slug: 'test-bar-ab12',
      status: BarStatus.PENDING,
      save: mockSave,
    }
    lastCreatedBar = instance
    return instance
  }

  MockBar.findOne = vi.fn()
  MockBar.findById = vi.fn()
  MockBar.create = vi.fn(async (data: any) => {
    const instance = new MockBar(data)
    return instance
  })

  return {
    default: MockBar,
    BarStatus: {
      PENDING: 'pending',
      ACTIVE: 'active',
      REJECTED: 'rejected',
    },
  }
})

// Mock BarUser model
vi.mock('../../models/BarUser', () => {
  const mockSave = vi.fn().mockResolvedValue(true)

  function MockBarUser(data: any) {
    const instance = {
      ...data,
      _id: new Types.ObjectId(),
      role: BarUserRole.OWNER,
      save: mockSave,
    }
    lastCreatedBarUser = instance
    return instance
  }

  MockBarUser.find = vi.fn()
  MockBarUser.create = vi.fn(async (data: any) => {
    const instance = new MockBarUser(data)
    return instance
  })

  return {
    default: MockBarUser,
    BarUserRole: {
      OWNER: 'OWNER',
      CASHIER: 'CASHIER',
    },
  }
})

describe('BarController.registerBar', () => {
  beforeEach(() => {
    vi.mocked(Bar.findOne).mockReset()
    vi.mocked(BarUser.create).mockClear()
    lastCreatedBar = null
    lastCreatedBarUser = null
  })

  describe('happy path', () => {
    it('returns 201 with confirmation message and pending status', async () => {
      const userId = new Types.ObjectId()
      vi.mocked(Bar.findOne).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'El Bar de Juan',
          address: {
            street: 'Av. Siempre Viva',
            number: '123',
            neighborhood: 'Centro',
            city: 'Buenos Aires',
          },
          phone: '+54 11 1234-5678',
          schedule: validSchedule,
          description: 'Un bar con buena onda',
        },
      })
      const res = buildMockResponse()

      await BarController.registerBar(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Tu bar fue registrado'),
          bar: expect.objectContaining({
            status: BarStatus.PENDING,
          }),
        })
      )
    })

    it('creates bar user association with OWNER role', async () => {
      const userId = new Types.ObjectId()
      vi.mocked(Bar.findOne).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'El Bar de Juan',
          address: {
            street: 'Av. Siempre Viva',
            number: '123',
            neighborhood: 'Centro',
            city: 'Buenos Aires',
          },
          phone: '+54 11 1234-5678',
          schedule: validSchedule,
        },
      })
      const res = buildMockResponse()

      await BarController.registerBar(req, res)

      expect(BarUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user: userId,
          role: BarUserRole.OWNER,
        })
      )
    })

    it('generates and passes slug to Bar.create', async () => {
      const userId = new Types.ObjectId()
      vi.mocked(Bar.findOne).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'El Bar de Juan',
          address: {
            street: 'Av. Siempre Viva',
            number: '123',
            city: 'Buenos Aires',
          },
          phone: '+54 11 1234-5678',
          schedule: validSchedule,
        },
      })
      const res = buildMockResponse()

      await BarController.registerBar(req, res)

      expect(Bar.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: expect.any(String),
        })
      )
    })
  })

  describe('validation error: name too short', () => {
    it('returns 400', async () => {
      const userId = new Types.ObjectId()
      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'El',
          address: {
            street: 'Av. Siempre Viva',
            number: '123',
            neighborhood: 'Centro',
            city: 'Buenos Aires',
          },
          phone: '+54 11 1234-5678',
          schedule: validSchedule,
        },
      })
      const res = buildMockResponse()

      await BarController.registerBar(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('entre 3 y 60'),
        })
      )
    })
  })

  describe('validation error: missing address field', () => {
    it('returns 400 when street is missing', async () => {
      const userId = new Types.ObjectId()
      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'El Bar de Juan',
          address: {
            number: '123',
            city: 'Buenos Aires',
          },
          phone: '+54 11 1234-5678',
          schedule: validSchedule,
        },
      })
      const res = buildMockResponse()

      await BarController.registerBar(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('calle'),
        })
      )
    })
  })

  describe('happy path: neighborhood is optional', () => {
    it('returns 201 without neighborhood', async () => {
      const userId = new Types.ObjectId()
      vi.mocked(Bar.findOne).mockResolvedValue(null)

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'El Bar de Juan',
          address: {
            street: 'Av. Siempre Viva',
            number: '123',
            city: 'Buenos Aires',
          },
          phone: '+54 11 1234-5678',
          schedule: validSchedule,
        },
      })
      const res = buildMockResponse()

      await BarController.registerBar(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(Bar.create).toHaveBeenCalledWith(
        expect.objectContaining({
          address: expect.not.objectContaining({
            neighborhood: expect.anything(),
          }),
        })
      )
    })
  })

  describe('validation error: description too long', () => {
    it('returns 400', async () => {
      const userId = new Types.ObjectId()
      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'El Bar de Juan',
          address: {
            street: 'Av. Siempre Viva',
            number: '123',
            neighborhood: 'Centro',
            city: 'Buenos Aires',
          },
          phone: '+54 11 1234-5678',
          schedule: validSchedule,
          description: 'a'.repeat(121),
        },
      })
      const res = buildMockResponse()

      await BarController.registerBar(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('120 caracteres'),
        })
      )
    })
  })

  describe('validation error: schedule is empty array', () => {
    it('returns 400', async () => {
      const userId = new Types.ObjectId()
      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'El Bar de Juan',
          address: {
            street: 'Av. Siempre Viva',
            number: '123',
            neighborhood: 'Centro',
            city: 'Buenos Aires',
          },
          phone: '+54 11 1234-5678',
          schedule: [],
        },
      })
      const res = buildMockResponse()

      await BarController.registerBar(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('al menos un día'),
        })
      )
    })
  })

  describe('validation error: schedule with invalid day', () => {
    it('returns 400', async () => {
      const userId = new Types.ObjectId()
      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'El Bar de Juan',
          address: {
            street: 'Av. Siempre Viva',
            number: '123',
            neighborhood: 'Centro',
            city: 'Buenos Aires',
          },
          phone: '+54 11 1234-5678',
          schedule: [{ day: 7, open: '20:00', close: '03:00' }],
        },
      })
      const res = buildMockResponse()

      await BarController.registerBar(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Día inválido'),
        })
      )
    })
  })

  describe('validation error: schedule with invalid time format', () => {
    it('returns 400 for invalid open time', async () => {
      const userId = new Types.ObjectId()
      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'El Bar de Juan',
          address: {
            street: 'Av. Siempre Viva',
            number: '123',
            neighborhood: 'Centro',
            city: 'Buenos Aires',
          },
          phone: '+54 11 1234-5678',
          schedule: [{ day: 1, open: '25:00', close: '03:00' }],
        },
      })
      const res = buildMockResponse()

      await BarController.registerBar(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Hora de apertura inválida'),
        })
      )
    })
  })

  describe('business error: duplicate name and city', () => {
    it('returns 409', async () => {
      const userId = new Types.ObjectId()
      // findOne is called first for slug uniqueness (returns null) and then for name/city duplicate check
      vi.mocked(Bar.findOne).mockImplementation(async (query: any) => {
        if (query && query.slug) return null
        return {
          _id: new Types.ObjectId(),
          name: 'El Bar de Juan',
          address: { city: 'Buenos Aires' },
        } as any
      })

      const req = buildMockRequest({
        user: { _id: userId } as any,
        body: {
          name: 'El Bar de Juan',
          address: {
            street: 'Otra Calle',
            number: '456',
            neighborhood: 'Otro Barrio',
            city: 'Buenos Aires',
          },
          phone: '+54 11 1234-5678',
          schedule: validSchedule,
        },
      })
      const res = buildMockResponse()

      await BarController.registerBar(req, res)

      expect(Bar.findOne).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Ya existe un bar'),
        })
      )
    })
  })
})

describe('BarController.getMyBars', () => {
  beforeEach(() => {
    vi.mocked(BarUser.find).mockReset()
  })

  it('returns list of bars with roles', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.find).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          bar: {
            _id: barId,
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
            status: BarStatus.PENDING,
          },
          role: BarUserRole.OWNER,
          createdAt: new Date(),
        },
      ]),
    } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
    })
    const res = buildMockResponse()

    await BarController.getMyBars(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: barId,
          name: 'El Bar de Juan',
          status: BarStatus.PENDING,
          role: BarUserRole.OWNER,
        }),
      ])
    )
  })
})

describe('BarController.activateBar', () => {
  beforeEach(() => {
    vi.mocked(Bar.findById).mockReset()
  })

  it('activates a pending bar', async () => {
    const barId = new Types.ObjectId()
    const mockBar = {
      _id: barId,
      name: 'El Bar de Juan',
      slug: 'el-bar-de-juan-ab12',
      status: BarStatus.PENDING,
      save: vi.fn().mockResolvedValue(true),
    }
    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

    const req = buildMockRequest({
      params: { id: barId.toString() },
    })
    const res = buildMockResponse()

    await BarController.activateBar(req, res)

    expect(mockBar.save).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('activado'),
        bar: expect.objectContaining({
          status: BarStatus.ACTIVE,
        }),
      })
    )
  })

  it('returns 404 when bar not found', async () => {
    vi.mocked(Bar.findById).mockResolvedValue(null)

    const req = buildMockRequest({
      params: { id: new Types.ObjectId().toString() },
    })
    const res = buildMockResponse()

    await BarController.activateBar(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 409 when bar is already active', async () => {
    const barId = new Types.ObjectId()
    const mockBar = {
      _id: barId,
      status: BarStatus.ACTIVE,
      save: vi.fn().mockResolvedValue(true),
    }
    vi.mocked(Bar.findById).mockResolvedValue(mockBar as any)

    const req = buildMockRequest({
      params: { id: barId.toString() },
    })
    const res = buildMockResponse()

    await BarController.activateBar(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
  })
})
