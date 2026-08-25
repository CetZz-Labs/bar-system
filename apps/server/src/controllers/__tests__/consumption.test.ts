import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ConsumptionController } from '../../controllers/ConsumptionController'
import Consumption from '../../models/Consumption'
import Outing from '../../models/Outing'
import { writeAuditLog } from '../../utils/auditLogService'
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

vi.mock('../../utils/auditLogService', () => ({
  writeAuditLog: vi.fn(),
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

// req.cashierContext es poblado por el middleware authenticateCashier (LB-53),
// no por el controller — acá lo simulamos directo, tal como haría el middleware
// tras validar sesión + turno activo sobre `bar`.
function buildCashierContext(overrides: any = {}) {
  return {
    user: { _id: new Types.ObjectId() },
    bar: new Types.ObjectId(),
    barUser: { role: 'CASHIER' },
    shift: { deviceInfo: 'test-device' },
    ...overrides,
  }
}

describe('ConsumptionController.createConsumption', () => {
  let barId: Types.ObjectId
  let outingId: Types.ObjectId
  let groupId: Types.ObjectId
  let cashierContext: any
  let mockOuting: any
  let mockGeneratedQr: any

  beforeEach(() => {
    outingId = new Types.ObjectId()
    groupId = new Types.ObjectId()
    barId = new Types.ObjectId()
    cashierContext = buildCashierContext({ bar: barId })

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
    vi.mocked(generate).mockReset().mockResolvedValue(mockGeneratedQr)
    vi.mocked(Consumption.create).mockReset()
    vi.mocked(writeAuditLog).mockReset()
  })

  function buildRequest(overrides: any = {}) {
    return buildMockRequest({
      cashierContext,
      params: { outingId: outingId.toString() },
      body: { amount: 12000 },
      ...overrides,
    })
  }

  describe('happy path', () => {
    it('creates the consumption, audits it and returns the QR + manual code', async () => {
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
          cashier: cashierContext.user._id,
          amount: 12000,
          status: 'PENDING_LEADER_CONFIRMATION',
          qrToken: 'signed-jwt-token',
          manualCode: '123456',
        })
      )
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          bar: barId,
          actorType: 'CASHIER',
          actorId: cashierContext.user._id,
          eventType: 'consumo.registered',
          deviceInfo: 'test-device',
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

    it('audits the consumption with amount, outing and group', async () => {
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

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'consumo.registered',
          metadata: expect.objectContaining({
            amount: 12000,
            outingId: outingId.toString(),
            groupId,
          }),
        })
      )
    })
  })

  describe('isUnusualAmount', () => {
    it('sets isUnusualAmount to true when amount is greater than 500000', async () => {
      const createdId = new Types.ObjectId()
      vi.mocked(Consumption.create).mockResolvedValue({
        _id: createdId,
        amount: 600000,
        breakdown: undefined,
        status: 'PENDING_LEADER_CONFIRMATION',
      } as any)

      const req = buildRequest({ body: { amount: 600000 } })
      const res = buildMockResponse()

      await ConsumptionController.createConsumption(req, res)

      expect(Consumption.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 600000, isUnusualAmount: true })
      )
    })

    it('sets isUnusualAmount to false when amount is less than or equal to 500000', async () => {
      const createdId = new Types.ObjectId()
      vi.mocked(Consumption.create).mockResolvedValue({
        _id: createdId,
        amount: 500000,
        breakdown: undefined,
        status: 'PENDING_LEADER_CONFIRMATION',
      } as any)

      const req = buildRequest({ body: { amount: 500000 } })
      const res = buildMockResponse()

      await ConsumptionController.createConsumption(req, res)

      expect(Consumption.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500000, isUnusualAmount: false })
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
    it('returns 403 when the outing belongs to a different bar than the cashier session', async () => {
      const otherBar = new Types.ObjectId()
      vi.mocked(Outing.findById).mockReturnValue(buildLeanQuery({ ...mockOuting, bar: otherBar }) as any)

      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.createConsumption(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: 'Esta salida no pertenece a tu bar' })
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
  let barId: Types.ObjectId
  let outingId: Types.ObjectId
  let consumptionId: Types.ObjectId
  let groupId: Types.ObjectId
  let cashierContext: any
  let mockConsumption: any
  let mockGeneratedQr: any

  beforeEach(() => {
    outingId = new Types.ObjectId()
    barId = new Types.ObjectId()
    consumptionId = new Types.ObjectId()
    groupId = new Types.ObjectId()
    cashierContext = buildCashierContext({ bar: barId })

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
    vi.mocked(generate).mockReset().mockResolvedValue(mockGeneratedQr)
    vi.mocked(Outing.findById).mockReset().mockReturnValue(buildSelectLeanQuery({ group: groupId }) as any)
    vi.mocked(writeAuditLog).mockReset()
  })

  function buildRequest(overrides: any = {}) {
    return buildMockRequest({
      cashierContext,
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

    it('audits the regeneration with amount, outing and group', async () => {
      const req = buildRequest()
      const res = buildMockResponse()

      await ConsumptionController.regenerateConsumption(req, res)

      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          bar: barId,
          actorType: 'CASHIER',
          actorId: cashierContext.user._id,
          eventType: 'consumo.regenerated',
          deviceInfo: 'test-device',
          metadata: expect.objectContaining({
            amount: mockConsumption.amount,
            outingId: outingId,
            groupId,
          }),
        })
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
    it('returns 403 when the consumption belongs to a different bar than the cashier session', async () => {
      vi.mocked(Consumption.findOne).mockResolvedValue({ ...mockConsumption, bar: new Types.ObjectId() })

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
  let barId: Types.ObjectId
  let outingId: Types.ObjectId
  let cashierContext: any
  let mockOuting: any

  beforeEach(() => {
    outingId = new Types.ObjectId()
    barId = new Types.ObjectId()
    cashierContext = buildCashierContext({ bar: barId })

    mockOuting = { _id: outingId, bar: barId }

    vi.mocked(Outing.findById).mockReset().mockReturnValue(buildSelectLeanQuery(mockOuting) as any)
    vi.mocked(Consumption.find).mockReset().mockReturnValue(buildSelectSortLeanQuery([]) as any)
  })

  function buildRequest(overrides: any = {}) {
    return buildMockRequest({
      cashierContext,
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
        status: { $in: ['PENDING_LEADER_CONFIRMATION', 'REJECTED'] },
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
    it('returns 403 when the outing belongs to a different bar than the cashier session', async () => {
      vi.mocked(Outing.findById).mockReturnValue(buildSelectLeanQuery({ ...mockOuting, bar: new Types.ObjectId() }) as any)

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
