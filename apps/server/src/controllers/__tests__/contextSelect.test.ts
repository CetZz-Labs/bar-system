import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { ContextController, ContextMode } from '../ContextController'
import BarUser, { BarUserRole } from '../../models/BarUser'
import Shift, { ShiftEndReason } from '../../models/Shift'
import AuditLog, { AuditAction } from '../../models/AuditLog'
import { generateJWT } from '../../utils/jwt'
import { closeBar } from '../../utils/closeBar'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

vi.mock('../../models/BarUser', () => ({
  default: { findOne: vi.fn(), find: vi.fn() },
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

vi.mock('../../utils/jwt', () => ({
  generateJWT: vi.fn(),
}))

vi.mock('../../utils/closeBar', () => ({
  closeBar: vi.fn().mockResolvedValue({ closedShifts: 0, closedOutings: 0 }),
}))

function buildMockUser(overrides: any = {}) {
  return { _id: new Types.ObjectId(), ...overrides }
}

function buildMockBarUser(overrides: any = {}) {
  return { _id: new Types.ObjectId(), role: BarUserRole.CASHIER, isActive: true, ...overrides }
}

describe('ContextController.select', () => {
  beforeEach(() => {
    vi.mocked(BarUser.findOne).mockReset()
    vi.mocked(Shift.findOne).mockReset()
    vi.mocked(Shift.create).mockReset()
    vi.mocked(AuditLog.create).mockReset()
    vi.mocked(generateJWT).mockReset()
    vi.mocked(closeBar).mockReset()

    vi.mocked(Shift.create).mockResolvedValue({ startedAt: new Date() } as any)
    vi.mocked(AuditLog.create).mockResolvedValue({} as any)
    vi.mocked(generateJWT).mockReturnValue('mock-token' as any)
    vi.mocked(closeBar).mockResolvedValue({ closedShifts: 0, closedOutings: 0 })
  })

  it('mode "user": re-emits access_token with only { id } and does not touch any Shift', async () => {
    const user = buildMockUser()

    const req = buildMockRequest({ body: { mode: ContextMode.USER }, user: user as any })
    const res = buildMockResponse()

    await ContextController.select(req, res)

    expect(generateJWT).toHaveBeenCalledWith({ id: user._id })
    expect(res.cookie).toHaveBeenCalledWith('access_token', 'mock-token', expect.objectContaining({ httpOnly: true }))
    expect(Shift.findOne).not.toHaveBeenCalled()
    expect(Shift.create).not.toHaveBeenCalled()
    expect(closeBar).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('mode "cashier": validates the CASHIER BarUser, calls closeBar, opens a Shift and re-emits access_token with { id, barId, role }', async () => {
    const user = buildMockUser()
    const barId = new Types.ObjectId().toString()
    const barUser = buildMockBarUser({ role: BarUserRole.CASHIER })

    vi.mocked(BarUser.findOne).mockResolvedValue(barUser as any)
    vi.mocked(Shift.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      body: { mode: ContextMode.CASHIER, barId },
      user: user as any,
    })
    const res = buildMockResponse()

    await ContextController.select(req, res)

    expect(BarUser.findOne).toHaveBeenCalledWith({ bar: barId, user: user._id, role: BarUserRole.CASHIER })
    expect(closeBar).toHaveBeenCalledWith(barId, expect.objectContaining({ actorUserId: user._id }))
    expect(Shift.create).toHaveBeenCalledWith(
      expect.objectContaining({ bar: barId, user: user._id, role: BarUserRole.CASHIER })
    )
    expect(generateJWT).toHaveBeenCalledWith({ id: user._id, barId: expect.any(Types.ObjectId), role: BarUserRole.CASHIER })
    expect(res.cookie).toHaveBeenCalledWith('access_token', 'mock-token', expect.objectContaining({ httpOnly: true }))
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ role: BarUserRole.CASHIER, bar: barId }))
  })

  it('mode "owner": validates the OWNER BarUser and also opens a Shift (reuses the cashier flow)', async () => {
    const user = buildMockUser()
    const barId = new Types.ObjectId().toString()
    const barUser = buildMockBarUser({ role: BarUserRole.OWNER })

    vi.mocked(BarUser.findOne).mockResolvedValue(barUser as any)
    vi.mocked(Shift.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      body: { mode: ContextMode.OWNER, barId },
      user: user as any,
    })
    const res = buildMockResponse()

    await ContextController.select(req, res)

    expect(BarUser.findOne).toHaveBeenCalledWith({ bar: barId, user: user._id, role: BarUserRole.OWNER })
    expect(Shift.create).toHaveBeenCalledWith(
      expect.objectContaining({ bar: barId, user: user._id, role: BarUserRole.OWNER })
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ role: BarUserRole.OWNER }))
  })

  it('returns 403 when the user has no BarUser link with the requested role', async () => {
    const user = buildMockUser()
    const barId = new Types.ObjectId().toString()
    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const req = buildMockRequest({ body: { mode: ContextMode.CASHIER, barId }, user: user as any })
    const res = buildMockResponse()

    await ContextController.select(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(Shift.create).not.toHaveBeenCalled()
  })

  it('returns 401 when the BarUser is inactive', async () => {
    const user = buildMockUser()
    const barId = new Types.ObjectId().toString()
    const barUser = buildMockBarUser({ isActive: false })
    vi.mocked(BarUser.findOne).mockResolvedValue(barUser as any)

    const req = buildMockRequest({ body: { mode: ContextMode.CASHIER, barId }, user: user as any })
    const res = buildMockResponse()

    await ContextController.select(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(Shift.create).not.toHaveBeenCalled()
  })

  it('closes the previous active shift with KICKED_OUT before opening the new one', async () => {
    const user = buildMockUser()
    const barId = new Types.ObjectId().toString()
    const barUser = buildMockBarUser()
    const previousShift = {
      endedAt: undefined,
      endReason: undefined,
      deviceInfo: 'OLD-DEVICE',
      save: vi.fn().mockResolvedValue(true),
    }

    vi.mocked(BarUser.findOne).mockResolvedValue(barUser as any)
    vi.mocked(Shift.findOne).mockResolvedValue(previousShift as any)

    const req = buildMockRequest({ body: { mode: ContextMode.CASHIER, barId }, user: user as any })
    const res = buildMockResponse()

    await ContextController.select(req, res)

    expect(previousShift.endReason).toBe(ShiftEndReason.KICKED_OUT)
    expect(previousShift.endedAt).toBeInstanceOf(Date)
    expect(previousShift.save).toHaveBeenCalled()
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CASHIER_KICKED_OUT })
    )
    expect(Shift.create).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })
})

