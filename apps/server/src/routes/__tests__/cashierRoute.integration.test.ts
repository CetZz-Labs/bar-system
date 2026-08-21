import cookieParser from 'cookie-parser'
import express from 'express'
import http from 'node:http'
import jwt from 'jsonwebtoken'
import { Schema, Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import cashierRouter from '../cashierRoute'
import { BarUserRole } from '../../models/BarUser'
import { ShiftEndReason, ShiftSummaryStatus } from '../../models/Shift'

const modelMocks = vi.hoisted(() => ({
  userFindById: vi.fn(),
  userFindOne: vi.fn(),
  barUserFindOne: vi.fn(),
  barFindById: vi.fn(),
  shiftFindById: vi.fn(),
  shiftFindOne: vi.fn(),
  shiftFindOneAndUpdate: vi.fn(),
  auditCreate: vi.fn(),
}))

const summaryMocks = vi.hoisted(() => ({
  generateShiftSummary: vi.fn(),
}))

vi.mock('../../models/User', () => ({
  default: {
    findById: modelMocks.userFindById,
    findOne: modelMocks.userFindOne,
  },
  Role: {
    ADMIN: 'ADMIN',
    USER: 'USER',
    OWNER: 'OWNER',
    WAITER: 'WAITER',
  },
  MembershipRole: {
    ADMIN: 'ADMIN',
    MEMBER: 'MEMBER',
    LEADER: 'LEADER',
    CO_LEADER: 'CO_LEADER',
  },
}))

vi.mock('../../models/BarUser', () => ({
  default: { findOne: modelMocks.barUserFindOne },
  BarUserRole: { OWNER: 'OWNER', CASHIER: 'CASHIER' },
}))

vi.mock('../../models/Bar', () => ({
  default: { findById: modelMocks.barFindById },
  BarStatus: { PENDING: 'pending', ACTIVE: 'active', REJECTED: 'rejected' },
  attendancePointsByDaySchema: new Schema({
    monday: { type: Number, default: 0 },
    tuesday: { type: Number, default: 0 },
    wednesday: { type: Number, default: 0 },
    thursday: { type: Number, default: 0 },
    friday: { type: Number, default: 0 },
    saturday: { type: Number, default: 0 },
    sunday: { type: Number, default: 0 },
  }, { _id: false }),
}))

vi.mock('../../models/Shift', () => ({
  default: {
    findById: modelMocks.shiftFindById,
    findOne: modelMocks.shiftFindOne,
    findOneAndUpdate: modelMocks.shiftFindOneAndUpdate,
  },
  ShiftEndReason: { MANUAL: 'MANUAL', KICKED_OUT: 'KICKED_OUT', BAR_CLOSED: 'BAR_CLOSED' },
  ShiftSummaryStatus: { PENDING: 'PENDING', VIEWED: 'VIEWED' },
}))

vi.mock('../../models/AuditLog', () => ({
  default: { create: modelMocks.auditCreate },
  AuditAction: {
    CASHIER_LOGIN: 'CASHIER_LOGIN',
    CASHIER_LOGOUT: 'CASHIER_LOGOUT',
    CASHIER_KICKED_OUT: 'CASHIER_KICKED_OUT',
    SHIFT_AUTO_CLOSED: 'SHIFT_AUTO_CLOSED',
  },
}))

vi.mock('../../utils/shiftSummary', () => ({
  generateShiftSummary: summaryMocks.generateShiftSummary,
}))

// LB-66: el cierre de turnos/salidas vencidos vive en `closeBar` (desde el
// merge con development). El middleware solo lo invoca al detectar un turno
// vencido; acá lo neutralizamos y verificamos el envelope de auto-cierre.
vi.mock('../../utils/closeBar', () => ({
  closeBar: vi.fn().mockResolvedValue({ closedShifts: 1, closedOutings: 0 }),
}))

type Query<T> = Promise<T> & {
  select: ReturnType<typeof vi.fn>
  lean: ReturnType<typeof vi.fn>
  sort: ReturnType<typeof vi.fn>
}

function makeQuery<T>(value: T): Query<T> {
  const query = Promise.resolve(value) as Query<T>
  query.select = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(value)
  query.sort = vi.fn().mockResolvedValue(value)
  return query
}

type TestUser = {
  _id: Types.ObjectId
  isActive: boolean
  role: string
}

type TestMembership = {
  bar: Types.ObjectId
  user: Types.ObjectId
  role: BarUserRole
  isActive: boolean
}

type TestSummary = {
  status: ShiftSummaryStatus
  totalConsumptions: number
  confirmedConsumptions: number
  pendingConsumptions: number
  rejectedConsumptions: number
  disputedConsumptions: number
  totalAmount: number
  pointsAwarded: number
  redemptionCount: number
  redemptionsAvailable: boolean
  generatedAt: Date
}

type TestShift = {
  _id: Types.ObjectId
  bar: Types.ObjectId
  user: Types.ObjectId
  role: BarUserRole
  deviceInfo: string
  startedAt: Date
  endedAt?: Date
  endReason?: ShiftEndReason
  summary?: TestSummary
  save: ReturnType<typeof vi.fn>
}

const barA = new Types.ObjectId()
const barB = new Types.ObjectId()
const cashierA = new Types.ObjectId()
const cashierB = new Types.ObjectId()
const owner = new Types.ObjectId()
const unauthorized = new Types.ObjectId()

const users = new Map<string, TestUser>()
const memberships = new Map<string, TestMembership>()
const shifts = new Map<string, TestShift>()
const activeShifts = new Map<string, TestShift>()
const pendingShifts = new Map<string, TestShift>()

function membershipKey(bar: Types.ObjectId, user: Types.ObjectId): string {
  return `${bar.toString()}:${user.toString()}`
}

function addMembership(bar: Types.ObjectId, user: Types.ObjectId, role: BarUserRole): void {
  memberships.set(membershipKey(bar, user), {
    bar,
    user,
    role,
    isActive: true,
  })
}

function buildSummary(): TestSummary {
  return {
    status: ShiftSummaryStatus.PENDING,
    totalConsumptions: 2,
    confirmedConsumptions: 1,
    pendingConsumptions: 1,
    rejectedConsumptions: 0,
    disputedConsumptions: 0,
    totalAmount: 2500,
    pointsAwarded: 4,
    redemptionCount: 0,
    redemptionsAvailable: false,
    generatedAt: new Date('2026-08-18T06:00:00.000Z'),
  }
}

function buildShift(
  bar: Types.ObjectId,
  user: Types.ObjectId,
  overrides: Partial<TestShift> = {},
): TestShift {
  const shift: TestShift = {
    _id: new Types.ObjectId(),
    bar,
    user,
    role: BarUserRole.CASHIER,
    deviceInfo: 'POS-INTEGRATION',
    startedAt: new Date('2026-08-17T20:00:00.000Z'),
    endedAt: new Date('2026-08-18T06:00:00.000Z'),
    endReason: ShiftEndReason.MANUAL,
    summary: buildSummary(),
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
  shifts.set(shift._id.toString(), shift)
  return shift
}

// Cookie única `access_token` (LB-66 — unified cookie). El contexto de
// cajero/dueño se guarda en el mismo cookie que la sesión de usuario; lo que
// cambia son los claims del JWT (barId + role).
function cashierCookie(user: Types.ObjectId, bar: Types.ObjectId, shiftId?: Types.ObjectId): string {
  const token = jwt.sign(
    {
      id: user.toString(),
      barId: bar.toString(),
      role: BarUserRole.CASHIER,
      ...(shiftId ? { shiftId: shiftId.toString() } : {}),
    },
    process.env.JWT_SECRET as string,
  )
  return `access_token=${token}`
}

function ownerCookie(user: Types.ObjectId, bar: Types.ObjectId): string {
  const token = jwt.sign(
    { id: user.toString(), barId: bar.toString(), role: BarUserRole.OWNER },
    process.env.JWT_SECRET as string,
  )
  return `access_token=${token}`
}

// Token con claim de bar pero sin membresía válida (para casos 403).
function userCookie(user: Types.ObjectId, bar: Types.ObjectId): string {
  const token = jwt.sign({ id: user.toString(), barId: bar.toString() }, process.env.JWT_SECRET as string)
  return `access_token=${token}`
}

let server: http.Server
let baseUrl = ''

async function request(path: string, cookie: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: { Cookie: cookie },
  })
}

