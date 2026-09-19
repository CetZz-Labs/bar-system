import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import mongoose from 'mongoose'
import { CashierManagementController } from '../../controllers/CashierManagementController'
import BarUser, { BarUserRole } from '../../models/BarUser'
import User from '../../models/User'
import Bar from '../../models/Bar'
import Token from '../../models/Token'
import { AuthEmail } from '../../emails/AuthEmail'
import { writeAuditLog } from '../../utils/auditLogService'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

vi.mock('../../models/BarUser', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
  BarUserRole: {
    OWNER: 'OWNER',
    CASHIER: 'CASHIER',
  },
}))

vi.mock('../../models/User', () => ({
  default: {
    findOne: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('../../models/Bar', () => ({
  default: {
    findById: vi.fn(),
  },
}))

let lastCreatedToken: any = null
vi.mock('../../models/Token', () => {
  function MockToken() {
    const instance = {
      token: undefined,
      user: undefined,
      save: vi.fn().mockResolvedValue(true),
    }
    lastCreatedToken = instance
    return instance
  }
  return { default: MockToken }
})

vi.mock('../../emails/AuthEmail', () => ({
  AuthEmail: {
    sendCashierInviteEmail: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../utils/auditLogService', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>()
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: vi.fn(),
    },
  }
})

function buildMockSession() {
  return {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn(),
    inTransaction: vi.fn().mockReturnValue(true),
  }
}

function buildSelectLeanQuery(data: unknown) {
  const query: Record<string, unknown> = {}
  query.select = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(data)
  return query
}

function buildSelectQuery(data: unknown) {
  return { select: vi.fn().mockResolvedValue(data) }
}

function buildPopulateSortLeanQuery(data: unknown) {
  const query: Record<string, unknown> = {}
  query.populate = vi.fn().mockReturnValue(query)
  query.sort = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(data)
  return query
}

beforeEach(() => {
  vi.mocked(BarUser.find).mockReset()
  vi.mocked(BarUser.findOne).mockReset()
  vi.mocked(BarUser.create).mockReset()
  vi.mocked(User.findOne).mockReset()
  vi.mocked(User.findById).mockReset()
  vi.mocked(User.create).mockReset()
  vi.mocked(Bar.findById).mockReset()
  vi.mocked(AuthEmail.sendCashierInviteEmail).mockClear()
  vi.mocked(writeAuditLog).mockReset()
  vi.mocked(mongoose.startSession).mockReset()
  lastCreatedToken = null
})

describe('CashierManagementController.listCashiers', () => {
  it('returns 200 with mapped cashiers for the OWNER', async () => {
    const ownerId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const barUserId = new Types.ObjectId()
    const cashierUserId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(BarUser.find).mockReturnValue(
      buildPopulateSortLeanQuery([
        {
          _id: barUserId,
          bar: barId,
          role: BarUserRole.CASHIER,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { _id: cashierUserId, name: 'Juan', lastName: 'Perez', email: 'juan@example.com', isActive: true },
        },
      ]) as any
    )

    const req = buildMockRequest({ user: { _id: ownerId } as any, params: { barId: barId.toString() } })
    const res = buildMockResponse()

    await CashierManagementController.listCashiers(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        id: barUserId.toString(),
        isActive: true,
        user: expect.objectContaining({ email: 'juan@example.com', accountActive: true }),
      }),
    ])
  })

  it('returns 403 when the requester is a CASHIER, not an OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { barId: barId.toString() } })
    const res = buildMockResponse()

    await CashierManagementController.listCashiers(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(BarUser.find).not.toHaveBeenCalled()
  })
})

describe('CashierManagementController.createCashier', () => {
  const validBody = { name: 'Juan', lastName: 'Perez', email: 'juan@example.com' }

  it('returns 403 when the requester is a CASHIER, not an OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { barId: barId.toString() }, body: validBody })
    const res = buildMockResponse()

    await CashierManagementController.createCashier(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(User.findOne).not.toHaveBeenCalled()
  })

  it('returns 404 when the bar does not exist', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockReturnValue(buildSelectLeanQuery(null) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { barId: barId.toString() }, body: validBody })
    const res = buildMockResponse()

    await CashierManagementController.createCashier(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('links an existing User to the bar as CASHIER without recreating it', async () => {
    const ownerId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const existingUserId = new Types.ObjectId()
    const barUserId = new Types.ObjectId()

    vi.mocked(BarUser.findOne)
      .mockResolvedValueOnce({ role: BarUserRole.OWNER } as any) // resolveOwnerAccess
      .mockResolvedValueOnce(null) // existingBarUser check

    vi.mocked(Bar.findById).mockReturnValue(buildSelectLeanQuery({ name: 'Bar de Prueba' }) as any)
    vi.mocked(User.findOne).mockResolvedValue({
      _id: existingUserId,
      name: 'Juan',
      lastName: 'Perez',
      email: 'juan@example.com',
      isActive: true,
    } as any)
    vi.mocked(BarUser.create).mockResolvedValue({
      _id: barUserId,
      bar: barId,
      user: existingUserId,
      role: BarUserRole.CASHIER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const req = buildMockRequest({ user: { _id: ownerId } as any, params: { barId: barId.toString() }, body: validBody })
    const res = buildMockResponse()

    await CashierManagementController.createCashier(req, res)

    expect(User.create).not.toHaveBeenCalled()
    expect(mongoose.startSession).not.toHaveBeenCalled()
    expect(BarUser.create).toHaveBeenCalledWith(
      expect.objectContaining({ bar: barId.toString(), user: existingUserId, role: BarUserRole.CASHIER, isActive: true })
    )
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'cashier.created', actorType: 'OWNER' })
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('returns 409 when the existing User already has a BarUser for this bar', async () => {
    const ownerId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const existingUserId = new Types.ObjectId()

    vi.mocked(BarUser.findOne)
      .mockResolvedValueOnce({ role: BarUserRole.OWNER } as any)
      .mockResolvedValueOnce({ _id: new Types.ObjectId() } as any)

    vi.mocked(Bar.findById).mockReturnValue(buildSelectLeanQuery({ name: 'Bar de Prueba' }) as any)
    vi.mocked(User.findOne).mockResolvedValue({ _id: existingUserId, email: 'juan@example.com' } as any)

    const req = buildMockRequest({ user: { _id: ownerId } as any, params: { barId: barId.toString() }, body: validBody })
    const res = buildMockResponse()

    await CashierManagementController.createCashier(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(BarUser.create).not.toHaveBeenCalled()
  })

  it('creates a new User (isActive:false) + BarUser in the same transaction and sends the invite email when no User exists for the email', async () => {
    const ownerId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const newUserId = new Types.ObjectId()
    const barUserId = new Types.ObjectId()
    const mockSession = buildMockSession()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockReturnValue(buildSelectLeanQuery({ name: 'Bar de Prueba' }) as any)
    vi.mocked(User.findOne).mockResolvedValue(null)
    vi.mocked(mongoose.startSession).mockResolvedValue(mockSession as any)
    vi.mocked(User.create).mockResolvedValue([{
      _id: newUserId,
      name: 'Juan',
      lastName: 'Perez',
      email: 'juan@example.com',
      isActive: false,
    }] as any)
    vi.mocked(BarUser.create).mockResolvedValue([{
      _id: barUserId,
      bar: barId,
      user: newUserId,
      role: BarUserRole.CASHIER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }] as any)

    const req = buildMockRequest({ user: { _id: ownerId } as any, params: { barId: barId.toString() }, body: validBody })
    const res = buildMockResponse()

    await CashierManagementController.createCashier(req, res)

    expect(User.create).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'Juan', lastName: 'Perez', email: 'juan@example.com', isActive: false })],
      { session: mockSession }
    )
    expect(User.create).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ password: undefined })]),
      expect.anything()
    )
    expect(BarUser.create).toHaveBeenCalledWith(
      [expect.objectContaining({ bar: barId.toString(), user: newUserId, role: BarUserRole.CASHIER, isActive: true })],
      { session: mockSession }
    )
    expect(mockSession.commitTransaction).toHaveBeenCalled()
    expect(mockSession.endSession).toHaveBeenCalled()

    expect(lastCreatedToken.user).toBe(newUserId)
    expect(lastCreatedToken.token).toEqual(expect.any(String))
    expect(AuthEmail.sendCashierInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'juan@example.com', name: 'Juan', barName: 'Bar de Prueba' })
    )
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'cashier.created', metadata: expect.objectContaining({ newAccount: true }) })
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('aborts the transaction and propagates the error when User.create fails', async () => {
    const ownerId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const mockSession = buildMockSession()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockReturnValue(buildSelectLeanQuery({ name: 'Bar de Prueba' }) as any)
    vi.mocked(User.findOne).mockResolvedValue(null)
    vi.mocked(mongoose.startSession).mockResolvedValue(mockSession as any)
    vi.mocked(User.create).mockRejectedValue(new Error('boom'))

    const req = buildMockRequest({ user: { _id: ownerId } as any, params: { barId: barId.toString() }, body: validBody })
    const res = buildMockResponse()

    await expect(CashierManagementController.createCashier(req, res)).rejects.toThrow('boom')

    expect(mockSession.abortTransaction).toHaveBeenCalled()
    expect(mockSession.endSession).toHaveBeenCalled()
    expect(BarUser.create).not.toHaveBeenCalled()
  })
})

