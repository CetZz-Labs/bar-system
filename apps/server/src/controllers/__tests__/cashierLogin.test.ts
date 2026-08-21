import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { CashierController } from '../../controllers/CashierController'
import User from '../../models/User'
import BarUser, { BarUserRole } from '../../models/BarUser'
import Shift, { ShiftEndReason } from '../../models/Shift'
import AuditLog, { AuditAction } from '../../models/AuditLog'
import { checkPassword } from '../../utils/auth'
import { generateJWT } from '../../utils/jwt'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

vi.mock('../../models/User', () => ({
  default: { findOne: vi.fn() },
  // Group.ts (importado transitivamente vía utils/cashierSearch.ts) necesita
  // este export en tiempo de módulo para construir su schema de Mongoose.
  MembershipRole: { ADMIN: 'ADMIN', MEMBER: 'MEMBER', LEADER: 'LEADER', CO_LEADER: 'CO_LEADER' },
}))

vi.mock('../../models/BarUser', () => ({
  default: { findOne: vi.fn() },
  BarUserRole: { OWNER: 'OWNER', CASHIER: 'CASHIER' },
}))

vi.mock('../../models/Shift', () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
  ShiftEndReason: { MANUAL: 'MANUAL', KICKED_OUT: 'KICKED_OUT', BAR_CLOSED: 'BAR_CLOSED' },
}))

vi.mock('../../models/AuditLog', () => ({
  default: { create: vi.fn() },
  AuditAction: {
    CASHIER_LOGIN: 'CASHIER_LOGIN',
    CASHIER_LOGOUT: 'CASHIER_LOGOUT',
    CASHIER_KICKED_OUT: 'CASHIER_KICKED_OUT',
    SHIFT_AUTO_CLOSED: 'SHIFT_AUTO_CLOSED',
  },
}))

vi.mock('../../utils/auth', () => ({
  checkPassword: vi.fn(),
  hashPassword: vi.fn(),
}))

vi.mock('../../utils/jwt', () => ({
  generateJWT: vi.fn(),
}))

vi.mock('../../utils/shiftSummary', () => ({
  generateShiftSummary: vi.fn(),
}))

function buildMockDbUser(overrides: any = {}) {
  return {
    _id: new Types.ObjectId(),
    email: 'cajero@example.com',
    password: '$2b$04$hashedpassword',
    isActive: true,
    ...overrides,
  }
}

function buildMockBarUser(overrides: any = {}) {
  return {
    _id: new Types.ObjectId(),
    role: BarUserRole.CASHIER,
    isActive: true,
    ...overrides,
  }
}