async function post(path: string, cookie: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { Cookie: cookie },
  })
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>
}

beforeAll(async () => {
  const app = express()
  app.use(cookieParser())
  app.use(express.json())
  app.use('/api/cashier', cashierRouter)

  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Integration server did not expose a TCP address')
  }
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  users.clear()
  memberships.clear()
  shifts.clear()
  activeShifts.clear()
  pendingShifts.clear()

  users.set(cashierA.toString(), { _id: cashierA, isActive: true, role: 'USER' })
  users.set(cashierB.toString(), { _id: cashierB, isActive: true, role: 'USER' })
  users.set(owner.toString(), { _id: owner, isActive: true, role: 'USER' })
  users.set(unauthorized.toString(), { _id: unauthorized, isActive: true, role: 'USER' })

  addMembership(barA, cashierA, BarUserRole.CASHIER)
  addMembership(barB, cashierA, BarUserRole.CASHIER)
  addMembership(barA, cashierB, BarUserRole.CASHIER)
  addMembership(barA, owner, BarUserRole.OWNER)

  modelMocks.userFindById.mockImplementation((id: unknown) =>
    makeQuery(users.get(String(id)) ?? null))
  modelMocks.barUserFindOne.mockImplementation((filter: Record<string, unknown>) => {
    const bar = new Types.ObjectId(String(filter.bar))
    const user = new Types.ObjectId(String(filter.user))
    return makeQuery(memberships.get(membershipKey(bar, user)) ?? null)
  })
  modelMocks.barFindById.mockImplementation((id: unknown) =>
    makeQuery({ _id: new Types.ObjectId(String(id)), closingTime: '06:00' }))
  modelMocks.shiftFindById.mockImplementation((id: unknown) =>
    makeQuery(shifts.get(String(id)) ?? null))
  modelMocks.shiftFindOne.mockImplementation((filter: Record<string, unknown>) => {
    const bar = new Types.ObjectId(String(filter.bar))
    const user = new Types.ObjectId(String(filter.user))
    const key = membershipKey(bar, user)

    if (filter.endedAt === null) return makeQuery(activeShifts.get(key) ?? null)
    if (filter['summary.status'] === ShiftSummaryStatus.PENDING) {
      return makeQuery(pendingShifts.get(key) ?? null)
    }
    return makeQuery(null)
  })
  modelMocks.auditCreate.mockResolvedValue({})
  summaryMocks.generateShiftSummary.mockImplementation(async (shiftId: string) => {
    const shift = shifts.get(shiftId)
    if (!shift) throw new Error('Shift not found')
    if (!shift.summary) shift.summary = buildSummary()
    return shift.summary
  })
})