describe('CashierManagementController.updateCashier', () => {
  it('toggles isActive and returns 200', async () => {
    const ownerId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const barUserId = new Types.ObjectId()
    const cashierUserId = new Types.ObjectId()
    const mockBarUser = {
      _id: barUserId,
      bar: barId,
      user: cashierUserId,
      role: BarUserRole.CASHIER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      save: vi.fn().mockResolvedValue(true),
    }

    vi.mocked(BarUser.findOne)
      .mockResolvedValueOnce({ role: BarUserRole.OWNER } as any) // resolveOwnerAccess
      .mockResolvedValueOnce(mockBarUser as any) // BarUser.findOne by _id/bar/role

    vi.mocked(User.findById).mockReturnValue(
      buildSelectQuery({ _id: cashierUserId, name: 'Juan', lastName: 'Perez', email: 'juan@example.com', isActive: true }) as any
    )

    const req = buildMockRequest({
      user: { _id: ownerId } as any,
      params: { barId: barId.toString(), cashierId: barUserId.toString() },
      body: { isActive: false },
    })
    const res = buildMockResponse()

    await CashierManagementController.updateCashier(req, res)

    expect(mockBarUser.isActive).toBe(false)
    expect(mockBarUser.save).toHaveBeenCalled()
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'cashier.edited', actorType: 'OWNER' })
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns 404 when the BarUser does not exist for this bar', async () => {
    const ownerId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const cashierId = new Types.ObjectId()

    vi.mocked(BarUser.findOne)
      .mockResolvedValueOnce({ role: BarUserRole.OWNER } as any)
      .mockResolvedValueOnce(null)

    const req = buildMockRequest({
      user: { _id: ownerId } as any,
      params: { barId: barId.toString(), cashierId: cashierId.toString() },
      body: { isActive: false },
    })
    const res = buildMockResponse()

    await CashierManagementController.updateCashier(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 403 when the requester is a CASHIER, not an OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const cashierId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), cashierId: cashierId.toString() },
      body: { isActive: false },
    })
    const res = buildMockResponse()

    await CashierManagementController.updateCashier(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })
})