describe('ContextController.getOptions', () => {
  beforeEach(() => {
    vi.mocked(BarUser.find).mockReset()
  })

  it('returns user: true always plus the cashier/owner bars grouped by role', async () => {
    const user = buildMockUser()
    const cashierBarId = new Types.ObjectId()
    const ownerBarId = new Types.ObjectId()

    const populatedRows = [
      { role: BarUserRole.CASHIER, bar: { _id: cashierBarId, name: 'Bar Cajero' } },
      { role: BarUserRole.OWNER, bar: { _id: ownerBarId, name: 'Bar Dueño' } },
    ]

    vi.mocked(BarUser.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(populatedRows),
      }),
    } as any)

    const req = buildMockRequest({ user: user as any })
    const res = buildMockResponse()

    await ContextController.getOptions(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      user: true,
      cashier: [{ barId: cashierBarId.toString(), barName: 'Bar Cajero' }],
      owner: [{ barId: ownerBarId.toString(), barName: 'Bar Dueño' }],
    })
  })

  it('returns empty cashier/owner arrays when the user has no BarUser links', async () => {
    const user = buildMockUser()

    vi.mocked(BarUser.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    } as any)

    const req = buildMockRequest({ user: user as any })
    const res = buildMockResponse()

    await ContextController.getOptions(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ user: true, cashier: [], owner: [] })
  })
})
