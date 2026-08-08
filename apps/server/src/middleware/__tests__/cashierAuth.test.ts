import { vi, describe, it, expect, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { Types } from 'mongoose'
import { authenticateCashier } from '../auth'
import User from '../../models/User'
import BarUser from '../../models/BarUser'
import Bar from '../../models/Bar'
import Shift, { ShiftEndReason } from '../../models/Shift'
import AuditLog, { AuditAction } from '../../models/AuditLog'
import { getLastClosingBoundary } from '../../utils/shift'
import { buildMockRequest, buildMockResponse, buildMockNext } from '../../__tests__/helpers/mockHelpers'

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
}))

vi.mock('../../models/User', () => ({
  default: { findById: vi.fn() },
}))

vi.mock('../../models/BarUser', () => ({
  default: { findOne: vi.fn() },
  BarUserRole: { OWNER: 'OWNER', CASHIER: 'CASHIER' },
}))

vi.mock('../../models/Bar', () => ({
  default: { findById: vi.fn() },
}))

vi.mock('../../models/Shift', () => ({
  default: { findOne: vi.fn() },
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

vi.mock('../../utils/shift', () => ({
  getLastClosingBoundary: vi.fn(),
}))

function buildDecodedToken(overrides: any = {}) {
  return {
    id: new Types.ObjectId().toString(),
    barId: new Types.ObjectId().toString(),
    role: 'CASHIER',
    ...overrides,
  }
}

describe('authenticateCashier middleware', () => {
  beforeEach(() => {
    vi.mocked(jwt.verify).mockReset()
    vi.mocked(User.findById).mockReset()
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(Bar.findById).mockReset()
    vi.mocked(Shift.findOne).mockReset()
    vi.mocked(AuditLog.create).mockReset()
    vi.mocked(getLastClosingBoundary).mockReset()
  })

  it('returns 401 when there is no cashier_access_token cookie', async () => {
    const req = buildMockRequest({ cookies: {} })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashier(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'No Autorizado' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when the token is invalid', async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('invalid token')
    })

    const req = buildMockRequest({ cookies: { cashier_access_token: 'bad-token' } })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashier(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'Token no válido o expirado' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when the user has no BarUser link (regular client)', async () => {
    const decoded = buildDecodedToken()
    vi.mocked(jwt.verify).mockReturnValue(decoded as any)
    vi.mocked(User.findById).mockResolvedValue({ _id: decoded.id, isActive: true } as any)
    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const req = buildMockRequest({ cookies: { cashier_access_token: 'valid-token' } })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashier(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ message: 'No tenés acceso a este bar' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when the BarUser (cashier account) is inactive', async () => {
    const decoded = buildDecodedToken()
    vi.mocked(jwt.verify).mockReturnValue(decoded as any)
    vi.mocked(User.findById).mockResolvedValue({ _id: decoded.id, isActive: true } as any)
    vi.mocked(BarUser.findOne).mockResolvedValue({ isActive: false } as any)

    const req = buildMockRequest({ cookies: { cashier_access_token: 'valid-token' } })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashier(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'Tu cuenta de cajero fue desactivada' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when there is no active shift', async () => {
    const decoded = buildDecodedToken()
    vi.mocked(jwt.verify).mockReturnValue(decoded as any)
    vi.mocked(User.findById).mockResolvedValue({ _id: decoded.id, isActive: true } as any)
    vi.mocked(BarUser.findOne).mockResolvedValue({ isActive: true } as any)
    vi.mocked(Shift.findOne).mockResolvedValue(null)

    const req = buildMockRequest({ cookies: { cashier_access_token: 'valid-token' } })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashier(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'No hay un turno activo, iniciá sesión nuevamente' })
    expect(next).not.toHaveBeenCalled()
  })

  it('auto-closes the shift and returns 401 when it started before the bar closing boundary', async () => {
    const decoded = buildDecodedToken()
    const boundary = new Date('2026-08-06T06:00:00')
    const shift = {
      startedAt: new Date('2026-08-05T20:00:00'), // antes del boundary
      deviceInfo: 'POS-1',
      endedAt: undefined,
      endReason: undefined,
      save: vi.fn().mockResolvedValue(true),
    }

    vi.mocked(jwt.verify).mockReturnValue(decoded as any)
    vi.mocked(User.findById).mockResolvedValue({ _id: decoded.id, isActive: true } as any)
    vi.mocked(BarUser.findOne).mockResolvedValue({ isActive: true } as any)
    vi.mocked(Shift.findOne).mockResolvedValue(shift as any)
    vi.mocked(Bar.findById).mockResolvedValue({ closingTime: '06:00' } as any)
    vi.mocked(getLastClosingBoundary).mockReturnValue(boundary)

    const req = buildMockRequest({ cookies: { cashier_access_token: 'valid-token' } })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashier(req, res, next)

    expect(shift.endReason).toBe(ShiftEndReason.BAR_CLOSED)
    expect(shift.endedAt).toBe(boundary)
    expect(shift.save).toHaveBeenCalled()
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.SHIFT_AUTO_CLOSED })
    )
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'El turno se cerró automáticamente al horario de cierre del bar' })
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next() and sets req.cashierContext on the happy path', async () => {
    const decoded = buildDecodedToken()
    const boundary = new Date('2026-08-06T06:00:00')
    const mockUser = { _id: decoded.id, isActive: true }
    const mockBarUser = { isActive: true, role: 'CASHIER' }
    const shift = {
      startedAt: new Date('2026-08-06T08:00:00'), // después del boundary, turno vigente
      deviceInfo: 'POS-1',
    }

    vi.mocked(jwt.verify).mockReturnValue(decoded as any)
    vi.mocked(User.findById).mockResolvedValue(mockUser as any)
    vi.mocked(BarUser.findOne).mockResolvedValue(mockBarUser as any)
    vi.mocked(Shift.findOne).mockResolvedValue(shift as any)
    vi.mocked(Bar.findById).mockResolvedValue({ closingTime: '06:00' } as any)
    vi.mocked(getLastClosingBoundary).mockReturnValue(boundary)

    const req = buildMockRequest({ cookies: { cashier_access_token: 'valid-token' } })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashier(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.cashierContext).toEqual(
      expect.objectContaining({
        user: mockUser,
        barUser: mockBarUser,
        shift,
      })
    )
    expect(res.status).not.toHaveBeenCalled()
  })
})
