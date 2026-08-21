import { vi, describe, it, expect, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { Types } from 'mongoose'
import { authenticateCashier, authenticateCashierSummary } from '../auth'
import User from '../../models/User'
import BarUser from '../../models/BarUser'
import Bar from '../../models/Bar'
import Shift from '../../models/Shift'
import { getLastClosingBoundary } from '../../utils/shift'
import { closeBar } from '../../utils/closeBar'
import { buildMockRequest, buildMockResponse, buildMockNext } from '../../__tests__/helpers/mockHelpers'

import { generateShiftSummary } from '../../utils/shiftSummary'

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

vi.mock('../../utils/shift', () => ({
  getLastClosingBoundary: vi.fn(),
}))

// LB-66: la lógica de cierre (turnos + salidas) se extrajo a `closeBar`
// (ver apps/server/src/utils/__tests__/closeBar.test.ts para su cobertura
// aislada). El middleware solo la invoca cuando detecta que el turno
// vigente quedó vencido.
vi.mock('../../utils/closeBar', () => ({
  closeBar: vi.fn().mockResolvedValue({ closedShifts: 0, closedOutings: 0 }),
}))

// LB-73: tras el cierre automático el middleware devuelve el envelope de
// recuperación con el resumen del turno.
vi.mock('../../utils/shiftSummary', () => ({
  generateShiftSummary: vi.fn(),
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
    vi.mocked(getLastClosingBoundary).mockReset()
    vi.mocked(closeBar).mockReset()
    vi.mocked(closeBar).mockResolvedValue({ closedShifts: 0, closedOutings: 0 })
    vi.mocked(generateShiftSummary).mockReset()
  })

  it('returns 401 when there is no access_token cookie', async () => {
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

    const req = buildMockRequest({ cookies: { access_token: 'bad-token' } })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashier(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'Token no válido o expirado' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when the decoded token has no barId (user-mode token)', async () => {
    // LB-66: un access_token emitido en modo `user` (sin barId/role) no
    // debe habilitar el panel de cajero.
    vi.mocked(jwt.verify).mockReturnValue({ id: new Types.ObjectId().toString() } as any)

    const req = buildMockRequest({ cookies: { access_token: 'user-mode-token' } })
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

    const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
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

    const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
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

    const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashier(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: 'No hay un turno activo, iniciá sesión nuevamente' })
    expect(next).not.toHaveBeenCalled()
  })

  it('delegates to closeBar and returns 401 when the shift started before the bar closing boundary', async () => {
    const decoded = buildDecodedToken()
    const boundary = new Date('2026-08-06T06:00:00')
    const shift = {
      _id: new Types.ObjectId(),
      bar: new Types.ObjectId(decoded.barId),
      user: new Types.ObjectId(decoded.id),
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
    const summary = { redemptionsAvailable: false }
    vi.mocked(generateShiftSummary).mockResolvedValue(summary as any)

    const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashier(req, res, next)

    expect(closeBar).toHaveBeenCalledWith(
      decoded.barId,
      expect.objectContaining({
        actorUserId: decoded.id,
        deviceInfo: shift.deviceInfo,
        boundary,
      })
    )
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      message: 'El turno se cerró automáticamente al horario de cierre del bar',
      code: 'SHIFT_AUTO_CLOSED',
      shiftId: shift._id.toString(),
      summary,
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('authenticates a cashier for a closed-shift summary without requiring an active shift', async () => {
    const decoded = buildDecodedToken()
    const user = { _id: decoded.id, isActive: true }
    const barUser = { isActive: true, role: 'CASHIER' }
    vi.mocked(jwt.verify).mockReturnValue(decoded as any)
    vi.mocked(User.findById).mockResolvedValue(user as any)
    vi.mocked(BarUser.findOne).mockResolvedValue(barUser as any)

    const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashierSummary(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.cashierSummaryContext).toEqual(expect.objectContaining({
      user,
      barUser,
    }))
    expect(Shift.findOne).not.toHaveBeenCalled()
  })

  it('calls next() and sets req.cashierContext on the happy path', async () => {
    const decoded = buildDecodedToken()
    const boundary = new Date('2026-08-06T06:00:00')
    const mockUser = { _id: decoded.id, isActive: true }
    const mockBarUser = { isActive: true, role: 'CASHIER' }
    const shift = {
      bar: new Types.ObjectId(decoded.barId),
      user: new Types.ObjectId(decoded.id),
      startedAt: new Date('2026-08-06T08:00:00'), // después del boundary, turno vigente
      deviceInfo: 'POS-1',
    }

    vi.mocked(jwt.verify).mockReturnValue(decoded as any)
    vi.mocked(User.findById).mockResolvedValue(mockUser as any)
    vi.mocked(BarUser.findOne).mockResolvedValue(mockBarUser as any)
    vi.mocked(Shift.findOne).mockResolvedValue(shift as any)
    vi.mocked(Bar.findById).mockResolvedValue({ closingTime: '06:00' } as any)
    vi.mocked(getLastClosingBoundary).mockReturnValue(boundary)

    const req = buildMockRequest({ cookies: { access_token: 'valid-token' } })
    const res = buildMockResponse()
    const next = buildMockNext()

    await authenticateCashier(req, res, next)

    expect(closeBar).not.toHaveBeenCalled()
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