describe('CashierController.login', () => {
  beforeEach(() => {
    vi.mocked(User.findOne).mockReset()
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(Shift.findOne).mockReset()
    vi.mocked(Shift.create).mockReset()
    vi.mocked(AuditLog.create).mockReset()
    vi.mocked(checkPassword).mockReset()
    vi.mocked(generateJWT).mockReset()

    vi.mocked(Shift.create).mockResolvedValue({ startedAt: new Date() } as any)
    vi.mocked(AuditLog.create).mockResolvedValue({} as any)
    vi.mocked(generateJWT).mockReturnValue('mock-cashier-token' as any)
  })

  it('returns 200 and sets cookie when a CASHIER logs in successfully', async () => {
    const barId = new Types.ObjectId().toString()
    const mockUser = buildMockDbUser()
    const mockBarUser = buildMockBarUser({ role: BarUserRole.CASHIER })

    vi.mocked(User.findOne).mockResolvedValue(mockUser as any)
    vi.mocked(checkPassword).mockResolvedValue(true)
    vi.mocked(BarUser.findOne).mockResolvedValue(mockBarUser as any)
    vi.mocked(Shift.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      body: { email: mockUser.email, password: 'password123', barId, deviceInfo: 'POS-1' },
    })
    const res = buildMockResponse()

    await CashierController.login(req, res)

    expect(res.cookie).toHaveBeenCalledWith(
      'cashier_access_token',
      'mock-cashier-token',
      expect.objectContaining({ httpOnly: true })
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ role: BarUserRole.CASHIER, bar: barId })
    )
  })

  it('returns 200 when the OWNER logs in with their own account', async () => {
    const barId = new Types.ObjectId().toString()
    const mockUser = buildMockDbUser()
    const mockBarUser = buildMockBarUser({ role: BarUserRole.OWNER })

    vi.mocked(User.findOne).mockResolvedValue(mockUser as any)
    vi.mocked(checkPassword).mockResolvedValue(true)
    vi.mocked(BarUser.findOne).mockResolvedValue(mockBarUser as any)
    vi.mocked(Shift.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      body: { email: mockUser.email, password: 'password123', barId, deviceInfo: 'POS-1' },
    })
    const res = buildMockResponse()

    await CashierController.login(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ role: BarUserRole.OWNER })
    )
  })

  it('returns 404 when the user does not exist', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      body: { email: 'nope@example.com', password: 'password123', barId: new Types.ObjectId().toString(), deviceInfo: 'POS-1' },
    })
    const res = buildMockResponse()

    await CashierController.login(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 403 when the password is incorrect', async () => {
    const mockUser = buildMockDbUser()
    vi.mocked(User.findOne).mockResolvedValue(mockUser as any)
    vi.mocked(checkPassword).mockResolvedValue(false)

    const req = buildMockRequest({
      body: { email: mockUser.email, password: 'wrong', barId: new Types.ObjectId().toString(), deviceInfo: 'POS-1' },
    })
    const res = buildMockResponse()

    await CashierController.login(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 403 when the user is not a BarUser of the bar (regular client)', async () => {
    const mockUser = buildMockDbUser()
    vi.mocked(User.findOne).mockResolvedValue(mockUser as any)
    vi.mocked(checkPassword).mockResolvedValue(true)
    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      body: { email: mockUser.email, password: 'password123', barId: new Types.ObjectId().toString(), deviceInfo: 'POS-1' },
    })
    const res = buildMockResponse()

    await CashierController.login(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 401 when the BarUser (cashier account) is inactive', async () => {
    const mockUser = buildMockDbUser()
    const mockBarUser = buildMockBarUser({ isActive: false })
    vi.mocked(User.findOne).mockResolvedValue(mockUser as any)
    vi.mocked(checkPassword).mockResolvedValue(true)
    vi.mocked(BarUser.findOne).mockResolvedValue(mockBarUser as any)

    const req = buildMockRequest({
      body: { email: mockUser.email, password: 'password123', barId: new Types.ObjectId().toString(), deviceInfo: 'POS-1' },
    })
    const res = buildMockResponse()

    await CashierController.login(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('closes the previous active shift with KICKED_OUT reason before creating the new one', async () => {
    const barId = new Types.ObjectId().toString()
    const mockUser = buildMockDbUser()
    const mockBarUser = buildMockBarUser()
    const previousShift = {
      endedAt: undefined,
      endReason: undefined,
      deviceInfo: 'OLD-DEVICE',
      save: vi.fn().mockResolvedValue(true),
    }

    vi.mocked(User.findOne).mockResolvedValue(mockUser as any)
    vi.mocked(checkPassword).mockResolvedValue(true)
    vi.mocked(BarUser.findOne).mockResolvedValue(mockBarUser as any)
    vi.mocked(Shift.findOne).mockResolvedValue(previousShift as any)

    const req = buildMockRequest({
      body: { email: mockUser.email, password: 'password123', barId, deviceInfo: 'NEW-DEVICE' },
    })
    const res = buildMockResponse()

    await CashierController.login(req, res)

    expect(previousShift.endReason).toBe(ShiftEndReason.KICKED_OUT)
    expect(previousShift.endedAt).toBeInstanceOf(Date)
    expect(previousShift.save).toHaveBeenCalled()
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CASHIER_KICKED_OUT })
    )
    expect(Shift.create).toHaveBeenCalledWith(
      expect.objectContaining({ bar: barId, deviceInfo: 'NEW-DEVICE' })
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })
})

describe('CashierController.closeShift', () => {
  it('closes the active shift and returns its persisted summary', async () => {
    const summary = {
      status: 'PENDING',
      totalConsumptions: 1,
      confirmedConsumptions: 1,
      pendingConsumptions: 0,
      rejectedConsumptions: 0,
      disputedConsumptions: 0,
      totalAmount: 5000,
      pointsAwarded: 3,
      redemptionCount: 0,
      redemptionsAvailable: false,
      generatedAt: new Date(),
    }
    const shift = {
      _id: new Types.ObjectId(),
      deviceInfo: 'POS-1',
      save: vi.fn().mockResolvedValue(true),
    }
    const user = { _id: new Types.ObjectId() }
    const { generateShiftSummary } = await import('../../utils/shiftSummary')
    vi.mocked(generateShiftSummary).mockResolvedValue(summary as any)
    vi.mocked(AuditLog.create).mockResolvedValue({} as any)

    const req = buildMockRequest({
      ip: '127.0.0.1',
      cashierContext: {
        user,
        bar: new Types.ObjectId(),
        barUser: { role: BarUserRole.CASHIER },
        shift,
      },
    } as any)
    const res = buildMockResponse()

    await CashierController.closeShift(req, res)

    expect(shift.save).toHaveBeenCalled()
    expect(generateShiftSummary).toHaveBeenCalledWith(shift._id.toString())
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ summary }))
  })
})
