import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ConsumptionController } from '../../controllers/ConsumptionController'
import Consumption from '../../models/Consumption'
import Outing from '../../models/Outing'
import { verifyBarAccess } from '../../utils/barAccess'
import { generate } from '../../utils/consumptionQr'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import { Types } from 'mongoose'

vi.mock('../../models/Consumption', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
  },
  ConsumptionStatus: {
    PENDING_LEADER_CONFIRMATION: 'PENDING_LEADER_CONFIRMATION',
    CONFIRMED: 'CONFIRMED',
    REJECTED: 'REJECTED',
    DISPUTED: 'DISPUTED',
  },
}))

vi.mock('../../models/Outing', () => ({
  default: {
    findById: vi.fn(),
  },
  OutingStatus: {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    CANCELLED: 'CANCELLED',
    COMPLETED: 'COMPLETED',
  },
}))

vi.mock('../../models/BarUser', () => ({
  BarUserRole: {
    OWNER: 'OWNER',
    WAITER: 'WAITER',
    MANAGER: 'MANAGER',
    CASHIER: 'CASHIER',
  },
}))

vi.mock('../../utils/barAccess', () => ({
  verifyBarAccess: vi.fn(),
}))

vi.mock('../../utils/consumptionQr', () => ({
  generate: vi.fn(),
}))

function buildLeanQuery(data: any) {
  return { lean: vi.fn().mockResolvedValue(data) }
}

function buildSelectLeanQuery(data: any) {
  const query: any = {}
  query.select = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(data)
  return query
}

function buildSelectSortLeanQuery(data: any) {
  const query: any = {}
  query.select = vi.fn().mockReturnValue(query)
  query.sort = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(data)
  return query
}