describe('cashierRoute real HTTP session integration', () => {
  it('allows a CASHIER to retrieve their own JSON, PDF, and CSV summary', async () => {
    const shift = buildShift(barA, cashierA)
    const cookie = cashierCookie(cashierA, barA)

    const summaryResponse = await request(`/api/cashier/shifts/${shift._id}/summary`, cookie)
    const summaryBody = await jsonBody(summaryResponse)
    expect(summaryResponse.status).toBe(200)
    expect(summaryBody.shiftId).toBe(shift._id.toString())

    const csvResponse = await request(`/api/cashier/shifts/${shift._id}/summary/csv`, cookie)
    expect(csvResponse.status).toBe(200)
    expect(csvResponse.headers.get('content-type')).toContain('text/csv')
    expect(await csvResponse.text()).toContain(shift._id.toString())

    const pdfResponse = await request(`/api/cashier/shifts/${shift._id}/summary/pdf`, cookie)
    expect(pdfResponse.status).toBe(200)
    expect(pdfResponse.headers.get('content-type')).toContain('application/pdf')
    expect(Buffer.from(await pdfResponse.arrayBuffer()).subarray(0, 8).toString()).toBe('%PDF-1.4')
  })

  it('rejects a CASHIER trying to retrieve another CASHIER shift', async () => {
    const foreignShift = buildShift(barA, cashierB)
    const response = await request(
      `/api/cashier/shifts/${foreignShift._id}/summary`,
      cashierCookie(cashierA, barA),
    )

    expect(response.status).toBe(403)
  })

  it('allows an OWNER generic authenticated session to retrieve a shift summary', async () => {
    const shift = buildShift(barA, cashierA)
    const response = await request(`/api/cashier/shifts/${shift._id}/summary`, ownerCookie(owner, barA))

    expect(response.status).toBe(200)
    expect((await jsonBody(response)).shiftId).toBe(shift._id.toString())
  })

  it('rejects an authenticated user without authorization for the shift bar', async () => {
    const shift = buildShift(barA, cashierA)
    const response = await request(
      `/api/cashier/shifts/${shift._id}/summary`,
      userCookie(unauthorized, barA),
    )

    expect(response.status).toBe(403)
  })

  it('isolates pending summaries by both authenticated user and bar', async () => {
    const cashierAPendingBarA = buildShift(barA, cashierA, {
      endReason: ShiftEndReason.BAR_CLOSED,
    })
    const cashierAPendingBarB = buildShift(barB, cashierA, {
      endReason: ShiftEndReason.BAR_CLOSED,
    })
    const cashierBPendingBarA = buildShift(barA, cashierB, {
      endReason: ShiftEndReason.BAR_CLOSED,
    })
    pendingShifts.set(membershipKey(barA, cashierA), cashierAPendingBarA)
    pendingShifts.set(membershipKey(barB, cashierA), cashierAPendingBarB)
    pendingShifts.set(membershipKey(barA, cashierB), cashierBPendingBarA)

    const ownBarAResponse = await request(
      '/api/cashier/shifts/pending-summary',
      cashierCookie(cashierA, barA),
    )
    const ownBarBResponse = await request(
      '/api/cashier/shifts/pending-summary',
      cashierCookie(cashierA, barB),
    )
    const otherUserResponse = await request(
      '/api/cashier/shifts/pending-summary',
      cashierCookie(cashierB, barA),
    )

    expect(ownBarAResponse.status).toBe(200)
    expect((await jsonBody(ownBarAResponse)).shiftId).toBe(cashierAPendingBarA._id.toString())
    expect(ownBarBResponse.status).toBe(200)
    expect((await jsonBody(ownBarBResponse)).shiftId).toBe(cashierAPendingBarB._id.toString())
    expect(otherUserResponse.status).toBe(200)
    expect((await jsonBody(otherUserResponse)).shiftId).toBe(cashierBPendingBarA._id.toString())
  })

  it('returns auto-close through the session and reuses the same cookie for summary exports', async () => {
    const autoClosedShift = buildShift(barA, cashierA, {
      startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      endedAt: undefined,
      endReason: undefined,
    })
    activeShifts.set(membershipKey(barA, cashierA), autoClosedShift)
    const cookie = cashierCookie(cashierA, barA)

    const sessionResponse = await request('/api/cashier/session', cookie)
    const sessionBody = await jsonBody(sessionResponse)
    expect(sessionResponse.status).toBe(401)
    expect(sessionBody.code).toBe('SHIFT_AUTO_CLOSED')
    expect(sessionBody.shiftId).toBe(autoClosedShift._id.toString())
    expect(sessionBody.summary).toEqual(expect.objectContaining({
      status: ShiftSummaryStatus.PENDING,
      redemptionsAvailable: false,
    }))
    expect(sessionResponse.headers.get('set-cookie')).toBeNull()

    const summaryResponse = await request(
      `/api/cashier/shifts/${autoClosedShift._id}/summary`,
      cookie,
    )
    const csvResponse = await request(
      `/api/cashier/shifts/${autoClosedShift._id}/summary/csv`,
      cookie,
    )
    const pdfResponse = await request(
      `/api/cashier/shifts/${autoClosedShift._id}/summary/pdf`,
      cookie,
    )
    expect(summaryResponse.status).toBe(200)
    expect(csvResponse.status).toBe(200)
    expect(pdfResponse.status).toBe(200)

    const otherUserResponse = await request(
      `/api/cashier/shifts/${autoClosedShift._id}/summary`,
      cashierCookie(cashierB, barA),
    )
    expect(otherUserResponse.status).toBe(403)
  })

  it('allows the same cashier session to retry manual close without duplicating effects', async () => {
    const shift = buildShift(barA, cashierA, {
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      endedAt: undefined,
      endReason: undefined,
      summary: undefined,
    })
    const cookie = cashierCookie(cashierA, barA, shift._id)

    const firstResponse = await post('/api/cashier/shift/close', cookie)
    const firstBody = await jsonBody(firstResponse)
    const secondResponse = await post('/api/cashier/shift/close', cookie)
    const secondBody = await jsonBody(secondResponse)

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(200)
    expect(firstBody.shiftId).toBe(shift._id.toString())
    expect(secondBody.shiftId).toBe(firstBody.shiftId)
    expect(secondBody.summary).toEqual(firstBody.summary)
    const firstSummary = firstBody.summary as Record<string, unknown>
    expect(shift.summary).toEqual(expect.objectContaining({
      totalConsumptions: firstSummary.totalConsumptions,
      generatedAt: new Date(String(firstSummary.generatedAt)),
    }))
    expect(shift.endReason).toBe(ShiftEndReason.MANUAL)
    expect(shift.save).toHaveBeenCalledTimes(1)
    expect(modelMocks.auditCreate).toHaveBeenCalledTimes(1)

    const otherCashierResponse = await post(
      '/api/cashier/shift/close',
      cashierCookie(cashierB, barA, shift._id),
    )
    const otherBarResponse = await post(
      '/api/cashier/shift/close',
      cashierCookie(cashierA, barB, shift._id),
    )

    expect(otherCashierResponse.status).toBe(403)
    expect(otherBarResponse.status).toBe(403)
    expect(modelMocks.auditCreate).toHaveBeenCalledTimes(1)
  })
})