describe('ConsumptionController.createConsumption', () => {
  let cashierId: Types.ObjectId
  let outingId: Types.ObjectId
  let groupId: Types.ObjectId
  let barId: Types.ObjectId
  let mockOuting: any
  let mockGeneratedQr: any

  beforeEach(() => {
    cashierId = new Types.ObjectId()
    outingId = new Types.ObjectId()
    groupId = new Types.ObjectId()
    barId = new Types.ObjectId()

    mockOuting = {
      _id: outingId,
      group: groupId,
      bar: barId,
      status: 'ACTIVE',
    }

    mockGeneratedQr = {
      qrData: 'data:image/png;base64,fakeimage',
      qrToken: 'signed-jwt-token',
      manualCode: '123456',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    }

    vi.mocked(Outing.findById).mockReset().mockReturnValue(buildLeanQuery(mockOuting) as any)
    vi.mocked(verifyBarAccess).mockReset().mockResolvedValue({ hasAccess: true, role: 'CASHIER' as any })
    vi.mocked(generate).mockReset().mockResolvedValue(mockGeneratedQr)
    vi.mocked(Consumption.create).mockReset()
  })

  function buildRequest(overrides: any = {}) {
    return buildMockRequest({
      user: { _id: cashierId } as any,
      params: { outingId: outingId.toString() },
      body: { amount: 12000 },
      ...overrides,
    })
  }

  describe('happy path', () => {
    it('creates the consumption and returns the QR + manual code', async () => {
      const createdId = new Types.ObjectId()
      vi.mocked(Consumption.create).mockResolvedValue({
        _id: createdId,
        amount: 12000,
        breakdown: undefined,
        status: 'PENDING_LEADER_CONFIRMATION',
      } as any)

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.createConsumption(req, res)

      expect(generate).toHaveBeenCalled()
      expect(Consumption.create).toHaveBeenCalledWith(
        expect.objectContaining({
          outing: outingId.toString(),
          bar: barId,
          cashier: cashierId.toString(),
          amount: 12000,
          status: 'PENDING_LEADER_CONFIRMATION',
          qrToken: 'signed-jwt-token',
          manualCode: '123456',
        })
      )
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          consumptionId: createdId,
          qrData: mockGeneratedQr.qrData,
          manualCode: '123456',
        })
      )
    })
  })

  describe('outing not found', () => {
    it('returns 404', async () => {
      vi.mocked(Outing.findById).mockReturnValue(buildLeanQuery(null) as any)

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.createConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(Consumption.create).not.toHaveBeenCalled()
    })
  })

  describe('authorization', () => {
    it('returns 403 when the cashier has no BarUser membership on the outing bar', async () => {
      vi.mocked(verifyBarAccess).mockResolvedValue({ hasAccess: false })

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.createConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: 'Esta salida no pertenece a tu bar' })
      expect(Consumption.create).not.toHaveBeenCalled()
    })

    it('returns 403 when the BarUser role is not CASHIER', async () => {
      vi.mocked(verifyBarAccess).mockResolvedValue({ hasAccess: true, role: 'WAITER' as any })

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.createConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(Consumption.create).not.toHaveBeenCalled()
    })
  })

  describe('outing status guard', () => {
    it('returns 409 when the outing is COMPLETED', async () => {
      vi.mocked(Outing.findById).mockReturnValue(buildLeanQuery({ ...mockOuting, status: 'COMPLETED' }) as any)

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.createConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(Consumption.create).not.toHaveBeenCalled()
    })

    it('returns 409 when the outing is CANCELLED', async () => {
      vi.mocked(Outing.findById).mockReturnValue(buildLeanQuery({ ...mockOuting, status: 'CANCELLED' }) as any)

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.createConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
    })

    it('returns 409 when the outing is still PENDING (no check-in yet)', async () => {
      vi.mocked(Outing.findById).mockReturnValue(buildLeanQuery({ ...mockOuting, status: 'PENDING' }) as any)

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.createConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
    })
  })

  describe('server error', () => {
    it('returns 500 when Outing.findById throws', async () => {
      vi.mocked(Outing.findById).mockImplementation(() => {
        throw new Error('DB error')
      })

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.createConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})

describe('ConsumptionController.regenerateConsumption', () => {
  let cashierId: Types.ObjectId
  let outingId: Types.ObjectId
  let barId: Types.ObjectId
  let consumptionId: Types.ObjectId
  let mockConsumption: any
  let mockGeneratedQr: any

  beforeEach(() => {
    cashierId = new Types.ObjectId()
    outingId = new Types.ObjectId()
    barId = new Types.ObjectId()
    consumptionId = new Types.ObjectId()

    mockConsumption = {
      _id: consumptionId,
      outing: outingId,
      bar: barId,
      amount: 10000,
      status: 'PENDING_LEADER_CONFIRMATION',
      qrToken: 'old-token',
      manualCode: '111111',
      expiresAt: new Date(Date.now() + 1000),
      invalidatedAt: null,
      save: vi.fn().mockResolvedValue(true),
    }

    mockGeneratedQr = {
      qrData: 'data:image/png;base64,newimage',
      qrToken: 'new-token',
      manualCode: '222222',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    }

    vi.mocked(Consumption.findOne).mockReset().mockResolvedValue(mockConsumption)
    vi.mocked(verifyBarAccess).mockReset().mockResolvedValue({ hasAccess: true, role: 'CASHIER' as any })
    vi.mocked(generate).mockReset().mockResolvedValue(mockGeneratedQr)
  })

  function buildRequest(overrides: any = {}) {
    return buildMockRequest({
      user: { _id: cashierId } as any,
      params: { outingId: outingId.toString(), consumptionId: consumptionId.toString() },
      body: {},
      ...overrides,
    })
  }

  describe('happy path', () => {
    it('invalidates the previous code and persists a fresh one', async () => {
      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.regenerateConsumption(req, res)

      expect(mockConsumption.qrToken).toBe('new-token')
      expect(mockConsumption.manualCode).toBe('222222')
      expect(mockConsumption.invalidatedAt).toBeNull()
      expect(mockConsumption.save).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ qrData: mockGeneratedQr.qrData, manualCode: '222222' })
      )
    })
  })

  describe('consumption not found', () => {
    it('returns 404', async () => {
      vi.mocked(Consumption.findOne).mockResolvedValue(null)

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.regenerateConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  describe('authorization', () => {
    it('returns 403 when the cashier does not belong to the consumption bar', async () => {
      vi.mocked(verifyBarAccess).mockResolvedValue({ hasAccess: false })

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.regenerateConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(mockConsumption.save).not.toHaveBeenCalled()
    })
  })

  describe('status guard (idempotency against already-decided consumptions)', () => {
    it('returns 409 when the consumption was already CONFIRMED', async () => {
      vi.mocked(Consumption.findOne).mockResolvedValue({ ...mockConsumption, status: 'CONFIRMED' })

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.regenerateConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
    })
  })

  describe('server error', () => {
    it('returns 500 when findOne throws', async () => {
      vi.mocked(Consumption.findOne).mockImplementation(() => {
        throw new Error('DB error')
      })

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.regenerateConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})

describe('ConsumptionController.getPendingConsumptions', () => {
  let cashierId: Types.ObjectId
  let outingId: Types.ObjectId
  let barId: Types.ObjectId
  let mockOuting: any

  beforeEach(() => {
    cashierId = new Types.ObjectId()
    outingId = new Types.ObjectId()
    barId = new Types.ObjectId()

    mockOuting = { _id: outingId, bar: barId }

    vi.mocked(Outing.findById).mockReset().mockReturnValue(buildSelectLeanQuery(mockOuting) as any)
    vi.mocked(verifyBarAccess).mockReset().mockResolvedValue({ hasAccess: true, role: 'CASHIER' as any })
    vi.mocked(Consumption.find).mockReset().mockReturnValue(buildSelectSortLeanQuery([]) as any)
  })

  function buildRequest(overrides: any = {}) {
    return buildMockRequest({
      user: { _id: cashierId } as any,
      params: { outingId: outingId.toString() },
      ...overrides,
    })
  }

  describe('happy path', () => {
    it('returns the list of pending consumptions for the outing', async () => {
      const pending = [{ _id: new Types.ObjectId(), amount: 5000, status: 'PENDING_LEADER_CONFIRMATION' }]
      vi.mocked(Consumption.find).mockReturnValue(buildSelectSortLeanQuery(pending) as any)

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.getPendingConsumptions(req, res)

      expect(Consumption.find).toHaveBeenCalledWith({
        outing: outingId.toString(),
        status: 'PENDING_LEADER_CONFIRMATION',
      })
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(pending)
    })
  })

  describe('outing not found', () => {
    it('returns 404', async () => {
      vi.mocked(Outing.findById).mockReturnValue(buildSelectLeanQuery(null) as any)

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.getPendingConsumptions(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  describe('authorization', () => {
    it('returns 403 when the requester is not the bar cashier', async () => {
      vi.mocked(verifyBarAccess).mockResolvedValue({ hasAccess: true, role: 'MANAGER' as any })

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.getPendingConsumptions(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(Consumption.find).not.toHaveBeenCalled()
    })
  })

  describe('server error', () => {
    it('returns 500 when Outing.findById throws', async () => {
      vi.mocked(Outing.findById).mockImplementation(() => {
        throw new Error('DB error')
      })

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.getPendingConsumptions(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})
